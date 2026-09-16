import { prisma } from "../database/prisma.js"
import { generateRefreshToken, hashRefreshToken, signAccessToken } from "../security/jwt.js"
import { env } from "../config/env.js"
import { AppError } from "../errors/AppError.js"

export async function createSession(user, { userAgent, ipAddress } = {}) {
  const refreshToken = generateRefreshToken()
  const expiresAt = new Date(Date.now() + env.jwtRefreshTtlDays * 24 * 60 * 60 * 1000)

  const session = await prisma.session.create({
    data: { userId: user.id, tokenHash: hashRefreshToken(refreshToken), userAgent, ipAddress, expiresAt },
  })

  return { accessToken: signAccessToken(user), refreshToken, session }
}

export async function rotateSession(refreshToken, { userAgent, ipAddress } = {}) {
  const tokenHash = hashRefreshToken(refreshToken)
  const session = await prisma.session.findUnique({ where: { tokenHash }, include: { user: true } })

  if (!session || session.revokedAt || session.expiresAt < new Date()) {
    throw AppError.unauthorized("Session expired or invalid. Please log in again.")
  }

  await prisma.session.update({ where: { id: session.id }, data: { revokedAt: new Date() } })
  return createSession(session.user, { userAgent, ipAddress })
}

export async function revokeSession(sessionId, userId) {
  await prisma.session.updateMany({ where: { id: sessionId, userId }, data: { revokedAt: new Date() } })
}

export async function revokeSessionByToken(refreshToken) {
  const tokenHash = hashRefreshToken(refreshToken)
  await prisma.session.updateMany({ where: { tokenHash }, data: { revokedAt: new Date() } })
}

export async function revokeOtherSessions(userId, currentSessionId) {
  await prisma.session.updateMany({
    where: { userId, id: { not: currentSessionId }, revokedAt: null },
    data: { revokedAt: new Date() },
  })
}

export async function listActiveSessions(userId) {
  return prisma.session.findMany({
    where: { userId, revokedAt: null, expiresAt: { gt: new Date() } },
    orderBy: { lastActiveAt: "desc" },
  })
}
