import { z } from "zod"
import { API_SCOPES } from "../config/permissions.js"
import { WEBHOOK_EVENTS } from "../services/webhookService.js"

export const createProfileSchema = z.object({
  name: z.string().trim().min(2).max(120),
  description: z.string().trim().max(500).optional(),
  country: z.string().trim().length(2).optional(),
  currency: z.string().trim().length(3).optional(),
  successUrl: z.string().url().optional(),
  failureUrl: z.string().url().optional(),
  cancelUrl: z.string().url().optional(),
  supportEmail: z.string().email().optional(),
})

export const updateProfileSchema = createProfileSchema.partial()

export const createCredentialSchema = z.object({
  environment: z.enum(["SANDBOX", "PRODUCTION"]),
  name: z.string().trim().min(2).max(120),
  scopes: z.array(z.enum(API_SCOPES)).min(1),
  ipAllowlist: z.array(z.string()).optional(),
  expiresAt: z.string().datetime().optional(),
})

export const createWebhookSchema = z.object({
  url: z.string().url(),
  subscribedEvents: z.array(z.enum(WEBHOOK_EVENTS)).min(1),
})

export const createPaymentSchema = z.object({
  amount: z.union([z.string(), z.number()]),
  currency: z.string().trim().length(3),
  merchantReference: z.string().trim().max(120).optional(),
  description: z.string().trim().max(500).optional(),
  paymentMethod: z.string().trim().max(40).optional(),
  customer: z
    .object({
      name: z.string().trim().max(120).optional(),
      email: z.string().email().optional(),
      phone: z.string().trim().max(20).optional(),
    })
    .optional(),
  metadata: z.record(z.any()).optional(),
})

export const refundSchema = z.object({
  amount: z.union([z.string(), z.number()]).optional(),
  reason: z.string().trim().max(300).optional(),
})

export const payoutSchema = z.object({
  amount: z.union([z.string(), z.number()]),
  destinationType: z.enum(["mobile_money", "bank_account"]),
  destinationDetails: z.record(z.any()),
})

export const inviteMemberSchema = z.object({
  email: z.string().email(),
  role: z.enum(["OWNER", "STAFF"]),
})

export const memberPermissionsSchema = z.object({
  paymentProfileId: z.string().nullable(),
  permissionKeys: z.array(z.string()),
})

export const kycSubmitSchema = z.object({
  businessInfo: z.record(z.any()),
  ownerInfo: z.record(z.any()),
})

export const collectCheckoutSchema = z.object({
  phone: z.string().trim().min(9).max(20),
})
