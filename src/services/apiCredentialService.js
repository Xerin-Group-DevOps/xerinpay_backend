import { prisma } from "../database/prisma.js"
import { AppError } from "../errors/AppError.js"
import { generateApiKeyPair, hashSecretKey, lastFour } from "../security/apiKeys.js"
import { API_SCOPES } from "../config/permissions.js"
import { recordAudit } from "./auditService.js"
import { sendTemplatedEmail } from "./emailService.js"

export function serializeCredential(credential) {
  return {
    id: credential.publicId,
    name: credential.name,
    environment: credential.environment,
    public_key: credential.publicKey,
    last_four: credential.secretKeyLastFour,
    status: credential.status,
    scopes: credential.scopes,
    ip_allowlist: credential.ipAllowlist,
    expires_at: credential.expiresAt,
    last_used_at: credential.lastUsedAt,
    created_at: credential.createdAt,
  }
}

// Production credentials are gated on KYC + merchant activation (guide.md
// #87) — an unverified merchant cannot accidentally mint a live secret key.
export async function createApiCredential({ merchant, paymentProfile, environment, name, scopes, ipAllowlist, expiresAt, createdByUserId }) {
  if (environment === "PRODUCTION" && (merchant.kycStatus !== "VERIFIED" || merchant.status !== "ACTIVE")) {
    throw AppError.forbidden(
      "Production API credentials require a verified business. Complete KYC first.",
      "KYC_REQUIRED",
    )
  }

  const invalidScopes = scopes.filter((scope) => !API_SCOPES.includes(scope))
  if (invalidScopes.length > 0) {
    throw AppError.badRequest(`Unknown scopes: ${invalidScopes.join(", ")}`, "INVALID_SCOPE")
  }

  const { publicKey, secretKey } = generateApiKeyPair(environment)

  const credential = await prisma.apiCredential.create({
    data: {
      merchantId: merchant.id,
      paymentProfileId: paymentProfile.id,
      environment,
      name,
      publicKey,
      secretKeyHash: hashSecretKey(secretKey),
      secretKeyLastFour: lastFour(secretKey),
      scopes,
      ipAllowlist: ipAllowlist || [],
      expiresAt: expiresAt || null,
      createdByUserId,
    },
  })

  await recordAudit({ actorType: "USER", actorUserId: createdByUserId, action: "api_credential.created", entityType: "ApiCredential", entityId: credential.publicId, merchantId: merchant.id, metadata: { environment, scopes } })
  sendTemplatedEmail("api_key_created", merchant.contactEmail, { name: credential.name, environment }).catch(() => {})

  // secretKey is only ever returned here, once.
  return { credential, secretKey }
}

export async function revokeApiCredential({ credential, actorUserId }) {
  const updated = await prisma.apiCredential.update({
    where: { id: credential.id },
    data: { status: "REVOKED", revokedAt: new Date() },
  })
  await recordAudit({ actorType: "USER", actorUserId, action: "api_credential.revoked", entityType: "ApiCredential", entityId: credential.publicId, merchantId: credential.merchantId })
  return updated
}

// No grace period yet (guide.md #20 optional) — rotation revokes the old
// credential immediately and returns a new one. Documented as a known gap
// in README "Remaining work".
export async function rotateApiCredential({ credential, actorUserId }) {
  await revokeApiCredential({ credential, actorUserId })
  const { publicKey, secretKey } = generateApiKeyPair(credential.environment)

  const rotated = await prisma.apiCredential.create({
    data: {
      merchantId: credential.merchantId,
      paymentProfileId: credential.paymentProfileId,
      environment: credential.environment,
      name: `${credential.name} (rotated)`,
      publicKey,
      secretKeyHash: hashSecretKey(secretKey),
      secretKeyLastFour: lastFour(secretKey),
      scopes: credential.scopes,
      ipAllowlist: credential.ipAllowlist,
      createdByUserId: actorUserId,
      lastRotatedAt: new Date(),
    },
  })

  await recordAudit({ actorType: "USER", actorUserId, action: "api_credential.rotated", entityType: "ApiCredential", entityId: rotated.publicId, merchantId: credential.merchantId, metadata: { previousCredentialId: credential.publicId } })
  return { credential: rotated, secretKey }
}
