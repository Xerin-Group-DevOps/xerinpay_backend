import { AppError } from "../errors/AppError.js"
import { prisma } from "../database/prisma.js"
import { hashSecretKey } from "../security/apiKeys.js"
import { asyncHandler } from "../utils/asyncHandler.js"
import { recordSecurityEvent } from "../services/securityEventService.js"

// Every merchant-facing API request authenticates with a secret key, never
// a merchant/profile ID supplied by the caller. The Payment Profile (and
// therefore merchant) is *derived* from the credential — this is what makes
// cross-tenant access structurally impossible rather than merely checked.
export const authenticateApiKey = asyncHandler(async (req, res, next) => {
  const header = req.headers.authorization || ""
  const [scheme, secretKey] = header.split(" ")
  if (scheme !== "Bearer" || !secretKey || !secretKey.startsWith("xsk_")) {
    throw AppError.unauthorized("Missing or invalid API secret key", "INVALID_API_KEY")
  }

  const secretKeyHash = hashSecretKey(secretKey)
  const credential = await prisma.apiCredential.findUnique({
    where: { secretKeyHash },
    include: { paymentProfile: { include: { merchant: true } } },
  })

  if (!credential) {
    await recordSecurityEvent({ type: "API_KEY_INVALID", severity: "MEDIUM", ipAddress: req.ip, requestId: req.requestId })
    throw AppError.unauthorized("Invalid API credentials", "INVALID_API_KEY")
  }

  if (credential.status === "REVOKED") {
    throw AppError.unauthorized("This API credential has been revoked", "CREDENTIAL_REVOKED")
  }
  if (credential.expiresAt && credential.expiresAt < new Date()) {
    throw AppError.unauthorized("This API credential has expired", "CREDENTIAL_EXPIRED")
  }
  if (credential.paymentProfile.status !== "ACTIVE") {
    throw AppError.unauthorized("This payment profile is disabled", "PROFILE_DISABLED")
  }
  if (credential.paymentProfile.merchant.status !== "ACTIVE" && credential.paymentProfile.merchant.status !== "PENDING") {
    throw AppError.unauthorized("This merchant account is disabled", "MERCHANT_DISABLED")
  }

  const ipAllowlist = credential.ipAllowlist
  if (Array.isArray(ipAllowlist) && ipAllowlist.length > 0 && !ipAllowlist.includes(req.ip)) {
    await recordSecurityEvent({
      type: "API_KEY_IP_BLOCKED",
      severity: "HIGH",
      merchantId: credential.paymentProfile.merchantId,
      ipAddress: req.ip,
      requestId: req.requestId,
      metadata: { credentialId: credential.publicId },
    })
    throw AppError.forbidden("This IP address is not permitted to use this credential", "IP_NOT_ALLOWED")
  }

  req.apiCredential = credential
  req.paymentProfile = credential.paymentProfile
  req.merchant = credential.paymentProfile.merchant
  req.environment = credential.environment

  prisma.apiCredential
    .update({ where: { id: credential.id }, data: { lastUsedAt: new Date() } })
    .catch(() => {})

  next()
})

export function requireScope(scope) {
  return (req, res, next) => {
    const scopes = req.apiCredential?.scopes || []
    if (!scopes.includes(scope)) {
      throw AppError.forbidden(`This API credential does not have the '${scope}' scope`, "SCOPE_DENIED")
    }
    next()
  }
}
