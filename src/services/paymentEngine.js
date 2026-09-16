import { prisma } from "../database/prisma.js"
import { AppError } from "../errors/AppError.js"
import { toMinorUnits } from "../utils/money.js"
import { publicId } from "../utils/publicId.js"
import { resolveProvider } from "../providers/index.js"
import { selectFeeRule, calculateFee } from "./feeService.js"
import { transitionPayment } from "../domain/paymentStateMachine.js"
import { postPaymentSuccess } from "./ledgerService.js"
import { dispatchEvent } from "./webhookService.js"
import { recordAudit } from "./auditService.js"
import { serializePayment } from "./paymentSerializer.js"

const PROVIDER_STATUS_TO_EVENT = {
  PENDING: "payment.pending",
  PROCESSING: "payment.processing",
  SUCCESS: "payment.success",
  FAILED: "payment.failed",
}

// The single entry point for creating a payment. Flow (guide.md #26):
// validate -> fee calculation -> provider adapter -> transaction state
// machine -> ledger (on success) -> merchant webhook. Idempotency is
// enforced by the caller (see middleware/idempotency.js) before this runs.
export async function createPayment({ paymentProfile, merchant, environment, amountMajor, currency, merchantReference, description, customer, paymentMethod, metadata = {} }) {
  if (currency !== paymentProfile.currency) {
    throw AppError.badRequest(`This payment profile only accepts ${paymentProfile.currency}.`, "CURRENCY_NOT_SUPPORTED")
  }

  let amountMinor
  try {
    amountMinor = toMinorUnits(amountMajor, currency)
  } catch (err) {
    throw AppError.badRequest(err.message, "INVALID_AMOUNT")
  }

  const orderPublicId = publicId("pay")

  let customerRecord = null
  if (customer?.email || customer?.phone) {
    customerRecord = await prisma.customer.findFirst({
      where: {
        paymentProfileId: paymentProfile.id,
        OR: [customer.email ? { email: customer.email } : undefined, customer.phone ? { phone: customer.phone } : undefined].filter(Boolean),
      },
    })
    if (!customerRecord) {
      customerRecord = await prisma.customer.create({
        data: { publicId: publicId("cus"), merchantId: merchant.id, paymentProfileId: paymentProfile.id, name: customer.name, email: customer.email, phone: customer.phone },
      })
    }
  }

  const payment = await prisma.payment.create({
    data: {
      publicId: orderPublicId,
      merchantId: merchant.id,
      paymentProfileId: paymentProfile.id,
      customerId: customerRecord?.id ?? null,
      environment,
      amountMinor,
      currency,
      merchantReference: merchantReference ?? null,
      description: description ?? null,
      paymentMethod: paymentMethod ?? "mobile_money",
      successUrl: paymentProfile.successUrl,
      failureUrl: paymentProfile.failureUrl,
      cancelUrl: paymentProfile.cancelUrl,
      metadata,
    },
  })

  await dispatchEvent(paymentProfile.id, "payment.created", serializePayment(payment))
  await recordAudit({ actorType: "API_CREDENTIAL", actorUserId: null, action: "payment.created", entityType: "Payment", entityId: payment.publicId, merchantId: merchant.id, metadata: { amountMinor: amountMinor.toString(), currency } })

  const provider = await resolveProvider(environment)

  let providerResult
  try {
    providerResult = await provider.createPayment({
      orderId: payment.publicId,
      amountMinor,
      currency,
      customerName: customer?.name,
      customerEmail: customer?.email,
      customerPhone: customer?.phone,
      description,
      sandboxOutcome: environment === "SANDBOX" ? metadata.sandbox_outcome : undefined,
    })
  } catch (err) {
    providerResult = { providerReference: payment.publicId, status: "PENDING", raw: { error: String(err?.message || err) }, providerUnavailable: true }
  }

  const result = await applyProviderOutcome({
    paymentPublicId: payment.publicId,
    providerKey: provider.key,
    environment,
    providerReference: providerResult.providerReference,
    status: providerResult.status,
    raw: providerResult.raw,
    actorType: "SYSTEM",
  })

  return result
}

