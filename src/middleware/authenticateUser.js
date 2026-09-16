import { AppError } from "../errors/AppError.js"
import { verifyAccessToken } from "../security/jwt.js"
import { prisma } from "../database/prisma.js"
import { asyncHandler } from "../utils/asyncHandler.js"

// Authenticates a dashboard (browser) session via a short-lived JWT access
// token. This never grants access to the merchant API surface — that path
// only accepts an API credential secret key (see authenticateApiKey.js).
export const authenticateUser = asyncHandler(async (req, res, next) => {
  const header = req.headers.authorization || ""
  const [scheme, token] = header.split(" ")
  if (scheme !== "Bearer" || !token) {
    throw AppError.unauthorized("Missing or invalid Authorization header")
  }

  let payload
  try {
    payload = verifyAccessToken(token)
  } catch {
    throw AppError.unauthorized("Session expired or invalid. Please log in again.")
  }

  const user = await prisma.user.findUnique({ where: { id: payload.sub } })
  if (!user || user.status !== "ACTIVE") {
    throw AppError.unauthorized("Account is not active")
  }

  req.user = user
  next()
})

export const optionalAuthenticateUser = asyncHandler(async (req, res, next) => {
  const header = req.headers.authorization || ""
  const [scheme, token] = header.split(" ")
  if (scheme !== "Bearer" || !token) return next()
  try {
    const payload = verifyAccessToken(token)
    const user = await prisma.user.findUnique({ where: { id: payload.sub } })
    if (user && user.status === "ACTIVE") req.user = user
  } catch {
    // ignore — treated as anonymous
  }
  next()
})
