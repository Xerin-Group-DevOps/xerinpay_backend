import { prisma } from "../database/prisma.js"
import { logger } from "../utils/logger.js"

export async function recordSecurityEvent({ type, severity = "LOW", actorUserId, merchantId, ipAddress, requestId, metadata = {} }) {
  try {
    await prisma.securityEvent.create({
      data: { type, severity, actorUserId, merchantId, ipAddress, requestId, metadata },
    })
  } catch (err) {
    logger.error({ err, type }, "failed to record security event")
  }
}
