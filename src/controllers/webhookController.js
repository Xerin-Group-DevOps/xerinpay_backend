import { asyncHandler } from "../utils/asyncHandler.js"
import { prisma } from "../database/prisma.js"
import { AppError } from "../errors/AppError.js"
import { createWebhookEndpoint, replayDelivery } from "../services/webhookService.js"
import { recordAudit } from "../services/auditService.js"

function serializeEndpoint(endpoint) {
  return {
    id: endpoint.publicId,
    url: endpoint.url,
    status: endpoint.status,
    subscribed_events: endpoint.subscribedEvents,
    created_at: endpoint.createdAt,
  }
}

export const listEndpoints = asyncHandler(async (req, res) => {
  const endpoints = await prisma.webhookEndpoint.findMany({ where: { paymentProfileId: req.paymentProfile.id }, orderBy: { createdAt: "desc" } })
  res.json({ success: true, data: endpoints.map(serializeEndpoint) })
})

export const createEndpoint = asyncHandler(async (req, res) => {
  const { endpoint, secret } = await createWebhookEndpoint({ paymentProfileId: req.paymentProfile.id, ...req.body })
  await recordAudit({
    actorType: req.user ? "USER" : "API_CREDENTIAL",
    actorUserId: req.user?.id ?? null,
    action: "webhook_endpoint.created",
    entityType: "WebhookEndpoint",
    entityId: endpoint.publicId,
    merchantId: req.merchant.id,
  })
  res.status(201).json({ success: true, data: { ...serializeEndpoint(endpoint), signing_secret: secret, signing_secret_notice: "Save this secret now — it will not be shown again." } })
})

async function loadOwnedEndpoint(req) {
  const endpoint = await prisma.webhookEndpoint.findUnique({ where: { publicId: req.params.webhookId } })
  if (!endpoint || endpoint.paymentProfileId !== req.paymentProfile.id) throw AppError.notFound("Webhook endpoint not found")
  return endpoint
}

export const listDeliveries = asyncHandler(async (req, res) => {
  const endpoint = await loadOwnedEndpoint(req)
  const deliveries = await prisma.webhookDelivery.findMany({ where: { webhookEndpointId: endpoint.id }, orderBy: { createdAt: "desc" }, take: 100 })
  res.json({
    success: true,
    data: deliveries.map((d) => ({
      id: d.publicId,
      event_type: d.eventType,
      status: d.status,
      attempt: d.attempt,
      response_status: d.responseStatus,
      response_latency_ms: d.responseLatencyMs,
      last_attempt_at: d.lastAttemptAt,
      created_at: d.createdAt,
    })),
  })
})

export const replayWebhookDelivery = asyncHandler(async (req, res) => {
  const endpoint = await loadOwnedEndpoint(req)
  const delivery = await prisma.webhookDelivery.findUnique({ where: { publicId: req.params.deliveryId } })
  if (!delivery || delivery.webhookEndpointId !== endpoint.id) throw AppError.notFound("Delivery not found")
  await replayDelivery(delivery.id)
  res.json({ success: true, data: { message: "Delivery replay queued" } })
})

export const disableEndpoint = asyncHandler(async (req, res) => {
  const endpoint = await loadOwnedEndpoint(req)
  const updated = await prisma.webhookEndpoint.update({ where: { id: endpoint.id }, data: { status: "DISABLED" } })
  await recordAudit({ actorType: "USER", actorUserId: req.user.id, action: "webhook_endpoint.disabled", entityType: "WebhookEndpoint", entityId: endpoint.publicId, merchantId: req.merchant.id })
  res.json({ success: true, data: serializeEndpoint(updated) })
})
