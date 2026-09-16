import { serializeMoney } from "../utils/money.js"

// Public API/dashboard shape. Internal UUIDs, raw provider payloads and
// anything provider-specific never leave this boundary (guide.md #117,
// #156-157): callers only ever see public IDs and normalized fields.
export function serializePayment(payment, { transactions = [], includeTimeline = false } = {}) {
  const latestTransaction = transactions[transactions.length - 1]
  const dto = {
    id: payment.publicId,
    status: payment.status,
    ...serializeMoney(payment.amountMinor, payment.currency),
    merchant_reference: payment.merchantReference,
    transaction_id: latestTransaction?.publicId ?? null,
    provider_reference: latestTransaction?.providerReference ?? null,
    description: payment.description,
    payment_method: payment.paymentMethod,
    environment: payment.environment,
    failure_reason: payment.status === "FAILED" ? payment.failureReason : null,
    created_at: payment.createdAt,
    updated_at: payment.updatedAt,
  }
  if (includeTimeline) {
    dto.timeline = (payment.stateTransitions || []).map((t) => ({
      from_status: t.fromStatus,
      to_status: t.toStatus,
      reason: t.reason,
      actor_type: t.actorType,
      created_at: t.createdAt,
    }))
  }
  return dto
}

export function serializeRefund(refund, paymentPublicId) {
  return {
    id: refund.publicId,
    payment_id: paymentPublicId,
    ...serializeMoney(refund.amountMinor, refund.currency),
    reason: refund.reason,
    status: refund.status,
    created_at: refund.createdAt,
  }
}
