import { asyncHandler } from "../utils/asyncHandler.js"
import { prisma } from "../database/prisma.js"
import { AppError } from "../errors/AppError.js"
import { createPayment } from "../services/paymentEngine.js"
import { createRefund } from "../services/refundService.js"
import { serializePayment } from "../services/paymentSerializer.js"
import { getMerchantWalletBalance } from "../services/ledgerService.js"
import { serializeMoney } from "../utils/money.js"
import { requestPayout } from "../services/payoutService.js"
import { publicId } from "../utils/publicId.js"

const PAGE_SIZE = 25

export const createPaymentApi = asyncHandler(async (req, res) => {
  const outcome = await createPayment({
    paymentProfile: req.paymentProfile,
    merchant: req.merchant,
    environment: req.environment,
    amountMajor: req.body.amount,
    currency: req.body.currency,
    merchantReference: req.body.merchantReference,
    description: req.body.description,
    customer: req.body.customer,
    paymentMethod: req.body.paymentMethod,
    metadata: req.body.metadata,
  })

  const body = { success: true, data: serializePayment(outcome.payment, { transactions: [outcome.transaction] }) }
  await req.idempotency.complete(201, body)
  res.status(201).json(body)
})

export const listPaymentsApi = asyncHandler(async (req, res) => {
  const page = Math.max(1, Number(req.query.page) || 1)
  const where = { paymentProfileId: req.paymentProfile.id, ...(req.query.status ? { status: req.query.status } : {}) }
  const [items, total] = await Promise.all([
    prisma.payment.findMany({ where, orderBy: { createdAt: "desc" }, skip: (page - 1) * PAGE_SIZE, take: PAGE_SIZE, include: { transactions: true } }),
    prisma.payment.count({ where }),
  ])
  res.json({ success: true, data: items.map((p) => serializePayment(p, { transactions: p.transactions })), pagination: { page, page_size: PAGE_SIZE, total } })
})

async function loadPaymentScopedToProfile(req) {
  const payment = await prisma.payment.findUnique({ where: { publicId: req.params.paymentId }, include: { transactions: true } })
  // Credential A must never resolve Profile B's payment, even by guessing a
  // valid public ID — this is the check that enforces it (guide.md #115).
  if (!payment || payment.paymentProfileId !== req.paymentProfile.id) throw AppError.notFound("Payment not found")
  return payment
}

export const getPaymentApi = asyncHandler(async (req, res) => {
  const payment = await loadPaymentScopedToProfile(req)
  res.json({ success: true, data: serializePayment(payment, { transactions: payment.transactions }) })
})

export const refundPaymentApi = asyncHandler(async (req, res) => {
  const payment = await loadPaymentScopedToProfile(req)
  const result = await createRefund({ payment, amountMajor: req.body.amount, reason: req.body.reason, requestedByUserId: null })
  const body = { success: true, data: result }
  await req.idempotency.complete(201, body)
  res.status(201).json(body)
})

export const listTransactionsApi = asyncHandler(async (req, res) => {
  const page = Math.max(1, Number(req.query.page) || 1)
  const where = { payment: { paymentProfileId: req.paymentProfile.id } }
  const [items, total] = await Promise.all([
    prisma.transaction.findMany({ where, orderBy: { createdAt: "desc" }, skip: (page - 1) * PAGE_SIZE, take: PAGE_SIZE }),
    prisma.transaction.count({ where }),
  ])
  res.json({
    success: true,
    data: items.map((t) => ({ id: t.publicId, payment_id: t.paymentId, status: t.status, ...serializeMoney(t.amountMinor, t.currency), provider_reference: t.providerReference, created_at: t.createdAt })),
    pagination: { page, page_size: PAGE_SIZE, total },
  })
})

export const listCustomersApi = asyncHandler(async (req, res) => {
  const customers = await prisma.customer.findMany({ where: { paymentProfileId: req.paymentProfile.id }, orderBy: { createdAt: "desc" }, take: 100 })
  res.json({ success: true, data: customers.map((c) => ({ id: c.publicId, name: c.name, email: c.email, phone: c.phone, created_at: c.createdAt })) })
})

export const createCustomerApi = asyncHandler(async (req, res) => {
  const customer = await prisma.customer.create({
    data: { publicId: publicId("cus"), merchantId: req.merchant.id, paymentProfileId: req.paymentProfile.id, name: req.body.name, email: req.body.email, phone: req.body.phone, metadata: req.body.metadata || {} },
  })
  res.status(201).json({ success: true, data: { id: customer.publicId, name: customer.name, email: customer.email, phone: customer.phone } })
})

export const getWalletApi = asyncHandler(async (req, res) => {
  const wallet = await getMerchantWalletBalance(prisma, req.merchant.id, req.merchant.currency)
  res.json({ success: true, data: { available_balance: serializeMoney(wallet.availableMinor, req.merchant.currency) } })
})

export const createPayoutApi = asyncHandler(async (req, res) => {
  const payout = await requestPayout({
    merchant: req.merchant,
    amountMajor: req.body.amount,
    destination: { type: req.body.destinationType, ...req.body.destinationDetails },
    requestedByUserId: null,
    defaultPaymentProfileId: req.paymentProfile.id,
  })
  const body = { success: true, data: { id: payout.publicId, status: payout.status, ...serializeMoney(payout.amountMinor, payout.currency) } }
  await req.idempotency.complete(201, body)
  res.status(201).json(body)
})

export const listPayoutsApi = asyncHandler(async (req, res) => {
  const payouts = await prisma.payout.findMany({ where: { merchantId: req.merchant.id }, orderBy: { createdAt: "desc" }, take: 50 })
  res.json({ success: true, data: payouts.map((p) => ({ id: p.publicId, status: p.status, ...serializeMoney(p.amountMinor, p.currency), created_at: p.createdAt })) })
})
