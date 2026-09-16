import { AppError } from "../errors/AppError.js"
import { asyncHandler } from "../utils/asyncHandler.js"
import { prisma } from "../database/prisma.js"
import { getMerchantMembership, memberHasPermission } from "../services/rbacService.js"

// Enforces the ownership chain from a dashboard session: authenticate user
// -> identify merchant -> check membership -> (per-route) check permission.
// The :merchantId route param is never trusted on its own — a membership
// row must exist for req.user, or this 404s (not 403) so merchant existence
// isn't leaked to users who have no relationship to it.
export const resolveMerchantContext = asyncHandler(async (req, res, next) => {
  const { merchantId } = req.params
  const merchant = await prisma.merchant.findUnique({ where: { publicId: merchantId } })
  if (!merchant) throw AppError.notFound("Merchant not found")

  const membership = await getMerchantMembership(req.user.id, merchant.id)
  if (!membership) throw AppError.notFound("Merchant not found")

  req.merchant = merchant
  req.merchantMember = membership
  next()
})

export function requireMerchantPermission(permissionKey) {
  return (req, res, next) => {
    const paymentProfileId = req.paymentProfile?.id ?? null
    if (!memberHasPermission(req.merchantMember, permissionKey, paymentProfileId)) {
      throw AppError.forbidden(`Missing required permission: ${permissionKey}`)
    }
    next()
  }
}

// Resolves and verifies a Payment Profile belongs to the already-resolved
// merchant. Must run after resolveMerchantContext.
export const resolvePaymentProfile = asyncHandler(async (req, res, next) => {
  const { profileId } = req.params
  const profile = await prisma.paymentProfile.findUnique({ where: { publicId: profileId } })
  if (!profile || profile.merchantId !== req.merchant.id) {
    throw AppError.notFound("Payment profile not found")
  }
  req.paymentProfile = profile
  next()
})
