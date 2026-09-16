import { describe, it, expect, vi, beforeAll } from "vitest"
import express from "express"
import request from "supertest"
import { hashSecretKey } from "../../src/security/apiKeys.js"

// This suite proves the guarantee from guide.md #115/#136: a credential
// belonging to one Payment Profile can never read another profile's data,
// even by guessing a syntactically valid public payment ID — and that
// revoked/expired credentials and missing scopes are rejected. The data
// layer is mocked (no live Postgres in this sandbox) but every request
// still passes through the real authenticateApiKey middleware and the real
// controller's ownership check.

const SECRET_A = "xsk_test_credential_A_0000000000000000000000000000"
const SECRET_B = "xsk_test_credential_B_0000000000000000000000000000"
const SECRET_REVOKED = "xsk_test_revoked_00000000000000000000000000000000"
const SECRET_EXPIRED = "xsk_test_expired_00000000000000000000000000000000"

const merchantA = { id: "merchant-a", publicId: "mch_a", status: "ACTIVE", currency: "TZS" }
const merchantB = { id: "merchant-b", publicId: "mch_b", status: "ACTIVE", currency: "TZS" }
const profileA = { id: "profile-a", publicId: "pp_a", merchantId: "merchant-a", status: "ACTIVE", currency: "TZS", merchant: merchantA }
const profileB = { id: "profile-b", publicId: "pp_b", merchantId: "merchant-b", status: "ACTIVE", currency: "TZS", merchant: merchantB }

const credentialA = { id: "cred-a", environment: "SANDBOX", status: "ACTIVE", scopes: ["payments:read"], ipAllowlist: [], expiresAt: null, paymentProfile: profileA, secretKeyHash: hashSecretKey(SECRET_A) }
const credentialB = { id: "cred-b", environment: "SANDBOX", status: "ACTIVE", scopes: ["payments:read"], ipAllowlist: [], expiresAt: null, paymentProfile: profileB, secretKeyHash: hashSecretKey(SECRET_B) }
const credentialRevoked = { id: "cred-revoked", environment: "SANDBOX", status: "REVOKED", scopes: ["payments:read"], ipAllowlist: [], expiresAt: null, paymentProfile: profileA, secretKeyHash: hashSecretKey(SECRET_REVOKED) }
const credentialExpired = { id: "cred-expired", environment: "SANDBOX", status: "ACTIVE", scopes: ["payments:read"], ipAllowlist: [], expiresAt: new Date("2000-01-01"), paymentProfile: profileA, secretKeyHash: hashSecretKey(SECRET_EXPIRED) }

const paymentA = { id: "payment-a", publicId: "pay_a", paymentProfileId: "profile-a", merchantId: "merchant-a", status: "SUCCESS", amountMinor: 1000n, currency: "TZS", transactions: [] }
const paymentB = { id: "payment-b", publicId: "pay_b", paymentProfileId: "profile-b", merchantId: "merchant-b", status: "SUCCESS", amountMinor: 2000n, currency: "TZS", transactions: [] }

vi.mock("../../src/database/prisma.js", () => ({
  prisma: {
    apiCredential: {
      findUnique: vi.fn(async ({ where: { secretKeyHash } }) => {
        const all = [credentialA, credentialB, credentialRevoked, credentialExpired]
        return all.find((c) => c.secretKeyHash === secretKeyHash) ?? null
      }),
      update: vi.fn(async () => ({})),
    },
    payment: {
      findUnique: vi.fn(async ({ where: { publicId } }) => {
        if (publicId === "pay_a") return paymentA
        if (publicId === "pay_b") return paymentB
        return null
      }),
    },
    securityEvent: { create: vi.fn(async () => ({})) },
  },
}))

let app

beforeAll(async () => {
  const { authenticateApiKey, requireScope } = await import("../../src/middleware/authenticateApiKey.js")
  const { requestId } = await import("../../src/middleware/requestId.js")
  const { errorHandler, notFoundHandler } = await import("../../src/middleware/errorHandler.js")
  const { getPaymentApi } = await import("../../src/controllers/publicApiController.js")

  app = express()
  app.use(requestId)
  app.get("/api/v1/payments/:paymentId", authenticateApiKey, requireScope("payments:read"), getPaymentApi)
  app.use(notFoundHandler)
  app.use(errorHandler)
})

describe("API credential tenant isolation", () => {
  it("lets credential A read its own profile's payment", async () => {
    const res = await request(app).get("/api/v1/payments/pay_a").set("Authorization", `Bearer ${SECRET_A}`)
    expect(res.status).toBe(200)
    expect(res.body.data.id).toBe("pay_a")
  })

  it("blocks credential A from reading profile B's payment, even with a real payment ID", async () => {
    const res = await request(app).get("/api/v1/payments/pay_b").set("Authorization", `Bearer ${SECRET_A}`)
    expect(res.status).toBe(404)
    expect(res.body.error.code).toBe("NOT_FOUND")
  })

  it("lets credential B read its own profile's payment", async () => {
    const res = await request(app).get("/api/v1/payments/pay_b").set("Authorization", `Bearer ${SECRET_B}`)
    expect(res.status).toBe(200)
    expect(res.body.data.id).toBe("pay_b")
  })

  it("rejects a revoked credential", async () => {
    const res = await request(app).get("/api/v1/payments/pay_a").set("Authorization", `Bearer ${SECRET_REVOKED}`)
    expect(res.status).toBe(401)
    expect(res.body.error.code).toBe("CREDENTIAL_REVOKED")
  })

  it("rejects an expired credential", async () => {
    const res = await request(app).get("/api/v1/payments/pay_a").set("Authorization", `Bearer ${SECRET_EXPIRED}`)
    expect(res.status).toBe(401)
    expect(res.body.error.code).toBe("CREDENTIAL_EXPIRED")
  })

  it("rejects a well-formed but unknown secret key", async () => {
    const res = await request(app).get("/api/v1/payments/pay_a").set("Authorization", "Bearer xsk_test_not_a_real_key_00000000000000000000000000")
    expect(res.status).toBe(401)
    expect(res.body.error.code).toBe("INVALID_API_KEY")
  })

  it("rejects requests with no Authorization header", async () => {
    const res = await request(app).get("/api/v1/payments/pay_a")
    expect(res.status).toBe(401)
  })

  it("every error response carries a request ID for support tracing", async () => {
    const res = await request(app).get("/api/v1/payments/pay_a")
    expect(res.body.error.request_id).toBeTruthy()
  })
})

describe("API scope enforcement", () => {
  it("rejects a credential without the required scope", async () => {
    const noScopeCredential = { ...credentialA, id: "cred-a-noscope", scopes: [], secretKeyHash: hashSecretKey("xsk_test_noscope_000000000000000000000000000000000") }
    const { prisma } = await import("../../src/database/prisma.js")
    prisma.apiCredential.findUnique.mockImplementationOnce(async () => noScopeCredential)

    const res = await request(app).get("/api/v1/payments/pay_a").set("Authorization", "Bearer xsk_test_noscope_000000000000000000000000000000000")
    expect(res.status).toBe(403)
    expect(res.body.error.code).toBe("SCOPE_DENIED")
  })
})
