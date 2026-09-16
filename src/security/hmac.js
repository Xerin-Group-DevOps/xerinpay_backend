import crypto from "node:crypto"

// Outbound merchant webhook signing: XerinPay-Signature header carries
// `t=<unix_ms>,v1=<hex hmac>` over `${timestamp}.${rawBody}`, the same
// scheme Stripe/similar providers use, so merchants can verify with any
// off-the-shelf HMAC helper and reject replays via the timestamp.
export function signWebhookPayload(secret, timestamp, rawBody) {
  const signedPayload = `${timestamp}.${rawBody}`
  return crypto.createHmac("sha256", secret).update(signedPayload).digest("hex")
}

export function buildSignatureHeader(secret, rawBody) {
  const timestamp = Date.now()
  const signature = signWebhookPayload(secret, timestamp, rawBody)
  return `t=${timestamp},v1=${signature}`
}

export function verifySignatureHeader(secret, header, rawBody, toleranceMs = 5 * 60 * 1000) {
  const parts = Object.fromEntries(
    header.split(",").map((part) => part.split("=")),
  )
  const timestamp = Number(parts.t)
  if (!timestamp || Math.abs(Date.now() - timestamp) > toleranceMs) return false
  const expected = signWebhookPayload(secret, timestamp, rawBody)
  const expectedBuf = Buffer.from(expected, "hex")
  const actualBuf = Buffer.from(parts.v1 || "", "hex")
  if (expectedBuf.length !== actualBuf.length) return false
  return crypto.timingSafeEqual(expectedBuf, actualBuf)
}

// Inbound signed-request verification for sensitive API calls (credential
// ID + timestamp + nonce + method + path + body hash -> HMAC). Nonce reuse
// is rejected by the caller via a short-lived nonce cache.
export function verifySignedRequest({ secret, timestamp, nonce, method, path, bodyHash, signature }) {
  if (!timestamp || Math.abs(Date.now() - Number(timestamp)) > 5 * 60 * 1000) return false
  const base = `${timestamp}.${nonce}.${method.toUpperCase()}.${path}.${bodyHash}`
  const expected = crypto.createHmac("sha256", secret).update(base).digest("hex")
  const expectedBuf = Buffer.from(expected, "hex")
  const actualBuf = Buffer.from(signature || "", "hex")
  if (expectedBuf.length !== actualBuf.length) return false
  return crypto.timingSafeEqual(expectedBuf, actualBuf)
}

export function sha256Hex(input) {
  return crypto.createHash("sha256").update(input).digest("hex")
}
