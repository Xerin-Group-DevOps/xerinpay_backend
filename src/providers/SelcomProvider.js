import crypto from "node:crypto"
import { PaymentProvider } from "./PaymentProvider.js"
import { toMajorUnitsString } from "../utils/money.js"

// Selcom Pay (Tanzania) adapter. Signing scheme per developers.selcommobile.com:
//   Authorization: SELCOM <base64(apiKey)>
//   Timestamp: ISO-8601
//   Digest-Method: HS256
//   Digest: base64(HMAC_SHA256(signing_string, apiSecret))
//   Signed-Fields: comma-separated field names, in signing_string order
// where signing_string = "timestamp=<ts>&field1=<v1>&field2=<v2>...".
//
// The refund endpoint's exact field names were not available in the public
// docs excerpt used to build this adapter; it follows the same request/
// signing shape as the rest of the API and is flagged for verification
// against a live Selcom sandbox account before production use — see
// SECURITY.md / DEPLOYMENT.md.
export class SelcomProvider extends PaymentProvider {
  constructor({ apiBaseUrl, apiKey, apiSecret, merchantId, fetchImpl = fetch, timeoutMs = 15_000 }) {
    super()
    this.apiBaseUrl = apiBaseUrl
    this.apiKey = apiKey
    this.apiSecret = apiSecret
    this.merchantId = merchantId
    this.fetchImpl = fetchImpl
    this.timeoutMs = timeoutMs
  }

  get key() {
    return "selcom"
  }

  get capabilities() {
    return ["payments", "status_check", "callbacks", "mobile_money_push"]
  }

  buildSignedHeaders(fields) {
    const timestamp = new Date().toISOString()
    const orderedKeys = Object.keys(fields)
    const signingString = [`timestamp=${timestamp}`, ...orderedKeys.map((k) => `${k}=${fields[k]}`)].join("&")
    const digest = crypto.createHmac("sha256", this.apiSecret).update(signingString).digest("base64")

    return {
      "Content-Type": "application/json",
      Authorization: `SELCOM ${Buffer.from(this.apiKey).toString("base64")}`,
      Timestamp: timestamp,
      "Digest-Method": "HS256",
      Digest: digest,
      "Signed-Fields": orderedKeys.join(","),
    }
  }

  async request(method, path, fields, body) {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs)
    try {
      const response = await this.fetchImpl(`${this.apiBaseUrl}${path}`, {
        method,
        headers: this.buildSignedHeaders(fields),
        body: body ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      })
      const json = await response.json().catch(() => ({}))
      return { httpStatus: response.status, body: json }
    } finally {
      clearTimeout(timeout)
    }
  }

  mapResultCodeToStatus(resultCode) {
    if (resultCode === "000") return "SUCCESS"
    if (resultCode === undefined || resultCode === null) return "PENDING"
    return "FAILED"
  }

  async createPayment({ orderId, amountMinor, currency, customerName, customerEmail, customerPhone, description }) {
    const amount = toMajorUnitsString(amountMinor, currency)
    const fields = {
      vendor: this.merchantId,
      order_id: orderId,
      buyer_email: customerEmail || "customer@xerinpay.example",
      buyer_name: customerName || "XerinPay Customer",
      buyer_phone: customerPhone || "",
      amount,
      currency,
      buyer_remarks: description || "Payment via XerinPay",
      merchant_remarks: description || "Payment via XerinPay",
      no_of_items: "1",
    }

    const { httpStatus, body } = await this.request("POST", "/v1/checkout/create-order-minimal", fields, fields)

    if (httpStatus >= 500) {
      return { providerReference: orderId, status: "PENDING", raw: body, providerUnavailable: true }
    }

    const status = this.mapResultCodeToStatus(body.resultcode)

    // For mobile money, trigger the USSD push so the customer gets a PIN
    // prompt immediately after order creation.
    if (customerPhone && status !== "FAILED") {
      await this.pushUssd({ orderId, phone: customerPhone, amount })
    }

    return { providerReference: orderId, status: status === "SUCCESS" ? "PROCESSING" : status, raw: body }
  }

  async collectPayment(orderId, { phone, amountMinor, currency }) {
    const amount = toMajorUnitsString(amountMinor, currency)
    const { body } = await this.pushUssd({ orderId, phone, amount })
    return { providerReference: orderId, status: "PROCESSING", raw: body }
  }

  async pushUssd({ orderId, phone, amount }) {
    const fields = { order_id: orderId, msisdn: phone, amount }
    return this.request("POST", "/v1/wallet/pushussd", fields, fields)
  }

  async checkPaymentStatus(orderId) {
    const fields = { order_id: orderId }
    const { body } = await this.request("GET", `/v1/checkout/order-status?order_id=${encodeURIComponent(orderId)}`, fields)
    return { providerReference: orderId, status: this.mapResultCodeToStatus(body?.data?.[0]?.resultcode ?? body?.resultcode), raw: body }
  }

  async cancelPayment(orderId) {
    const fields = { order_id: orderId }
    const { body } = await this.request("POST", "/v1/checkout/cancel-order", fields, fields)
    return { providerReference: orderId, status: "FAILED", raw: body }
  }

  async refundPayment({ orderId, amountMinor, currency }) {
    const fields = { order_id: orderId, amount: toMajorUnitsString(amountMinor, currency) }
    const { body } = await this.request("POST", "/v1/checkout/refund-order", fields, fields)
    return { providerReference: orderId, status: this.mapResultCodeToStatus(body?.resultcode), raw: body }
  }

  verifyCallback(headers, rawBody) {
    try {
      const digest = headers["digest"]
      const timestamp = headers["timestamp"]
      const signedFields = (headers["signed-fields"] || "").split(",").filter(Boolean)
      if (!digest || !timestamp || signedFields.length === 0) return false

      const parsed = JSON.parse(rawBody)
      const signingString = [`timestamp=${timestamp}`, ...signedFields.map((f) => `${f}=${parsed[f]}`)].join("&")
      const expected = crypto.createHmac("sha256", this.apiSecret).update(signingString).digest("base64")
      const expectedBuf = Buffer.from(expected)
      const actualBuf = Buffer.from(digest)
      return expectedBuf.length === actualBuf.length && crypto.timingSafeEqual(expectedBuf, actualBuf)
    } catch {
      return false
    }
  }

  parseWebhook(body) {
    return {
      providerReference: body.order_id,
      status: this.mapResultCodeToStatus(body.payment_status === "COMPLETED" ? "000" : body.resultcode),
      amountMinor: undefined,
      raw: body,
    }
  }
}
