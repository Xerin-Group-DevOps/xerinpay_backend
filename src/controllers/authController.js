import { asyncHandler } from "../utils/asyncHandler.js"
import * as authService from "../services/authService.js"
import * as sessionService from "../services/sessionService.js"
import { serializeMerchant } from "../services/merchantService.js"

function userDTO(user) {
  return { id: user.publicId, name: user.name, email: user.email, phone: user.phone, email_verified: !!user.emailVerifiedAt }
}

export const register = asyncHandler(async (req, res) => {
  const { user, merchant } = await authService.registerMerchant(req.body)
  const session = await sessionService.createSession(user, { userAgent: req.headers["user-agent"], ipAddress: req.ip })
  res.status(201).json({
    success: true,
    data: { user: userDTO(user), merchant: serializeMerchant(merchant), access_token: session.accessToken, refresh_token: session.refreshToken },
  })
})

export const login = asyncHandler(async (req, res) => {
  const { user, accessToken, refreshToken } = await authService.login({
    ...req.body,
    userAgent: req.headers["user-agent"],
    ipAddress: req.ip,
  })
  res.json({ success: true, data: { user: userDTO(user), access_token: accessToken, refresh_token: refreshToken } })
})

export const refresh = asyncHandler(async (req, res) => {
  const session = await sessionService.rotateSession(req.body.refreshToken, { userAgent: req.headers["user-agent"], ipAddress: req.ip })
  res.json({ success: true, data: { access_token: session.accessToken, refresh_token: session.refreshToken } })
})

export const logout = asyncHandler(async (req, res) => {
  if (req.body?.refreshToken) await sessionService.revokeSessionByToken(req.body.refreshToken)
  res.json({ success: true, data: { message: "Logged out" } })
})

export const me = asyncHandler(async (req, res) => {
  res.json({ success: true, data: userDTO(req.user) })
})

export const forgotPassword = asyncHandler(async (req, res) => {
  await authService.requestPasswordReset(req.body.email)
  res.json({ success: true, data: { message: "If that email exists, a reset link has been sent." } })
})

export const resetPassword = asyncHandler(async (req, res) => {
  await authService.resetPassword(req.body.token, req.body.password)
  res.json({ success: true, data: { message: "Password updated. Please log in again." } })
})

export const listSessions = asyncHandler(async (req, res) => {
  const sessions = await sessionService.listActiveSessions(req.user.id)
  res.json({
    success: true,
    data: sessions.map((s) => ({ id: s.id, user_agent: s.userAgent, ip_address: s.ipAddress, created_at: s.createdAt, last_active_at: s.lastActiveAt })),
  })
})

export const revokeSession = asyncHandler(async (req, res) => {
  await sessionService.revokeSession(req.params.sessionId, req.user.id)
  res.json({ success: true, data: { message: "Session revoked" } })
})

export const revokeOtherSessions = asyncHandler(async (req, res) => {
  await sessionService.revokeOtherSessions(req.user.id, req.body?.currentSessionId)
  res.json({ success: true, data: { message: "Other sessions revoked" } })
})
