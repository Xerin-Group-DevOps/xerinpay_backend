import { AppError } from "../errors/AppError.js"
import { asyncHandler } from "../utils/asyncHandler.js"
import { userHasPlatformPermission } from "../services/rbacService.js"

// For platform/admin routes only. Backend authorization is the security
// boundary — this is what actually blocks access, not the admin nav menu.
export function requirePermission(permissionKey) {
  return asyncHandler(async (req, res, next) => {
    if (!req.user) throw AppError.unauthorized()
    const allowed = await userHasPlatformPermission(req.user.id, permissionKey)
    if (!allowed) {
      throw AppError.forbidden(`Missing required permission: ${permissionKey}`)
    }
    next()
  })
}
