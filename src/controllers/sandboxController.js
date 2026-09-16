import { asyncHandler } from "../utils/asyncHandler.js"
import { AppError } from "../errors/AppError.js"
import { prisma } from "../database/prisma.js"
import { sandboxProvider } from "../providers/SandboxProvider.js"
import { applyProviderOutcome } from "../services/paymentEngine.js"

const VALID_OUTCOMES = ["SUCCESS", "FAILED", "PENDING"]

// Lets a developer manually resolve a payment that was created with
// metadata.sandbox_outcome = "PENDING", the same way a real provider's
// async webhook would eventually arrive (guide.md #41).
export const simulateOutcome = asyncHandler(async (req, res) => {
  const { outcome } = req.body
  if (!VALID_OUTCOMES.includes(outcome)) {
    throw AppError.badRequest(`outcome must be one of ${VALID_OUTCOMES.join(", ")}`, "INVALID_OUTCOME")
  }

  const payment = await prisma.payment.findUnique({ where: { publicId: req.params.paymentId } })
  if (!payment || payment.paymentProfileId !== req.paymentProfile.id) throw AppError.notFound("Payment not found")
  if (payment.environment !== "SANDBOX") {
    throw AppError.badRequest("Only sandbox payments can be simulated", "NOT_SANDBOX")
  }

  const result = sandboxProvider.resolvePendingOrder(payment.publicId, outcome)
  const outcomeResult = await applyProviderOutcome({
    paymentPublicId: payment.publicId,
    providerKey: "sandbox",
    environment: "SANDBOX",
    providerReference: result.providerReference,
    status: result.status,
    raw: result.raw,
    actorType: "USER",
    actorId: req.apiCredential.createdByUserId,
  })

  res.json({ success: true, data: { status: outcomeResult.payment.status } })
})
