import { Router } from "express"
import { authenticateUser } from "../../middleware/authenticateUser.js"
import { resolveMerchantContext, resolvePaymentProfile, requireMerchantPermission } from "../../middleware/resolveMerchantContext.js"
import { validateBody } from "../../middleware/validate.js"
import { sensitiveActionLimiter } from "../../middleware/rateLimit.js"
import { PERMISSIONS } from "../../config/permissions.js"
import * as merchantController from "../../controllers/merchantController.js"
import * as profileController from "../../controllers/paymentProfileController.js"
import * as credentialController from "../../controllers/apiCredentialController.js"
import * as webhookController from "../../controllers/webhookController.js"
import * as paymentController from "../../controllers/dashboardPaymentController.js"
import * as payoutController from "../../controllers/payoutController.js"
import {
  createProfileSchema, updateProfileSchema, createCredentialSchema, createWebhookSchema,
  refundSchema, payoutSchema, inviteMemberSchema, memberPermissionsSchema, kycSubmitSchema,
} from "../../validators/commonValidators.js"

const router = Router()
router.use(authenticateUser)

router.get("/", merchantController.listMyMerchants)

const scoped = Router({ mergeParams: true })
router.use("/:merchantId", resolveMerchantContext, scoped)

scoped.get("/", merchantController.getMerchant)
scoped.get("/dashboard-summary", merchantController.getDashboardSummary)
scoped.get("/wallet", merchantController.getWallet)

scoped.get("/kyc", merchantController.getKyc)
scoped.post("/kyc", validateBody(kycSubmitSchema), merchantController.submitKyc)

scoped.get("/team", merchantController.listTeam)
scoped.post("/team/invite", requireMerchantPermission(PERMISSIONS.USERS_MANAGE), validateBody(inviteMemberSchema), merchantController.inviteTeamMember)
scoped.patch("/team/:memberId/permissions", requireMerchantPermission(PERMISSIONS.USERS_MANAGE), validateBody(memberPermissionsSchema), merchantController.updateTeamMemberPermissions)

scoped.get("/payment-profiles", profileController.listProfiles)
scoped.post("/payment-profiles", requireMerchantPermission("payment_profiles.manage"), validateBody(createProfileSchema), profileController.createProfile)

const profileScoped = Router({ mergeParams: true })
scoped.use("/payment-profiles/:profileId", resolvePaymentProfile, profileScoped)

profileScoped.get("/", profileController.getProfile)
profileScoped.patch("/", requireMerchantPermission("payment_profiles.manage"), validateBody(updateProfileSchema), profileController.updateProfile)
profileScoped.post("/disable", requireMerchantPermission("payment_profiles.manage"), sensitiveActionLimiter, profileController.disableProfile)
profileScoped.post("/enable", requireMerchantPermission("payment_profiles.manage"), profileController.enableProfile)

profileScoped.get("/api-credentials", requireMerchantPermission(PERMISSIONS.API_MANAGE), credentialController.listCredentials)
profileScoped.post("/api-credentials", requireMerchantPermission(PERMISSIONS.API_MANAGE), sensitiveActionLimiter, validateBody(createCredentialSchema), credentialController.createCredential)
profileScoped.post("/api-credentials/:credentialId/revoke", requireMerchantPermission(PERMISSIONS.API_MANAGE), sensitiveActionLimiter, credentialController.revokeCredential)
profileScoped.post("/api-credentials/:credentialId/rotate", requireMerchantPermission(PERMISSIONS.API_MANAGE), sensitiveActionLimiter, credentialController.rotateCredential)

profileScoped.get("/webhooks", requireMerchantPermission(PERMISSIONS.WEBHOOKS_MANAGE), webhookController.listEndpoints)
profileScoped.post("/webhooks", requireMerchantPermission(PERMISSIONS.WEBHOOKS_MANAGE), validateBody(createWebhookSchema), webhookController.createEndpoint)
profileScoped.post("/webhooks/:webhookId/disable", requireMerchantPermission(PERMISSIONS.WEBHOOKS_MANAGE), webhookController.disableEndpoint)
profileScoped.get("/webhooks/:webhookId/deliveries", requireMerchantPermission(PERMISSIONS.WEBHOOKS_MANAGE), webhookController.listDeliveries)
profileScoped.post("/webhooks/:webhookId/deliveries/:deliveryId/replay", requireMerchantPermission(PERMISSIONS.WEBHOOKS_MANAGE), webhookController.replayWebhookDelivery)

scoped.get("/payments", requireMerchantPermission(PERMISSIONS.PAYMENTS_READ), paymentController.listPayments)
scoped.get("/payments/:paymentId", requireMerchantPermission(PERMISSIONS.PAYMENTS_READ), paymentController.getPayment)
scoped.post("/payments/:paymentId/refund", requireMerchantPermission(PERMISSIONS.PAYMENTS_REFUND), sensitiveActionLimiter, validateBody(refundSchema), paymentController.refundPayment)

scoped.get("/payouts", requireMerchantPermission(PERMISSIONS.PAYOUTS_READ), payoutController.listPayouts)
scoped.post("/payouts", requireMerchantPermission(PERMISSIONS.PAYOUTS_CREATE), sensitiveActionLimiter, validateBody(payoutSchema), payoutController.createPayoutRequest)

export default router