// Applies a provider result (from creation, a status-check poll, or an
// inbound webhook) to a payment. Idempotent: re-applying the same status is
// a safe no-op (guide.md #103), and out-of-order/invalid transitions are
// rejected by the state machine rather than silently accepted.
export async function applyProviderOutcome({ paymentPublicId, providerKey, environment, providerReference, status, raw, actorType = "SYSTEM", actorId = null }) {
  const outcome = await prisma.$transaction(async (tx) => {
    const payment = await tx.payment.findUnique({ where: { publicId: paymentPublicId }, include: { paymentProfile: true } })
    if (!payment) throw AppError.notFound("Payment not found")

    let transaction = await tx.transaction.findFirst({ where: { paymentId: payment.id, providerReference }, orderBy: { createdAt: "desc" } })

    let feeAmountMinor = 0n
    let netAmountMinor = payment.amountMinor

    if (status === "SUCCESS" && payment.status !== "SUCCESS") {
      const rules = await tx.feeRule.findMany({ where: { OR: [{ merchantId: payment.merchantId }, { merchantId: null }] } })
      const rule = selectFeeRule(rules, {
        paymentProfileId: payment.paymentProfileId,
        merchantId: payment.merchantId,
        paymentMethod: payment.paymentMethod,
        currency: payment.currency,
      })
      feeAmountMinor = calculateFee(rule, payment.amountMinor)
      netAmountMinor = payment.amountMinor - feeAmountMinor
    }

    if (transaction) {
      transaction = await tx.transaction.update({
        where: { id: transaction.id },
        data: { status, rawResponse: raw, feeAmountMinor, netAmountMinor },
      })
    } else {
      transaction = await tx.transaction.create({
        data: {
          publicId: publicId("txn"),
          paymentId: payment.id,
          providerKey,
          environment,
          providerReference,
          status,
          amountMinor: payment.amountMinor,
          currency: payment.currency,
          feeAmountMinor,
          netAmountMinor,
          paymentMethod: payment.paymentMethod,
          rawResponse: raw,
        },
      })
    }

    const { payment: updatedPayment, changed } = await transitionPayment(tx, payment, status, {
      actorType,
      actorId,
      providerReference,
    })

    if (changed && status === "SUCCESS") {
      await postPaymentSuccess(tx, {
        merchantId: payment.merchantId,
        currency: payment.currency,
        amountMinor: payment.amountMinor,
        feeAmountMinor,
        paymentId: payment.id,
      })
    }

    return { payment: updatedPayment, transaction, profile: payment.paymentProfile, changed }
  })

  if (outcome.changed) {
    const event = PROVIDER_STATUS_TO_EVENT[status]
    if (event) {
      await dispatchEvent(outcome.profile.id, event, serializePayment(outcome.payment, { transactions: [outcome.transaction] }))
    }
    await recordAudit({
      actorType,
      action: `payment.${status.toLowerCase()}`,
      entityType: "Payment",
      entityId: outcome.payment.publicId,
      merchantId: outcome.payment.merchantId,
      metadata: { providerReference },
    })
  }

  return outcome
}

export async function checkAndReconcileStatus(paymentPublicId) {
  const payment = await prisma.payment.findUnique({ where: { publicId: paymentPublicId }, include: { transactions: true } })
  if (!payment) throw AppError.notFound("Payment not found")
  if (["SUCCESS", "FAILED", "CANCELLED", "EXPIRED", "REFUNDED"].includes(payment.status)) {
    return payment
  }

  const provider = await resolveProvider(payment.environment)
  const latestTransaction = payment.transactions[payment.transactions.length - 1]
  const providerReference = latestTransaction?.providerReference ?? payment.publicId
  const result = await provider.checkPaymentStatus(providerReference)

  await applyProviderOutcome({
    paymentPublicId: payment.publicId,
    providerKey: provider.key,
    environment: payment.environment,
    providerReference,
    status: result.status,
    raw: result.raw,
    actorType: "SYSTEM",
  })

  return prisma.payment.findUnique({ where: { publicId: paymentPublicId } })
}
