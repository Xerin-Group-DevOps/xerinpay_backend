import { prisma } from "../database/prisma.js"
import { redactSensitive } from "../utils/redact.js"
import { logger } from "../utils/logger.js"

// Every operation that changes money, access, credentials or configuration
// must call this. Audit rows are never updated or deleted by application
// code (see DATABASE.md for retention).
export async function recordAudit({
  actorUserId = null,
  actorType = "USER",
  action,
  entityType,
  entityId = null,
  merchantId = null,
  ipAddress = null,
  requestId = null,
  metadata = {},
}) {
  try {
    await prisma.auditLog.create({
      data: {
        actorUserId,
        actorType,
        action,
        entityType,
        entityId,
        merchantId,
        ipAddress,
        requestId,
        metadata: redactSensitive(metadata),
      },
    })
  } catch (err) {
    logger.error({ err, action, entityType }, "failed to record audit log")
  }
}
