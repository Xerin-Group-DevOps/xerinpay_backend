import { PaymentProvider } from "./PaymentProvider.js"

// The sandbox provider never talks to a real network endpoint. Outcome is
// controlled by `metadata.sandbox_outcome` on payment creation: SUCCESS
// (default), FAILED, PENDING, or TIMEOUT — matching the four states
// developers need to exercise (see guide.md #41). PENDING orders sit
// unresolved until a developer calls POST
// /v1/sandbox/payments/:orderId/simulate, mirroring how a real provider's
// async webhook eventually arrives. State is in-memory only — this is
// sandbox tooling, not a persistence layer, and is documented as such in
// TESTING.md.
const pendingOrders = new Map()

export class SandboxProvider extends PaymentProvider {
  get key() {
    return "sandbox"
  }

  get capabilities() {
    return ["payments", "refunds", "status_check", "callbacks"]
  }

  async createPayment({ orderId, sandboxOutcome = "SUCCESS" }) {
    if (sandboxOutcome === "TIMEOUT") {
      return { providerReference: orderId, status: "PENDING", raw: { simulated: true, outcome: "TIMEOUT" }, providerUnavailable: true }
    }
    if (sandboxOutcome === "FAILED") {
      return { providerReference: orderId, status: "FAILED", raw: { simulated: true, outcome: "FAILED" } }
    }
    if (sandboxOutcome === "PENDING") {
      pendingOrders.set(orderId, "PENDING")
      return { providerReference: orderId, status: "PENDING", raw: { simulated: true, outcome: "PENDING" } }
    }
    return { providerReference: orderId, status: "SUCCESS", raw: { simulated: true, outcome: "SUCCESS" } }
  }

  async checkPaymentStatus(orderId) {
    const status = pendingOrders.get(orderId) || "PENDING"
    return { providerReference: orderId, status, raw: { simulated: true } }
  }

  async cancelPayment(orderId) {
    pendingOrders.delete(orderId)
    return { providerReference: orderId, status: "FAILED", raw: { simulated: true, outcome: "CANCELLED" } }
  }

  async collectPayment(orderId) {
    const current = pendingOrders.get(orderId)
    if (current === "PENDING") return { providerReference: orderId, status: "PROCESSING", raw: { simulated: true } }
    return { providerReference: orderId, status: current || "SUCCESS", raw: { simulated: true } }
  }

  async refundPayment({ orderId }) {
    return { providerReference: orderId, status: "SUCCESS", raw: { simulated: true } }
  }

  /** Sandbox-only: manually resolve a PENDING simulated order. */
  resolvePendingOrder(orderId, outcome) {
    pendingOrders.set(orderId, outcome)
    return { providerReference: orderId, status: outcome, raw: { simulated: true, outcome } }
  }

  verifyCallback() {
    return true
  }

  parseWebhook(body) {
    return { providerReference: body.order_id, status: body.status, raw: body }
  }
}

export const sandboxProvider = new SandboxProvider()
