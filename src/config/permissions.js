// Canonical permission keys and the platform roles that hold them.
// Frontend route guards are UX only — every one of these is enforced in
// backend middleware (see src/middleware/requirePermission.js).

export const PERMISSIONS = {
  PAYMENTS_READ: "payments.read",
  PAYMENTS_CREATE: "payments.create",
  PAYMENTS_REFUND: "payments.refund",
  TRANSACTIONS_READ: "transactions.read",
  PAYOUTS_READ: "payouts.read",
  PAYOUTS_CREATE: "payouts.create",
  PAYOUTS_APPROVE: "payouts.approve",
  REPORTS_READ: "reports.read",
  USERS_MANAGE: "users.manage",
  MERCHANTS_MANAGE: "merchants.manage",
  KYC_REVIEW: "kyc.review",
  SETTINGS_MANAGE: "settings.manage",
  API_MANAGE: "api.manage",
  WEBHOOKS_MANAGE: "webhooks.manage",
  PROVIDERS_MANAGE: "providers.manage",
  AUDIT_READ: "audit.read",
}

export const PLATFORM_ROLES = {
  SUPER_ADMIN: {
    name: "Super Admin",
    permissions: Object.values(PERMISSIONS),
  },
  ADMINISTRATOR: {
    name: "Administrator",
    permissions: [
      PERMISSIONS.PAYMENTS_READ,
      PERMISSIONS.TRANSACTIONS_READ,
      PERMISSIONS.PAYOUTS_READ,
      PERMISSIONS.REPORTS_READ,
      PERMISSIONS.USERS_MANAGE,
      PERMISSIONS.MERCHANTS_MANAGE,
      PERMISSIONS.KYC_REVIEW,
      PERMISSIONS.SETTINGS_MANAGE,
      PERMISSIONS.API_MANAGE,
      PERMISSIONS.WEBHOOKS_MANAGE,
      PERMISSIONS.PROVIDERS_MANAGE,
      PERMISSIONS.AUDIT_READ,
    ],
  },
  FINANCE: {
    name: "Finance",
    permissions: [
      PERMISSIONS.PAYMENTS_READ,
      PERMISSIONS.TRANSACTIONS_READ,
      PERMISSIONS.PAYMENTS_REFUND,
      PERMISSIONS.PAYOUTS_READ,
      PERMISSIONS.PAYOUTS_CREATE,
      PERMISSIONS.PAYOUTS_APPROVE,
      PERMISSIONS.REPORTS_READ,
    ],
  },
  OPERATIONS: {
    name: "Operations",
    permissions: [
      PERMISSIONS.PAYMENTS_READ,
      PERMISSIONS.TRANSACTIONS_READ,
      PERMISSIONS.MERCHANTS_MANAGE,
      PERMISSIONS.KYC_REVIEW,
      PERMISSIONS.REPORTS_READ,
    ],
  },
  SUPPORT: {
    name: "Support",
    permissions: [PERMISSIONS.PAYMENTS_READ, PERMISSIONS.TRANSACTIONS_READ, PERMISSIONS.AUDIT_READ],
  },
  DEVELOPER: {
    name: "Developer",
    permissions: [PERMISSIONS.API_MANAGE, PERMISSIONS.WEBHOOKS_MANAGE, PERMISSIONS.PAYMENTS_READ],
  },
}

// Default scoped permissions available to merchant dashboard users
// (merchant owner has all of these implicitly; staff are granted a subset
// per Payment Profile — see MerchantMemberPermission).
export const MERCHANT_PERMISSIONS = [
  PERMISSIONS.PAYMENTS_READ,
  PERMISSIONS.PAYMENTS_CREATE,
  PERMISSIONS.PAYMENTS_REFUND,
  PERMISSIONS.TRANSACTIONS_READ,
  PERMISSIONS.PAYOUTS_READ,
  PERMISSIONS.PAYOUTS_CREATE,
  PERMISSIONS.REPORTS_READ,
  PERMISSIONS.API_MANAGE,
  PERMISSIONS.WEBHOOKS_MANAGE,
]

// API credential scopes. Only list scopes with a real, implemented endpoint
// behind them.
export const API_SCOPES = [
  "payments:read",
  "payments:create",
  "payments:refund",
  "transactions:read",
  "customers:read",
  "customers:write",
  "wallet:read",
  "payouts:read",
  "payouts:create",
  "webhooks:read",
  "webhooks:manage",
  "reports:read",
]
