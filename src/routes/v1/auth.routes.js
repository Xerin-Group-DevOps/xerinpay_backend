import { Router } from "express"
import * as authController from "../../controllers/authController.js"
import { authenticateUser } from "../../middleware/authenticateUser.js"
import { authLimiter, sensitiveActionLimiter } from "../../middleware/rateLimit.js"
import { validateBody } from "../../middleware/validate.js"
import { registerSchema, loginSchema, refreshSchema, forgotPasswordSchema, resetPasswordSchema } from "../../validators/authValidators.js"

const router = Router()

router.post("/register", authLimiter, validateBody(registerSchema), authController.register)
router.post("/login", authLimiter, validateBody(loginSchema), authController.login)
router.post("/refresh", authLimiter, validateBody(refreshSchema), authController.refresh)
router.post("/logout", authController.logout)
router.post("/password/forgot", authLimiter, validateBody(forgotPasswordSchema), authController.forgotPassword)
router.post("/password/reset", authLimiter, validateBody(resetPasswordSchema), authController.resetPassword)

router.get("/me", authenticateUser, authController.me)
router.get("/sessions", authenticateUser, authController.listSessions)
router.delete("/sessions/:sessionId", authenticateUser, sensitiveActionLimiter, authController.revokeSession)
router.post("/sessions/revoke-others", authenticateUser, sensitiveActionLimiter, authController.revokeOtherSessions)

export default router
