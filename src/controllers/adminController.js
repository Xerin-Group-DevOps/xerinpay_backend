import { asyncHandler } from "../utils/asyncHandler.js"
import { prisma } from "../database/prisma.js"
import { AppError } from "../errors/AppError.js"
import { serializeMerchant } from "../services/merchantService.js"
import { serializeMoney } from "../utils/money.js"
import * as merchantService from "../services/merchantService.js"
import { approvePayout, completePayout, failPayout } from "../services/payoutService.js"
import { encryptSecret } from "../security/encryption.js"
import { recordAudit } from "../services/auditService.js"

const PAGE_SIZE = 25

export const listMerchants = asyncHandler(async (req, res) => {
  const { status, kycStatus, q, page = "1" } = req.query
  const pageNum = Math.max(1, Number(page) || 1)
  const where = {
    ...(status ? { status } : {}),
    ...(kycStatus ? { kycStatus } : {}),
    ...(q ? { businessName: { contains: q, mode: "insensitive" } } : {}),
  }
  const [items, total] = await Promise.all([
    prisma.merchant.findMany({ where, orderBy: { createdAt: "desc" }, skip: (pageNum - 1) * PAGE_SIZE, take: PAGE_SIZE }),
    prisma.merchant.count({ where }),
  ])
  res.json({ success: true, data: items.map(serializeMerchant), pagination: { page: pageNum, page_size: PAGE_SIZE, total } })
})

export const getMerchant = asyncHandler(async (req, res) => {
  const merchant = await prisma.merchant.findUnique({ where: { publicId: req.params.merchantId }, include: { kycProfile: true } })
  if (!merchant) throw AppError.notFound("Merchant not found")
  res.json({ success: true, data: { ...serializeMerchant(merchant), kyc: merchant.kycProfile } })
})

export const listKycQueue = asyncHandler(async (req, res) => {
  const merchants = await prisma.merchant.findMany({ where: { kycStatus: { in: ["PENDING", "UNDER_REVIEW"] } }, include: { kycProfile: true }, orderBy: { updatedAt: "asc" } })
  res.json({ success: true, data: merchants.map((m) => ({ ...serializeMerchant(m), kyc: m.kycProfile })) })
})

export const reviewKyc = asyncHandler(async (req, res) => {
  const merchant = await prisma.merchant.findUnique({ where: { publicId: req.params.merchantId } })
  if (!merchant) throw AppError.notFound("Merchant not found")
  const kyc = await merchantService.reviewKyc({ merchantId: merchant.id, decision: req.body.decision, rejectionReason: req.body.rejectionReason, reviewerUserId: req.user.id })
  res.json({ success: true, data: kyc })
})

export const listPayments = asyncHandler(async (req, res) => {
  const { status, page = "1" } = req.query
  const pageNum = Math.max(1, Number(page) || 1)
  const where = status ? { status } : {}
  const [items, total] = await Promise.all([
    prisma.payment.findMany({ where, orderBy: { createdAt: "desc" }, skip: (pageNum - 1) * PAGE_SIZE, take: PAGE_SIZE, include: { merchant: true } }),
    prisma.payment.count({ where }),
  ])
  res.json({
    success: true,
    data: items.map((p) => ({ id: p.publicId, status: p.status, ...serializeMoney(p.amountMinor, p.currency), merchant: p.merchant.businessName, created_at: p.createdAt })),
    pagination: { page: pageNum, page_size: PAGE_SIZE, total },
  })
})

export const listPayouts = asyncHandler(async (req, res) => {
  const { status } = req.query
  const payouts = await prisma.payout.findMany({ where: status ? { status } : {}, orderBy: { createdAt: "desc" }, take: 100, include: { merchant: true } })
  res.json({ success: true, data: payouts.map((p) => ({ id: p.publicId, status: p.status, ...serializeMoney(p.amountMinor, p.currency), merchant: p.merchant.businessName, destination: p.destination, created_at: p.createdAt })) })
})

async function loadPayoutByPublicId(publicId) {
  const payout = await prisma.payout.findUnique({ where: { publicId } })
  if (!payout) throw AppError.notFound("Payout not found")
  return payout
}

export const approvePayoutHandler = asyncHandler(async (req, res) => {
  const payout = await loadPayoutByPublicId(req.params.payoutId)
  const updated = await approvePayout(payout.id, req.user.id)
  res.json({ success: true, data: { id: updated.publicId, status: updated.status } })
})

