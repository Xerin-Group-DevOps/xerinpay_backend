import { asyncHandler } from "../utils/asyncHandler.js"
import { AppError } from "../errors/AppError.js"
import { resolveProvider } from "../providers/index.js"
import { applyProviderOutcome } from "../services/paymentEngine.js"
import { logger } from "../utils/logger.js"

// Inbound provider webhook (guide.md #151): verify -> parse -> validate ->
// identify payment -> apply outcome (which itself is idempotent) -> return
// a safe response. Raw body is required for signature verification, so
// this route is mounted with a raw-body parser ahead of the JSON parser
// (see app.js).
export const selcomCallback = asyncHandler(async (req, res) => {
  const rawBody = req.body.toString("utf8")
  const provider = await resolveProvider("PRODUCTION").catch(() => null)

  if (!provider || !provider.verifyCallback(req.headers, rawBody)) {
    logger.warn({ requestId: req.requestId }, "rejected unverifiable selcom callback")
    throw AppError.unauthorized("Invalid callback signature", "INVALID_CALLBACK_SIGNATURE")
  }

  const parsed = JSON.parse(rawBody)
  const { providerReference, status } = provider.parseWebhook(parsed)
  if (!providerReference) throw AppError.badRequest("Callback missing order reference")

  await applyProviderOutcome({
    paymentPublicId: providerReference,
    providerKey: provider.key,
    environment: "PRODUCTION",
    providerReference,
    status,
    raw: parsed,
    actorType: "PROVIDER",
  })

  res.json({ success: true })
})
