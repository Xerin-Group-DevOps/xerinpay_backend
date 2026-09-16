import { prisma } from "../database/prisma.js"
import { AppError } from "../errors/AppError.js"
import { recordAudit } from "./auditService.js"
import { maskEmail, maskPhone } from "../utils/redact.js"

export function serializeMerchant(merchant) {
  return {
    id: merchant.publicId,
    business_name: merchant.businessName,
    legal_name: merchant.legalName,
    country: merchant.country,
    currency: merchant.currency,
    status: merchant.status,
    kyc_status: merchant.kycStatus,
    contact_email: merchant.contactEmail,
    contact_phone: merchant.contactPhone,
    created_at: merchant.createdAt,
  }
}

export function serializeMember(member, user) {
  return {
    id: member.id,
    role: member.role,
    status: member.status,
    user: { name: user.name, email: maskEmail(user.email), phone: user.phone ? maskPhone(user.phone) : null },
    joined_at: member.joinedAt,
  }
}

export async function listMerchantsForUser(userId) {
  const memberships = await prisma.merchantMember.findMany({
    where: { userId, status: "ACTIVE" },
    include: { merchant: true },
  })
  return memberships.map((m) => ({ ...serializeMerchant(m.merchant), role: m.role }))
}

export async function inviteMember({ merchant, email, role, invitedByUserId }) {
  const user = await prisma.user.findUnique({ where: { email } })
  if (!user) {
    throw AppError.badRequest("Ask them to create a XerinPay account first, then invite them.", "USER_NOT_FOUND")
  }

  const existing = await prisma.merchantMember.findUnique({ where: { merchantId_userId: { merchantId: merchant.id, userId: user.id } } })
  if (existing && existing.status === "ACTIVE") {
    throw AppError.conflict("This person is already a member of your team.", "ALREADY_MEMBER")
  }

  const member = existing
    ? await prisma.merchantMember.update({ where: { id: existing.id }, data: { status: "INVITED", role } })
    : await prisma.merchantMember.create({ data: { merchantId: merchant.id, userId: user.id, role, status: "INVITED" } })

  await recordAudit({ actorType: "USER", actorUserId: invitedByUserId, action: "merchant.member_invited", entityType: "MerchantMember", entityId: member.id, merchantId: merchant.id, metadata: { email, role } })
  return member
}

export async function setMemberProfilePermissions({ memberId, paymentProfileId, permissionKeys, actorUserId, merchantId }) {
  await prisma.merchantMemberPermission.deleteMany({ where: { memberId, paymentProfileId } })
  if (permissionKeys.length > 0) {
    await prisma.merchantMemberPermission.createMany({
      data: permissionKeys.map((permissionKey) => ({ memberId, paymentProfileId, permissionKey })),
    })
  }
  await recordAudit({ actorType: "USER", actorUserId, action: "merchant.member_permissions_updated", entityType: "MerchantMember", entityId: memberId, merchantId, metadata: { paymentProfileId, permissionKeys } })
}

export async function submitKyc({ merchant, businessInfo, ownerInfo, actorUserId }) {
  const kyc = await prisma.kycProfile.upsert({
    where: { merchantId: merchant.id },
    update: { businessInfo, ownerInfo, status: "PENDING", submittedAt: new Date() },
    create: { merchantId: merchant.id, businessInfo, ownerInfo, status: "PENDING", submittedAt: new Date() },
  })
  await prisma.merchant.update({ where: { id: merchant.id }, data: { kycStatus: "PENDING" } })
  await recordAudit({ actorType: "USER", actorUserId, action: "kyc.submitted", entityType: "KycProfile", entityId: kyc.id, merchantId: merchant.id })
  return kyc
}

export async function reviewKyc({ merchantId, decision, rejectionReason, reviewerUserId }) {
  const status = decision === "APPROVE" ? "VERIFIED" : "REJECTED"
  const kyc = await prisma.kycProfile.update({
    where: { merchantId },
    data: { status, rejectionReason: status === "REJECTED" ? rejectionReason : null, reviewedAt: new Date(), reviewedByUserId: reviewerUserId },
  })
  await prisma.merchant.update({ where: { id: merchantId }, data: { kycStatus: status, status: status === "VERIFIED" ? "ACTIVE" : undefined } })
  await recordAudit({ actorType: "USER", actorUserId: reviewerUserId, action: "kyc.reviewed", entityType: "KycProfile", entityId: kyc.id, merchantId, metadata: { decision } })
  return kyc
}
