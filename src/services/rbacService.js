import { prisma } from "../database/prisma.js"

export async function getPlatformPermissions(userId) {
  const roles = await prisma.userRole.findMany({
    where: { userId },
    include: { role: { include: { permissions: { include: { permission: true } } } } },
  })
  const keys = new Set()
  for (const userRole of roles) {
    for (const rolePermission of userRole.role.permissions) {
      keys.add(rolePermission.permission.key)
    }
  }
  return keys
}

export async function userHasPlatformPermission(userId, permissionKey) {
  const permissions = await getPlatformPermissions(userId)
  return permissions.has(permissionKey)
}

export async function getMerchantMembership(userId, merchantId) {
  return prisma.merchantMember.findFirst({
    where: { userId, merchantId, status: "ACTIVE" },
    include: { profilePermissions: true },
  })
}

// OWNER always has full access. STAFF only has what was explicitly granted,
// either globally (paymentProfileId null) or for the specific profile.
export function memberHasPermission(member, permissionKey, paymentProfileId) {
  if (!member) return false
  if (member.role === "OWNER") return true
  return member.profilePermissions.some(
    (grant) =>
      grant.permissionKey === permissionKey &&
      (grant.paymentProfileId === null || grant.paymentProfileId === paymentProfileId),
  )
}