export const completePayoutHandler = asyncHandler(async (req, res) => {
  const payout = await loadPayoutByPublicId(req.params.payoutId)
  const updated = await completePayout(payout.id, req.body.providerReference, req.user.id)
  res.json({ success: true, data: { id: updated.publicId, status: updated.status } })
})

export const failPayoutHandler = asyncHandler(async (req, res) => {
  const payout = await loadPayoutByPublicId(req.params.payoutId)
  const updated = await failPayout(payout.id, req.body.reason, req.user.id)
  res.json({ success: true, data: { id: updated.publicId, status: updated.status } })
})

export const listProviders = asyncHandler(async (req, res) => {
  const providers = await prisma.provider.findMany({ include: { credentials: { select: { environment: true, updatedAt: true } } } })
  res.json({
    success: true,
    data: providers.map((p) => ({ id: p.id, key: p.key, name: p.name, status: p.status, capabilities: p.capabilities, priority: p.priority, configured_environments: p.credentials.map((c) => c.environment) })),
  })
})

export const upsertProviderCredential = asyncHandler(async (req, res) => {
  const { providerId } = req.params
  const { environment, config } = req.body
  const provider = await prisma.provider.findUnique({ where: { id: providerId } })
  if (!provider) throw AppError.notFound("Provider not found")

  await prisma.providerCredential.upsert({
    where: { providerId_environment: { providerId, environment } },
    update: { encryptedConfig: encryptSecret(JSON.stringify(config)) },
    create: { providerId, environment, encryptedConfig: encryptSecret(JSON.stringify(config)) },
  })

  await recordAudit({ actorType: "USER", actorUserId: req.user.id, action: "provider_credential.updated", entityType: "Provider", entityId: providerId, metadata: { environment } })
  res.json({ success: true, data: { message: "Provider credentials saved" } })
})

export const listAuditLogs = asyncHandler(async (req, res) => {
  const { merchantId, page = "1" } = req.query
  const pageNum = Math.max(1, Number(page) || 1)
  const where = merchantId ? { merchant: { publicId: merchantId } } : {}
  const [items, total] = await Promise.all([
    prisma.auditLog.findMany({ where, orderBy: { createdAt: "desc" }, skip: (pageNum - 1) * PAGE_SIZE, take: PAGE_SIZE, include: { actor: true } }),
    prisma.auditLog.count({ where }),
  ])
  res.json({
    success: true,
    data: items.map((a) => ({ id: a.publicId, action: a.action, entity_type: a.entityType, entity_id: a.entityId, actor: a.actor?.name ?? a.actorType, ip_address: a.ipAddress, created_at: a.createdAt, metadata: a.metadata })),
    pagination: { page: pageNum, page_size: PAGE_SIZE, total },
  })
})

export const listSecurityEvents = asyncHandler(async (req, res) => {
  const events = await prisma.securityEvent.findMany({ orderBy: { createdAt: "desc" }, take: 100 })
  res.json({ success: true, data: events.map((e) => ({ id: e.publicId, type: e.type, severity: e.severity, ip_address: e.ipAddress, created_at: e.createdAt, metadata: e.metadata })) })
})

export const listUsers = asyncHandler(async (req, res) => {
  const users = await prisma.user.findMany({ orderBy: { createdAt: "desc" }, take: 100, include: { roles: { include: { role: true } } } })
  res.json({ success: true, data: users.map((u) => ({ id: u.publicId, name: u.name, email: u.email, status: u.status, roles: u.roles.map((r) => r.role.key), created_at: u.createdAt })) })
})

export const assignUserRole = asyncHandler(async (req, res) => {
  const user = await prisma.user.findUnique({ where: { publicId: req.params.userId } })
  if (!user) throw AppError.notFound("User not found")
  const role = await prisma.role.findUnique({ where: { key: req.body.roleKey } })
  if (!role) throw AppError.notFound("Role not found")

  await prisma.userRole.upsert({
    where: { userId_roleId: { userId: user.id, roleId: role.id } },
    update: {},
    create: { userId: user.id, roleId: role.id },
  })
  await recordAudit({ actorType: "USER", actorUserId: req.user.id, action: "user.role_assigned", entityType: "User", entityId: user.publicId, metadata: { role: role.key } })
  res.json({ success: true, data: { message: "Role assigned" } })
})
