import pino from "pino"
import { env } from "../config/env.js"

const REDACT_PATHS = [
  "req.headers.authorization",
  "*.password",
  "*.secret",
  "*.secretKey",
  "*.secret_key",
  "*.apiSecret",
  "*.token",
  "*.encryptedConfig",
  "*.encryptedSecret",
]

export const logger = pino({
  level: env.isTest ? "silent" : env.isProduction ? "info" : "debug",
  redact: { paths: REDACT_PATHS, censor: "[REDACTED]" },
})
