import rateLimit from "express-rate-limit"
import { env } from "../config/env.js"
import { AppError } from "../errors/AppError.js"

function handler(req, res, next) {
  next(AppError.tooManyRequests("Too many requests. Please slow down and try again shortly."))
}

// Layered rate limiting: a generous default limiter on every route, plus
// tighter limiters on sensitive endpoints (auth, credential creation,
// payment creation, refunds, payouts). Keyed by IP by default; auth-aware
// limiters additionally key by merchant/credential where available.
export const defaultLimiter = rateLimit({
  windowMs: env.rateLimit.windowMs,
  limit: env.rateLimit.maxDefault,
  standardHeaders: true,
  legacyHeaders: false,
  handler,
})

export const authLimiter = rateLimit({
  windowMs: env.rateLimit.windowMs,
  limit: env.rateLimit.maxAuth,
  standardHeaders: true,
  legacyHeaders: false,
  handler,
  keyGenerator: (req) => `${req.ip}:${req.body?.email || ""}`,
})

export const paymentCreateLimiter = rateLimit({
  windowMs: env.rateLimit.windowMs,
  limit: env.rateLimit.maxPaymentCreate,
  standardHeaders: true,
  legacyHeaders: false,
  handler,
  keyGenerator: (req) => req.apiCredential?.id || req.ip,
})

export const sensitiveActionLimiter = rateLimit({
  windowMs: env.rateLimit.windowMs,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  handler,
  keyGenerator: (req) => req.user?.id || req.apiCredential?.id || req.ip,
})
