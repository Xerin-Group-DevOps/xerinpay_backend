import { Router } from "express"
import { authenticateApiKey, requireScope } from "../../middleware/authenticateApiKey.js"
import { requireIdempotencyKey } from "../../middleware/idempotency.js"
import { validateBody } from "../../middleware/validate.js"
import { paymentCreateLimiter, sensitiveActionLimiter } from "../../middleware/rateLimit.js"
import { apiRequestLog } from "../../middleware/apiRequestLog.js"
import * as api from "../../controllers/publicApiController.js"
import * as webhookController from "../../controllers/webhookController.js"
import * as sandboxController from "../../controllers/sandboxController.js"
import { createPaymentSchema, refundSchema, createWebhookSchema, payoutSchema } from "../../validators/commonValidators.js"

const router = Router()
router.use(authenticateApiKey, apiRequestLog)

router.post("/payments", requireScope("payments:create"), paymentCreateLimiter, validateBody(createPaymentSchema), requireIdempotencyKey("POST /v1/payments"), api.createPaymentApi)
router.get("/payments", requireScope("payments:read"), api.listPaymentsApi)
router.get("/payments/:paymentId", requireScope("payments:read"), api.getPaymentApi)
router.post("/payments/:paymentId/refund", requireScope("payments:refund"), sensitiveActionLimiter, validateBody(refundSchema), requireIdempotencyKey("POST /v1/payments/:id/refund"), api.refundPaymentApi)

router.get("/transactions", requireScope("transactions:read"), api.listTransactionsApi)

router.get("/customers", requireScope("customers:read"), api.listCustomersApi)
router.post("/customers", requireScope("customers:write"), api.createCustomerApi)

router.get("/wallet", requireScope("wallet:read"), api.getWalletApi)

router.post("/payouts", requireScope("payouts:create"), sensitiveActionLimiter, validateBody(payoutSchema), requireIdempotencyKey("POST /v1/payouts"), api.createPayoutApi)
router.get("/payouts", requireScope("payouts:read"), api.listPayoutsApi)

router.get("/webhooks", requireScope("webhooks:read"), webhookController.listEndpoints)
router.post("/webhooks", requireScope("webhooks:manage"), validateBody(createWebhookSchema), webhookController.createEndpoint)

router.post("/sandbox/payments/:paymentId/simulate", sandboxController.simulateOutcome)

export default router
