import { asyncHandler } from "../utils/asyncHandler.js"
import { prisma } from "../database/prisma.js"
import { serializeMoney } from "../utils/money.js"
import { requestPayout } from "../services/payoutService.js"

function serializePayout(payout) {
  return {
    id: payout.publicId,
    status: payout.status,
    ...serializeMoney(payout.amountMinor, payout.currency),
    destination: payout.destination,
    created_at: payout.createdAt,
  }
}

export const listPayouts = asyncHandler(async (req, res) => {
  const payouts = await prisma.payout.findMany({ where: { merchantId: req.merchant.id }, orderBy: { createdAt: "desc" }, take: 50 })
  res.json({ success: true, data: payouts.map(serializePayout) })
})

export const createPayoutRequest = asyncHandler(async (req, res) => {
  const defaultProfile = await prisma.paymentProfile.findFirst({ where: { merchantId: req.merchant.id } })
  const payout = await requestPayout({
    merchant: req.merchant,
    amountMajor: req.body.amount,
    destination: { type: req.body.destinationType, ...req.body.destinationDetails },
    requestedByUserId: req.user.id,
    defaultPaymentProfileId: defaultProfile?.id,
  })
  res.status(201).json({ success: true, data: serializePayout(payout) })
})
