import { prisma } from "../database/prisma.js"
import { AppError } from "../errors/AppError.js"
import { toMinorUnits } from "../utils/money.js"
import { publicId } from "../utils/publicId.js"
import { resolveProvider } from "../providers/index.js"
import { transitionPayment } from "../domain/paymentStateMachine.js"
import { postRefund } from "./ledgerService.js"
import { dispatchEvent } from "./webhookService.js"
import { recordAudit } from "./auditService.js"
import { serializePayment, serializeRefund } from "./paymentSerializer.js"

const REFUNDABLE_STATUSES = ["SUCCESS", "PARTIALLY_REFUNDED"]

export async function createRefund({ payment, amountMajor, reason, requestedByUserId }) {
  if (!REFUNDABLE_STATUSES.includes(payment.status)) {
    throw AppError.conflict(`A payment in status ${payment.status} cannot be refunded.`, "PAYMENT_NOT_REFUNDABLE")
  }

  const amountMinor = amountMajor != null ? toMinorUnits(amountMajor, payment.currency) : payment.amountMinor

  const alreadyRefunded = await prisma.refund.aggregate({
    where: { paymentId: payment.id, status: "SUCCESS" },
    _sum: { amountMinor: true },
  })
  const refundedSoFar = alreadyRefunded._sum.amountMinor ?? 0n
  if (refundedSoFar + amountMinor > payment.amountMinor) {
    throw AppError.badRequest("Refund amount exceeds the remaining refundable balance.", "REFUND_EXCEEDS_PAYMENT")
  }

  const refund = await prisma.refund.create({
    data: { publicId: publicId("rfnd"), paymentId: payment.id, amountMinor, currency: payment.currency, reason, requestedByUserId, status: "PENDING" },
  })

  const latestTransaction = await prisma.transaction.findFirst({ where: { paymentId: payment.id }, orderBy: { createdAt: "desc" } })
  const provider = await resolveProvider(payment.environment)

  let providerResult
  try {
    providerResult = await provider.refundPayment({ orderId: latestTransaction?.providerReference ?? payment.publicId, amountMinor, currency: payment.currency })
  } catch (err) {
    providerResult = { status: "FAILED", raw: { error: String(err?.message || err) } }
  }

  const outcome = await prisma.$transaction(async (tx) => {
    const updatedRefund = await tx.refund.update({ where: { id: refund.id }, data: { status: providerResult.status, providerReference: providerResult.providerReference ?? null } })

    if (providerResult.status !== "SUCCESS") {
      return { refund: updatedRefund, payment, changed: false }
    }

    const totalRefunded = refundedSoFar + amountMinor
    const nextStatus = totalRefunded >= payment.amountMinor ? "REFUNDED" : "PARTIALLY_REFUNDED"
    const { payment: updatedPayment } = await transitionPayment(tx, payment, nextStatus, { actorType: "USER", actorId: requestedByUserId, reason })

    await postRefund(tx, { merchantId: payment.merchantId, currency: payment.currency, amountMinor, paymentId: payment.id, refundId: updatedRefund.id })

    return { refund: updatedRefund, payment: updatedPayment, changed: true }
  })

  if (outcome.changed) {
    const event = outcome.payment.status === "REFUNDED" ? "payment.refunded" : "payment.partially_refunded"
    await dispatchEvent(payment.paymentProfileId, event, serializePayment(outcome.payment))
  }

  await recordAudit({
    actorType: "USER",
    actorUserId: requestedByUserId,
    action: "payment.refund_requested",
    entityType: "Refund",
    entityId: outcome.refund.publicId,
    merchantId: payment.merchantId,
    metadata: { amountMinor: amountMinor.toString(), status: outcome.refund.status },
  })

  return { refund: serializeRefund(outcome.refund, outcome.payment.publicId), payment: serializePayment(outcome.payment) }
}
