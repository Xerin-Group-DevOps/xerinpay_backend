import jwt from "jsonwebtoken"
import crypto from "node:crypto"
import { env } from "../config/env.js"

export function signAccessToken(user) {
  return jwt.sign(
    { sub: user.id, email: user.email },
    env.jwtAccessSecret,
    { expiresIn: `${env.jwtAccessTtlMinutes}m` },
  )
}

export function verifyAccessToken(token) {
  return jwt.verify(token, env.jwtAccessSecret)
}

export function generateRefreshToken() {
  return crypto.randomBytes(48).toString("base64url")
}

export function hashRefreshToken(token) {
  return crypto.createHash("sha256").update(token).digest("hex")
}
