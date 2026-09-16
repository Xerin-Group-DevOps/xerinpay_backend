import { describe, it, expect } from "vitest"
import { memberHasPermission } from "../../src/services/rbacService.js"

describe("merchant staff permission scoping", () => {
  it("gives the OWNER every permission regardless of grants", () => {
    const owner = { role: "OWNER", profilePermissions: [] }
    expect(memberHasPermission(owner, "payments.refund", "profile-1")).toBe(true)
  })

  it("denies STAFF anything not explicitly granted", () => {
    const staff = { role: "STAFF", profilePermissions: [] }
    expect(memberHasPermission(staff, "payments.refund", "profile-1")).toBe(false)
  })

  it("grants STAFF a permission scoped to the matching profile only", () => {
    const staff = { role: "STAFF", profilePermissions: [{ permissionKey: "payments.refund", paymentProfileId: "profile-1" }] }
    expect(memberHasPermission(staff, "payments.refund", "profile-1")).toBe(true)
    expect(memberHasPermission(staff, "payments.refund", "profile-2")).toBe(false)
  })

  it("honours a global grant (null paymentProfileId) across all profiles", () => {
    const staff = { role: "STAFF", profilePermissions: [{ permissionKey: "transactions.read", paymentProfileId: null }] }
    expect(memberHasPermission(staff, "transactions.read", "profile-1")).toBe(true)
    expect(memberHasPermission(staff, "transactions.read", "profile-99")).toBe(true)
  })

  it("returns false for no membership at all", () => {
    expect(memberHasPermission(null, "payments.read", "profile-1")).toBe(false)
  })
})
