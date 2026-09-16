import { asyncHandler } from "../utils/asyncHandler.js"
import { getPublicCheckoutView, collectCheckoutPayment } from "../services/checkoutService.js"

export const getCheckout = asyncHandler(async (req, res) => {
  const data = await getPublicCheckoutView(req.params.paymentId)
  res.json({ success: true, data })
})

export const collectCheckout = asyncHandler(async (req, res) => {
  const data = await collectCheckoutPayment(req.params.paymentId, req.body)
  res.json({ success: true, data })
})
