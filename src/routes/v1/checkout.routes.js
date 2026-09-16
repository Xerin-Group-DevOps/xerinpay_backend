import { Router } from "express"
import { validateBody } from "../../middleware/validate.js"
import { defaultLimiter } from "../../middleware/rateLimit.js"
import { collectCheckoutSchema } from "../../validators/commonValidators.js"
import * as checkoutController from "../../controllers/checkoutController.js"

const router = Router()
router.use(defaultLimiter)

router.get("/:paymentId", checkoutController.getCheckout)
router.post("/:paymentId/collect", validateBody(collectCheckoutSchema), checkoutController.collectCheckout)

export default router
