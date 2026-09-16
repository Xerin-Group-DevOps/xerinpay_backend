import { prisma } from "../database/prisma.js"
import { decryptSecret, encryptSecret } from "../security/encryption.js"
import { buildSignatureHeader } from "../security/hmac.js"
import { publicId } from "../utils/publicId.js"
import { logger } from "../utils/logger.js"
import crypto from "node:crypto"

// Retry schedule in minutes after each failed attempt (guide.md #153):
// immediate, short delay, increasing delay, final retry.
const RETRY_SCHEDULE_MINUTES = [1, 5, 30, 180]
const REQUEST_TIMEOUT_MS = 10_000

export const WEBHOOK_EVENTS = [
  "payment.created",
  "payment.pending",
  "payment.processing",
  "payment.success",
  "payment.failed",
  "payment.cancelled",
  "payment.refunded",
  "payment.partially_refunded",
  "payout.created",
  "payout.completed",
  "payout.failed",
]

export function generateWebhookSecret() {
  return `whsec_${crypto.randomBytes(24).toString("base64url")}`
}

export async function createWebhookEndpoint({ paymentProfileId, url, subscribedEvents }) {
  const secret = generateWebhookSecret()
  const endpoint = await prisma.webhookEndpoint.create({
    data: {
      paymentProfileId,
      url,
      encryptedSecret: encryptSecret(secret),
      subscribedEvents,
    },
  })
  // Only returned once, at creation — never re-displayed afterwards.
  return { endpoint, secret }
}

// Fans out an event to every active endpoint on the profile subscribed to
// it, then kicks off best-effort immediate delivery (retries are picked up
// by the periodic sweep in src/jobs/webhookRetryJob.js regardless).
export async function dispatchEvent(paymentProfileId, eventType, data) {
  if (!WEBHOOK_EVENTS.includes(eventType)) return

  const endpoints = await prisma.webhookEndpoint.findMany({
    where: { paymentProfileId, status: "ACTIVE" },
  })

  const eventId = publicId("evt")
  for (const endpoint of endpoints) {
    const subscribed = endpoint.subscribedEvents
    if (Array.isArray(subscribed) && subscribed.length > 0 && !subscribed.includes(eventType)) continue

    const delivery = await prisma.webhookDelivery.create({
      data: {
        webhookEndpointId: endpoint.id,
        eventType,
        eventId,
        payload: { id: eventId, type: eventType, created_at: new Date().toISOString(), data },
      },
    })
    attemptDelivery(delivery.id).catch((err) => logger.error({ err, deliveryId: delivery.id }, "webhook delivery failed"))
  }
}

export async function attemptDelivery(deliveryId) {
  const delivery = await prisma.webhookDelivery.findUnique({
    where: { id: deliveryId },
    include: { webhookEndpoint: true },
  })
  if (!delivery || delivery.status === "SUCCESS" || delivery.status === "EXHAUSTED") return

  const secret = decryptSecret(delivery.webhookEndpoint.encryptedSecret)
  const rawBody = JSON.stringify(delivery.payload)
  const signature = buildSignatureHeader(secret, rawBody)

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
  const startedAt = Date.now()

  try {
    const response = await fetch(delivery.webhookEndpoint.url, {
      method: "POST",
      headers: { "Content-Type": "application/json", "XerinPay-Signature": signature, "XerinPay-Event": delivery.eventType },
      body: rawBody,
      signal: controller.signal,
    })
    const latency = Date.now() - startedAt
    const bodySnippet = (await response.text().catch(() => "")).slice(0, 500)

    if (response.ok) {
      await prisma.webhookDelivery.update({
        where: { id: delivery.id },
        data: { status: "SUCCESS", attempt: delivery.attempt + 1, responseStatus: response.status, responseLatencyMs: latency, responseBodySnippet: bodySnippet, lastAttemptAt: new Date() },
      })
      return
    }
    await scheduleRetry(delivery, response.status, bodySnippet, latency)
  } catch (err) {
    await scheduleRetry(delivery, null, String(err?.message || err), Date.now() - startedAt)
  } finally {
    clearTimeout(timeout)
  }
}

async function scheduleRetry(delivery, responseStatus, bodySnippet, latency) {
  const nextAttempt = delivery.attempt + 1
  const exhausted = nextAttempt >= RETRY_SCHEDULE_MINUTES.length
  const delayMinutes = RETRY_SCHEDULE_MINUTES[Math.min(nextAttempt - 1, RETRY_SCHEDULE_MINUTES.length - 1)]

  await prisma.webhookDelivery.update({
    where: { id: delivery.id },
    data: {
      status: exhausted ? "EXHAUSTED" : "FAILED",
      attempt: nextAttempt,
      responseStatus,
      responseLatencyMs: latency,
      responseBodySnippet: bodySnippet,
      lastAttemptAt: new Date(),
      nextRetryAt: exhausted ? null : new Date(Date.now() + delayMinutes * 60_000),
    },
  })
}

export async function replayDelivery(deliveryId) {
  await prisma.webhookDelivery.update({ where: { id: deliveryId }, data: { status: "PENDING", nextRetryAt: null } })
  await attemptDelivery(deliveryId)
}

export async function sweepDueRetries() {
  const due = await prisma.webhookDelivery.findMany({
    where: { status: "FAILED", nextRetryAt: { lte: new Date() } },
    take: 50,
  })
  for (const delivery of due) {
    await attemptDelivery(delivery.id)
  }
}
