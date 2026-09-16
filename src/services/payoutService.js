import { prisma } from "../database/prisma.js"
import { AppError } from "../errors/AppError.js"
import { toMinorUnits, serializeMoney } from "../utils/money.js"
import { getMerchantWalletBalance, postPayoutReserved, postPayoutCompleted, postPayoutFailed } from "./ledgerService.js"
import { dispatchEvent } from "./webhookService.js"
import { recordAudit } from "./auditService.js"
import { publicId } from "../utils/publicId.js"

// Payout execution against a real disbursement provider is not implemented
// (see DEPLOYMENT.md / README "Remaining work") — requests are reserved
// against the ledger immediately and then require a Finance-role admin to
// mark them COMPLETED or FAILED once the transfer has actually been made
// through the bank/mobile-money channel. This keeps the ledger correct
// without pretending an unbuilt integration exists.
export async function requestPayout({ merchant, amountMajor, destination, requestedByUserId, defaultPaymentProfileId }) {
  const currency = merchant.currency
  const amountMinor = toMinorUnits(amountMajor, currency)

  const payout = await prisma.$transaction(async (tx) => {
    const { availableMinor } = await getMerchantWalletBalance(tx, merchant.id, currency)
    if (amountMinor > availableMinor) {
      throw AppError.badRequest("Payout amount exceeds available wallet balance.", "INSUFFICIENT_BALANCE")
    }

    const created = await tx.payout.create({
      data: { publicId: publicId("po"), merchantId: merchant.id, amountMinor, currency, destination, requestedByUserId, status: "PENDING" },
    })

    await postPayoutReserved(tx, { merchantId: merchant.id, currency, amountMinor, payoutId: created.id })
    return created
  })

  await dispatchEvent(defaultPaymentProfileId, "payout.created", { id: payout.publicId, status: payout.status, ...serializeMoney(payout.amountMinor, currency) })
  await recordAudit({ actorType: "USER", actorUserId: requestedByUserId, action: "payout.requested", entityType: "Payout", entityId: payout.publicId, merchantId: merchant.id, metadata: { amountMinor: amountMinor.toString() } })

  return payout
}

export async function approvePayout(payoutId, approvedByUserId) {
  const payout = await prisma.payout.update({ where: { id: payoutId }, data: { status: "APPROVED", approvedByUserId } })
  await recordAudit({ actorType: "USER", actorUserId: approvedByUserId, action: "payout.approved", entityType: "Payout", entityId: payout.publicId, merchantId: payout.merchantId })
  return payout
}

export async function completePayout(payoutId, providerReference, actorUserId) {
  const payout = await prisma.$transaction(async (tx) => {
    const existing = await tx.payout.findUnique({ where: { id: payoutId } })
    if (!existing) throw AppError.notFound("Payout not found")
    if (!["PENDING", "APPROVED", "PROCESSING"].includes(existing.status)) {
      throw AppError.conflict(`Payout in status ${existing.status} cannot be completed.`, "INVALID_PAYOUT_STATE")
    }
    const updated = await tx.payout.update({ where: { id: payoutId }, data: { status: "COMPLETED", providerReference } })
    await postPayoutCompleted(tx, { currency: updated.currency, amountMinor: updated.amountMinor, payoutId: updated.id })
    return updated
  })

  await recordAudit({ actorType: "USER", actorUserId, action: "payout.completed", entityType: "Payout", entityId: payout.publicId, merchantId: payout.merchantId })
  return payout
}

export async function failPayout(payoutId, reason, actorUserId) {
  const payout = await prisma.$transaction(async (tx) => {
    const existing = await tx.payout.findUnique({ where: { id: payoutId } })
    if (!existing) throw AppError.notFound("Payout not found")
    const updated = await tx.payout.update({ where: { id: payoutId }, data: { status: "FAILED", failureReason: reason } })
    await postPayoutFailed(tx, { merchantId: existing.merchantId, currency: existing.currency, amountMinor: existing.amountMinor, payoutId: existing.id })
    return updated
  })

  await recordAudit({ actorType: "USER", actorUserId, action: "payout.failed", entityType: "Payout", entityId: payout.publicId, merchantId: payout.merchantId, metadata: { reason } })
  return payout
}
