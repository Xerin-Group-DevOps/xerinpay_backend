import { prisma } from "../database/prisma.js"
import { sha256Hex } from "../security/hmac.js"
import { AppError } from "../errors/AppError.js"

function hashRequest(body) {
  return sha256Hex(JSON.stringify(body ?? {}, Object.keys(body ?? {}).sort()))
}

// Reserves an idempotency key before a financial mutation runs. Returns
// { replay: true, responseStatus, responseBody } if this exact request was
// already completed, or { replay: false, recordId } to proceed. Throws a
// 409 if the same key is reused with a different payload, or if another
// request with the same key is still in flight — this is what prevents
// duplicate payments from double-submits or network retries.
export async function reserveIdempotencyKey({ merchantId, paymentProfileId, apiCredentialId, endpoint, key, body }) {
  const requestHash = hashRequest(body)

  const existing = await prisma.idempotencyKey.findUnique({
    where: { paymentProfileId_endpoint_key: { paymentProfileId, endpoint, key } },
  })

  if (existing) {
    if (existing.requestHash !== requestHash) {
      throw AppError.conflict(
        "This idempotency key was already used with a different request payload.",
        "IDEMPOTENCY_KEY_CONFLICT",
      )
    }
    if (existing.status === "COMPLETED") {
      return { replay: true, responseStatus: existing.responseStatus, responseBody: existing.responseBody }
    }
    if (existing.status === "IN_PROGRESS") {
      throw AppError.conflict(
        "A request with this idempotency key is already being processed.",
        "IDEMPOTENCY_IN_PROGRESS",
      )
    }
    // Previously FAILED — safe to retry.
    await prisma.idempotencyKey.update({ where: { id: existing.id }, data: { status: "IN_PROGRESS" } })
    return { replay: false, recordId: existing.id }
  }

  try {
    const created = await prisma.idempotencyKey.create({
      data: { merchantId, paymentProfileId, apiCredentialId, endpoint, key, requestHash, status: "IN_PROGRESS" },
    })
    return { replay: false, recordId: created.id }
  } catch (err) {
    if (err.code === "P2002") {
      // Lost the race to a concurrent request with the same key.
      throw AppError.conflict(
        "A request with this idempotency key is already being processed.",
        "IDEMPOTENCY_IN_PROGRESS",
      )
    }
    throw err
  }
}

export async function completeIdempotencyKey(recordId, responseStatus, responseBody) {
  await prisma.idempotencyKey.update({
    where: { id: recordId },
    data: { status: "COMPLETED", responseStatus, responseBody },
  })
}

export async function failIdempotencyKey(recordId) {
  await prisma.idempotencyKey.update({ where: { id: recordId }, data: { status: "FAILED" } })
}
