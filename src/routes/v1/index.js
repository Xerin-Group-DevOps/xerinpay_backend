import { Router } from "express"
import authRoutes from "./auth.routes.js"
import merchantsRoutes from "./merchants.routes.js"
import publicApiRoutes from "./publicApi.routes.js"
import checkoutRoutes from "./checkout.routes.js"
import adminRoutes from "./admin.routes.js"

const router = Router()

router.use("/auth", authRoutes)
router.use("/merchants", merchantsRoutes)
router.use("/checkout", checkoutRoutes)
router.use("/admin", adminRoutes)
// Credential-authenticated merchant API surface — mounted last at the root
// of /api/v1 so paths read as /api/v1/payments, /api/v1/payouts, etc.
router.use("/", publicApiRoutes)

export default router
