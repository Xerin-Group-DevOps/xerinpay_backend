import { prisma } from "../database/prisma.js"
import { AppError } from "../errors/AppError.js"
import { serializeMoney } from "../utils/money.js"
import { resolveProvider } from "../providers/index.js"
import { applyProviderOutcome } from "./paymentEngine.js"

// The public checkout surface. No secret key is required — the payment was
// already created server-side by the merchant, so this only ever exposes
// what a paying customer needs to see, never internal IDs, merchant
// references, or anything provider-specific.
export async function getPublicCheckoutView(paymentPublicId) {
  const payment = await prisma.payment.findUnique({
    where: { publicId: paymentPublicId },
    include: { paymentProfile: { include: { merchant: true } } },
  })
  if (!payment) throw AppError.notFound("This payment link is invalid or has expired.")

  return {
    id: payment.publicId,
    status: payment.status,
    ...serializeMoney(payment.amountMinor, payment.currency),
    description: payment.description,
    merchant_name: payment.paymentProfile.name,
    merchant_logo_url: payment.paymentProfile.logoUrl,
    allowed_payment_methods: payment.paymentProfile.allowedPaymentMethods,
    support_email: payment.paymentProfile.supportEmail,
    is_terminal: ["SUCCESS", "FAILED", "CANCELLED", "EXPIRED", "REFUNDED"].includes(payment.status),
  }
}

export async function collectCheckoutPayment(paymentPublicId, { phone }) {
  const payment = await prisma.payment.findUnique({ where: { publicId: paymentPublicId }, include: { transactions: true } })
  if (!payment) throw AppError.notFound("This payment link is invalid or has expired.")
  if (!["CREATED", "PENDING", "PROCESSING"].includes(payment.status)) {
    throw AppError.conflict("This payment can no longer accept a payment method.", "PAYMENT_NOT_PAYABLE")
  }

  const provider = await resolveProvider(payment.environment)
  const latestTransaction = payment.transactions[payment.transactions.length - 1]
  const providerReference = latestTransaction?.providerReference ?? payment.publicId

  const result = await provider.collectPayment(providerReference, { phone, amountMinor: payment.amountMinor, currency: payment.currency })

  await applyProviderOutcome({
    paymentPublicId: payment.publicId,
    providerKey: provider.key,
    environment: payment.environment,
    providerReference,
    status: result.status,
    raw: result.raw,
    actorType: "SYSTEM",
  })

  return getPublicCheckoutView(paymentPublicId)
}
