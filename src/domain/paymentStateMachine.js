import { AppError } from "../errors/AppError.js"

// The only place payment status transitions are decided. No controller or
// service mutates Payment.status directly.
const TRANSITIONS = {
  // SUCCESS is reachable directly from CREATED because some providers/
  // payment methods confirm synchronously (no observable PENDING window).
  CREATED: ["PENDING", "PROCESSING", "SUCCESS", "FAILED", "CANCELLED", "EXPIRED"],
  PENDING: ["PROCESSING", "SUCCESS", "FAILED", "CANCELLED", "EXPIRED"],
  PROCESSING: ["SUCCESS", "FAILED", "CANCELLED"],
  SUCCESS: ["REFUND_PENDING", "PARTIALLY_REFUNDED", "REFUNDED"],
  REFUND_PENDING: ["PARTIALLY_REFUNDED", "REFUNDED", "SUCCESS"],
  PARTIALLY_REFUNDED: ["REFUND_PENDING", "REFUNDED"],
  FAILED: [],
  CANCELLED: [],
  EXPIRED: [],
  REFUNDED: [],
}

export function canTransition(fromStatus, toStatus) {
  if (fromStatus === toStatus) return true // idempotent no-op, e.g. duplicate webhook
  return TRANSITIONS[fromStatus]?.includes(toStatus) ?? false
}

export function assertTransition(fromStatus, toStatus) {
  if (!canTransition(fromStatus, toStatus)) {
    throw AppError.conflict(
      `Payment cannot move from ${fromStatus} to ${toStatus}.`,
      "INVALID_STATE_TRANSITION",
    )
  }
}

export async function transitionPayment(tx, payment, toStatus, { reason, actorType, actorId, providerReference } = {}) {
  if (payment.status === toStatus) {
    return { payment, changed: false }
  }
  assertTransition(payment.status, toStatus)

  const updated = await tx.payment.update({
    where: { id: payment.id },
    data: { status: toStatus, ...(reason ? { failureReason: reason } : {}) },
  })

  await tx.paymentStateTransition.create({
    data: {
      paymentId: payment.id,
      fromStatus: payment.status,
      toStatus,
      reason: reason ?? null,
      actorType: actorType ?? "SYSTEM",
      actorId: actorId ?? null,
      providerReference: providerReference ?? null,
    },
  })

  return { payment: updated, changed: true }
}
