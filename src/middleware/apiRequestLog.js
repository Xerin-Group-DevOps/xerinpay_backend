import { prisma } from "../database/prisma.js"
import { logger } from "../utils/logger.js"

// Populates Developers -> API Logs. Runs after the response is sent so it
// never adds latency to the caller, and never logs the Authorization
// header or request/response bodies (guide.md #39).
export function apiRequestLog(req, res, next) {
  const startedAt = Date.now()
  res.on("finish", () => {
    if (!req.apiCredential) return
    prisma.apiRequestLog
      .create({
        data: {
          requestId: req.requestId,
          merchantId: req.merchant?.id ?? null,
          paymentProfileId: req.paymentProfile?.id ?? null,
          apiCredentialId: req.apiCredential?.id ?? null,
          environment: req.environment ?? null,
          method: req.method,
          path: req.originalUrl.split("?")[0],
          statusCode: res.statusCode,
          latencyMs: Date.now() - startedAt,
          ipAddress: req.ip,
        },
      })
      .catch((err) => logger.error({ err }, "failed to write api request log"))
  })
  next()
}
