import { asyncHandler } from "../utils/asyncHandler.js"
import { prisma } from "../database/prisma.js"
import { AppError } from "../errors/AppError.js"
import { serializePayment } from "../services/paymentSerializer.js"
import { createRefund } from "../services/refundService.js"

const PAGE_SIZE = 25

export const listPayments = asyncHandler(async (req, res) => {
  const { status, paymentProfileId, page = "1" } = req.query
  const where = {
    merchantId: req.merchant.id,
    ...(status ? { status } : {}),
    ...(paymentProfileId ? { paymentProfile: { publicId: paymentProfileId } } : {}),
  }

  const pageNum = Math.max(1, Number(page) || 1)
  const [items, total] = await Promise.all([
    prisma.payment.findMany({ where, orderBy: { createdAt: "desc" }, skip: (pageNum - 1) * PAGE_SIZE, take: PAGE_SIZE, include: { transactions: true } }),
    prisma.payment.count({ where }),
  ])

  res.json({
    success: true,
    data: items.map((p) => serializePayment(p, { transactions: p.transactions })),
    pagination: { page: pageNum, page_size: PAGE_SIZE, total },
  })
})

async function loadOwnedPayment(req) {
  const payment = await prisma.payment.findUnique({
    where: { publicId: req.params.paymentId },
    include: { transactions: true, stateTransitions: { orderBy: { createdAt: "asc" } } },
  })
  if (!payment || payment.merchantId !== req.merchant.id) throw AppError.notFound("Payment not found")
  return payment
}

export const getPayment = asyncHandler(async (req, res) => {
  const payment = await loadOwnedPayment(req)
  res.json({ success: true, data: serializePayment(payment, { transactions: payment.transactions, includeTimeline: true }) })
})

export const refundPayment = asyncHandler(async (req, res) => {
  const payment = await loadOwnedPayment(req)
  const result = await createRefund({ payment, amountMajor: req.body.amount, reason: req.body.reason, requestedByUserId: req.user.id })
  res.status(201).json({ success: true, data: result })
})
