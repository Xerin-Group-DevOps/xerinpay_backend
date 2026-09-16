import { prisma } from "../database/prisma.js"
import { AppError } from "../errors/AppError.js"
import { recordAudit } from "./auditService.js"

export function serializeProfile(profile) {
  return {
    id: profile.publicId,
    name: profile.name,
    description: profile.description,
    logo_url: profile.logoUrl,
    status: profile.status,
    country: profile.country,
    currency: profile.currency,
    allowed_domains: profile.allowedDomains,
    allowed_payment_methods: profile.allowedPaymentMethods,
    success_url: profile.successUrl,
    failure_url: profile.failureUrl,
    cancel_url: profile.cancelUrl,
    support_email: profile.supportEmail,
    created_at: profile.createdAt,
  }
}

// Redirect URLs are validated to same-origin-allowlisted https(s) URLs to
// prevent checkout being used as an open redirect (guide.md #35, #84).
function assertSafeRedirectUrl(url, label) {
  if (!url) return
  let parsed
  try {
    parsed = new URL(url)
  } catch {
    throw AppError.badRequest(`${label} must be a valid URL`, "INVALID_URL")
  }
  if (!["http:", "https:"].includes(parsed.protocol)) {
    throw AppError.badRequest(`${label} must use http or https`, "INVALID_URL")
  }
}

export async function createPaymentProfile({ merchant, name, description, country, currency, successUrl, failureUrl, cancelUrl, supportEmail, createdByUserId }) {
  ;[successUrl, failureUrl, cancelUrl].forEach((url, i) => assertSafeRedirectUrl(url, ["success_url", "failure_url", "cancel_url"][i]))

  const profile = await prisma.paymentProfile.create({
    data: {
      merchantId: merchant.id,
      name,
      description,
      country: country || merchant.country,
      currency: currency || merchant.currency,
      successUrl,
      failureUrl,
      cancelUrl,
      supportEmail,
      createdByUserId,
    },
  })

  await recordAudit({ actorType: "USER", actorUserId: createdByUserId, action: "payment_profile.created", entityType: "PaymentProfile", entityId: profile.publicId, merchantId: merchant.id })
  return profile
}

export async function updatePaymentProfile({ profile, updates, actorUserId }) {
  ;["successUrl", "failureUrl", "cancelUrl"].forEach((key) => {
    if (updates[key]) assertSafeRedirectUrl(updates[key], key)
  })

  const updated = await prisma.paymentProfile.update({ where: { id: profile.id }, data: updates })
  await recordAudit({ actorType: "USER", actorUserId, action: "payment_profile.updated", entityType: "PaymentProfile", entityId: profile.publicId, merchantId: profile.merchantId, metadata: { fields: Object.keys(updates) } })
  return updated
}

export async function setPaymentProfileStatus({ profile, status, actorUserId }) {
  const updated = await prisma.paymentProfile.update({ where: { id: profile.id }, data: { status } })
  await recordAudit({ actorType: "USER", actorUserId, action: status === "ACTIVE" ? "payment_profile.enabled" : "payment_profile.disabled", entityType: "PaymentProfile", entityId: profile.publicId, merchantId: profile.merchantId })
  return updated
}
