// Every payment provider (Selcom today, AzamPay or others later) implements
// this interface. Nothing outside src/providers/ knows about Selcom-
// specific field names, endpoints or signing — the payment engine, ledger,
// checkout and dashboard only ever see the shapes defined here.
//
// A concrete provider's createPayment/checkPaymentStatus/refundPayment
// methods must map their raw provider response into:
//   { providerReference, status: 'PENDING'|'PROCESSING'|'SUCCESS'|'FAILED', raw }
// where `raw` is the provider's response, stored for support debugging but
// never interpreted outside the adapter.
export class PaymentProvider {
  /** @returns {string} unique provider key, e.g. "selcom" */
  get key() {
    throw new Error("PaymentProvider.key must be implemented")
  }

  /** @returns {string[]} capability tags, e.g. ["payments", "refunds", "status_check"] */
  get capabilities() {
    return []
  }

  async createPayment(_params) {
    throw new Error(`${this.key}: createPayment not implemented`)
  }

  async checkPaymentStatus(_providerReference) {
    throw new Error(`${this.key}: checkPaymentStatus not implemented`)
  }

  async cancelPayment(_providerReference) {
    throw new Error(`${this.key}: cancelPayment not implemented`)
  }

  async refundPayment(_params) {
    throw new Error(`${this.key}: refundPayment not implemented`)
  }

  /**
   * Collects payment details (e.g. a mobile money phone number) on an
   * already-created order, for checkout flows that don't have the
   * customer's phone at payment-creation time. Default: unsupported, the
   * order must already carry everything it needs.
   */
  async collectPayment(_providerReference, _details) {
    throw new Error(`${this.key}: collectPayment not implemented`)
  }

  /** Verifies an inbound callback's authenticity. Must not throw on bad input. */
  verifyCallback(_headers, _rawBody) {
    throw new Error(`${this.key}: verifyCallback not implemented`)
  }

  /** Parses a verified callback body into the common shape used by the webhook processor. */
  parseWebhook(_body) {
    throw new Error(`${this.key}: parseWebhook not implemented`)
  }
}
