import { Router } from "express"
import { authenticateUser } from "../../middleware/authenticateUser.js"
import { requirePermission } from "../../middleware/requirePermission.js"
import { sensitiveActionLimiter } from "../../middleware/rateLimit.js"
import { PERMISSIONS } from "../../config/permissions.js"
import * as admin from "../../controllers/adminController.js"

const router = Router()
router.use(authenticateUser)

router.get("/merchants", requirePermission(PERMISSIONS.MERCHANTS_MANAGE), admin.listMerchants)
router.get("/merchants/:merchantId", requirePermission(PERMISSIONS.MERCHANTS_MANAGE), admin.getMerchant)

router.get("/kyc", requirePermission(PERMISSIONS.KYC_REVIEW), admin.listKycQueue)
router.post("/merchants/:merchantId/kyc/review", requirePermission(PERMISSIONS.KYC_REVIEW), sensitiveActionLimiter, admin.reviewKyc)

router.get("/payments", requirePermission(PERMISSIONS.PAYMENTS_READ), admin.listPayments)

router.get("/payouts", requirePermission(PERMISSIONS.PAYOUTS_READ), admin.listPayouts)
router.post("/payouts/:payoutId/approve", requirePermission(PERMISSIONS.PAYOUTS_APPROVE), sensitiveActionLimiter, admin.approvePayoutHandler)
router.post("/payouts/:payoutId/complete", requirePermission(PERMISSIONS.PAYOUTS_APPROVE), sensitiveActionLimiter, admin.completePayoutHandler)
router.post("/payouts/:payoutId/fail", requirePermission(PERMISSIONS.PAYOUTS_APPROVE), sensitiveActionLimiter, admin.failPayoutHandler)

router.get("/providers", requirePermission(PERMISSIONS.PROVIDERS_MANAGE), admin.listProviders)
router.post("/providers/:providerId/credentials", requirePermission(PERMISSIONS.PROVIDERS_MANAGE), sensitiveActionLimiter, admin.upsertProviderCredential)

router.get("/audit-logs", requirePermission(PERMISSIONS.AUDIT_READ), admin.listAuditLogs)
router.get("/security-events", requirePermission(PERMISSIONS.AUDIT_READ), admin.listSecurityEvents)

router.get("/users", requirePermission(PERMISSIONS.USERS_MANAGE), admin.listUsers)
router.post("/users/:userId/roles", requirePermission(PERMISSIONS.USERS_MANAGE), sensitiveActionLimiter, admin.assignUserRole)

export default router
