import crypto from "node:crypto"
import { prisma } from "../database/prisma.js"
import { AppError } from "../errors/AppError.js"
import { hashPassword, verifyPassword, assertPasswordStrength } from "../security/password.js"
import { createSession } from "./sessionService.js"
import { recordAudit } from "./auditService.js"
import { recordSecurityEvent } from "./securityEventService.js"
import { sendTemplatedEmail } from "./emailService.js"

const MAX_FAILED_ATTEMPTS = 5
const LOCKOUT_MINUTES = 15

export async function registerMerchant({ name, email, phone, password, businessName }) {
  const problems = assertPasswordStrength(password)
  if (problems.length > 0) throw AppError.badRequest(problems.join(" "), "WEAK_PASSWORD")

  const existing = await prisma.user.findUnique({ where: { email } })
  if (existing) throw AppError.conflict("An account with this email already exists.", "EMAIL_TAKEN")

  const passwordHash = await hashPassword(password)

  const { user, merchant } = await prisma.$transaction(async (tx) => {
    const createdUser = await tx.user.create({
      data: { name, email, phone, passwordHash, status: "ACTIVE" },
    })
    const createdMerchant = await tx.merchant.create({
      data: {
        businessName,
        ownerUserId: createdUser.id,
        contactEmail: email,
        contactPhone: phone,
        status: "PENDING",
      },
    })
    await tx.merchantMember.create({
      data: { merchantId: createdMerchant.id, userId: createdUser.id, role: "OWNER", status: "ACTIVE", joinedAt: new Date() },
    })
    await tx.kycProfile.create({ data: { merchantId: createdMerchant.id, status: "NOT_STARTED" } })
    return { user: createdUser, merchant: createdMerchant }
  })

  await recordAudit({ actorType: "USER", actorUserId: user.id, action: "user.registered", entityType: "User", entityId: user.publicId, merchantId: merchant.id })
  await sendTemplatedEmail("welcome", email, { name })

  return { user, merchant }
}

export async function login({ email, password, userAgent, ipAddress }) {
  const user = await prisma.user.findUnique({ where: { email } })

  // Constant-shape error regardless of which check failed, so the response
  // never discloses whether the email exists.
  const invalidCredentials = () => AppError.unauthorized("Invalid email or password", "INVALID_CREDENTIALS")

  if (!user) throw invalidCredentials()

  if (user.lockedUntil && user.lockedUntil > new Date()) {
    await recordSecurityEvent({ type: "LOGIN_BLOCKED_LOCKOUT", severity: "MEDIUM", actorUserId: user.id, ipAddress })
    throw AppError.tooManyRequests("Too many failed attempts. Try again later.", "ACCOUNT_LOCKED")
  }

  const validPassword = await verifyPassword(user.passwordHash, password)
  if (!validPassword) {
    const failedCount = user.failedLoginCount + 1
    const locked = failedCount >= MAX_FAILED_ATTEMPTS
    await prisma.user.update({
      where: { id: user.id },
      data: {
        failedLoginCount: locked ? 0 : failedCount,
        lockedUntil: locked ? new Date(Date.now() + LOCKOUT_MINUTES * 60_000) : null,
      },
    })
    if (locked) {
      await recordSecurityEvent({ type: "ACCOUNT_LOCKED", severity: "HIGH", actorUserId: user.id, ipAddress })
    }
    throw invalidCredentials()
  }

  if (user.status !== "ACTIVE") {
    throw AppError.unauthorized("This account is not active. Contact support.", "ACCOUNT_INACTIVE")
  }

  await prisma.user.update({
    where: { id: user.id },
    data: { failedLoginCount: 0, lockedUntil: null, lastLoginAt: new Date() },
  })

  const session = await createSession(user, { userAgent, ipAddress })
  await recordAudit({ actorType: "USER", actorUserId: user.id, action: "user.login", entityType: "User", entityId: user.publicId, ipAddress })
  await recordSecurityEvent({ type: "NEW_LOGIN", severity: "LOW", actorUserId: user.id, ipAddress })
  sendTemplatedEmail("new_login", user.email, { name: user.name, ipAddress: ipAddress || "unknown" }).catch(() => {})

  return { user, ...session }
}

export async function requestPasswordReset(email) {
  const user = await prisma.user.findUnique({ where: { email } })
  // Always behave the same whether or not the email exists (guide.md #137).
  if (!user) return

  const token = crypto.randomBytes(32).toString("base64url")
  const tokenHash = crypto.createHash("sha256").update(token).digest("hex")
  await prisma.passwordResetToken.create({
    data: { userId: user.id, tokenHash, expiresAt: new Date(Date.now() + 60 * 60 * 1000) },
  })
  await sendTemplatedEmail("password_reset", user.email, { name: user.name, reset_token: token })
}

export async function resetPassword(token, newPassword) {
  const problems = assertPasswordStrength(newPassword)
  if (problems.length > 0) throw AppError.badRequest(problems.join(" "), "WEAK_PASSWORD")

  const tokenHash = crypto.createHash("sha256").update(token).digest("hex")
  const record = await prisma.passwordResetToken.findUnique({ where: { tokenHash } })
  if (!record || record.usedAt || record.expiresAt < new Date()) {
    throw AppError.badRequest("This password reset link is invalid or has expired.", "INVALID_RESET_TOKEN")
  }

  const passwordHash = await hashPassword(newPassword)
  await prisma.$transaction([
    prisma.user.update({ where: { id: record.userId }, data: { passwordHash } }),
    prisma.passwordResetToken.update({ where: { id: record.id }, data: { usedAt: new Date() } }),
    prisma.session.updateMany({ where: { userId: record.userId, revokedAt: null }, data: { revokedAt: new Date() } }),
  ])

  await recordSecurityEvent({ type: "PASSWORD_RESET", severity: "MEDIUM", actorUserId: record.userId })
}
