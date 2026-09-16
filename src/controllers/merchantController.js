import { asyncHandler } from "../utils/asyncHandler.js"
import { prisma } from "../database/prisma.js"
import { AppError } from "../errors/AppError.js"
import * as merchantService from "../services/merchantService.js"
import { serializeMerchant } from "../services/merchantService.js"
import { getMerchantWalletBalance } from "../services/ledgerService.js"
import { serializeMoney } from "../utils/money.js"

export const listMyMerchants = asyncHandler(async (req, res) => {
  const merchants = await merchantService.listMerchantsForUser(req.user.id)
  res.json({ success: true, data: merchants })
})

export const getMerchant = asyncHandler(async (req, res) => {
  res.json({ success: true, data: { ...serializeMerchant(req.merchant), role: req.merchantMember.role } })
})

export const getDashboardSummary = asyncHandler(async (req, res) => {
  const merchantId = req.merchant.id
  const currency = req.merchant.currency

  const [totalSuccess, pending, failed, wallet, recentPayments] = await Promise.all([
    prisma.payment.aggregate({ where: { merchantId, status: "SUCCESS" }, _sum: { amountMinor: true }, _count: true }),
    prisma.payment.count({ where: { merchantId, status: { in: ["CREATED", "PENDING", "PROCESSING"] } } }),
    prisma.payment.count({ where: { merchantId, status: "FAILED" } }),
    getMerchantWalletBalance(prisma, merchantId, currency),
    prisma.payment.findMany({ where: { merchantId }, orderBy: { createdAt: "desc" }, take: 10 }),
  ])

  res.json({
    success: true,
    data: {
      total_processed: serializeMoney(totalSuccess._sum.amountMinor ?? 0n, currency),
      successful_payments: totalSuccess._count,
      pending_payments: pending,
      failed_payments: failed,
      available_balance: serializeMoney(wallet.availableMinor, currency),
      recent_payments: recentPayments.map((p) => ({
        id: p.publicId,
        status: p.status,
        ...serializeMoney(p.amountMinor, p.currency),
        created_at: p.createdAt,
      })),
    },
  })
})

export const getWallet = asyncHandler(async (req, res) => {
  const wallet = await getMerchantWalletBalance(prisma, req.merchant.id, req.merchant.currency)
  const entries = await prisma.ledgerEntry.findMany({
    where: { ledgerAccount: { merchantId: req.merchant.id, type: "MERCHANT_WALLET" } },
    orderBy: { createdAt: "desc" },
    take: 25,
  })
  res.json({
    success: true,
    data: {
      available_balance: serializeMoney(wallet.availableMinor, req.merchant.currency),
      recent_entries: entries.map((e) => ({
        id: e.publicId,
        direction: e.direction,
        ...serializeMoney(e.amountMinor, e.currency),
        reference_type: e.referenceType,
        description: e.description,
        created_at: e.createdAt,
      })),
    },
  })
})

export const submitKyc = asyncHandler(async (req, res) => {
  const kyc = await merchantService.submitKyc({ merchant: req.merchant, ...req.body, actorUserId: req.user.id })
  res.status(201).json({ success: true, data: { status: kyc.status, submitted_at: kyc.submittedAt } })
})

export const getKyc = asyncHandler(async (req, res) => {
  const kyc = await prisma.kycProfile.findUnique({ where: { merchantId: req.merchant.id } })
  if (!kyc) throw AppError.notFound("No KYC profile found")
  res.json({ success: true, data: { status: kyc.status, rejection_reason: kyc.rejectionReason, submitted_at: kyc.submittedAt, reviewed_at: kyc.reviewedAt } })
})

export const listTeam = asyncHandler(async (req, res) => {
  const members = await prisma.merchantMember.findMany({ where: { merchantId: req.merchant.id }, include: { user: true } })
  res.json({ success: true, data: members.map((m) => merchantService.serializeMember(m, m.user)) })
})

export const inviteTeamMember = asyncHandler(async (req, res) => {
  const member = await merchantService.inviteMember({ merchant: req.merchant, ...req.body, invitedByUserId: req.user.id })
  res.status(201).json({ success: true, data: { id: member.id, status: member.status, role: member.role } })
})

export const updateTeamMemberPermissions = asyncHandler(async (req, res) => {
  await merchantService.setMemberProfilePermissions({
    memberId: req.params.memberId,
    paymentProfileId: req.body.paymentProfileId,
    permissionKeys: req.body.permissionKeys,
    actorUserId: req.user.id,
    merchantId: req.merchant.id,
  })
  res.json({ success: true, data: { message: "Permissions updated" } })
})
