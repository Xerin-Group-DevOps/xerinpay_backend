import { describe, it, expect, vi, beforeEach } from "vitest"

// Verifies the duplicate-payment guard from guide.md #25/#102: same key +
// same payload replays the stored response; same key + different payload
// is rejected outright; a second request already in flight is rejected
// rather than silently retried.

const store = new Map()

vi.mock("../../src/database/prisma.js", () => ({
  prisma: {
    idempotencyKey: {
      findUnique: vi.fn(async ({ where: { paymentProfileId_endpoint_key } }) => {
        const key = JSON.stringify(paymentProfileId_endpoint_key)
        return store.get(key) ?? null
      }),
      create: vi.fn(async ({ data }) => {
        const key = JSON.stringify({ paymentProfileId: data.paymentProfileId, endpoint: data.endpoint, key: data.key })
        if (store.has(key)) {
          const err = new Error("Unique constraint failed")
          err.code = "P2002"
          throw err
        }
        const record = { id: `${key}:${Date.now()}`, ...data }
        store.set(key, record)
        return record
      }),
      update: vi.fn(async ({ where: { id }, data }) => {
        for (const record of store.values()) {
          if (record.id === id) Object.assign(record, data)
        }
        return {}
      }),
    },
  },
}))

const { reserveIdempotencyKey, completeIdempotencyKey } = await import("../../src/services/idempotencyService.js")

beforeEach(() => store.clear())

describe("idempotency", () => {
  const base = { merchantId: "merchant-1", paymentProfileId: "profile-1", apiCredentialId: "cred-1", endpoint: "POST /v1/payments", key: "order-123" }

  it("reserves a fresh key and lets the request proceed", async () => {
    const result = await reserveIdempotencyKey({ ...base, body: { amount: 100 } })
    expect(result.replay).toBe(false)
    expect(result.recordId).toBeTruthy()
  })

  it("replays the stored response for a completed request with the same payload", async () => {
    const first = await reserveIdempotencyKey({ ...base, body: { amount: 100 } })
    await completeIdempotencyKey(first.recordId, 201, { success: true, data: { id: "pay_1" } })

    const second = await reserveIdempotencyKey({ ...base, body: { amount: 100 } })
    expect(second.replay).toBe(true)
    expect(second.responseStatus).toBe(201)
    expect(second.responseBody.data.id).toBe("pay_1")
  })

  it("rejects reuse of the same key with a different payload", async () => {
    await reserveIdempotencyKey({ ...base, body: { amount: 100 } })
    await expect(reserveIdempotencyKey({ ...base, body: { amount: 999 } })).rejects.toMatchObject({ code: "IDEMPOTENCY_KEY_CONFLICT" })
  })

  it("rejects a concurrent request that is still in flight", async () => {
    await reserveIdempotencyKey({ ...base, body: { amount: 100 } })
    await expect(reserveIdempotencyKey({ ...base, body: { amount: 100 } })).rejects.toMatchObject({ code: "IDEMPOTENCY_IN_PROGRESS" })
  })

  it("allows a retry after a previous attempt failed", async () => {
    const first = await reserveIdempotencyKey({ ...base, body: { amount: 100 } })
    // simulate the request handler failing
    const { failIdempotencyKey } = await import("../../src/services/idempotencyService.js")
    await failIdempotencyKey(first.recordId)

    const retry = await reserveIdempotencyKey({ ...base, body: { amount: 100 } })
    expect(retry.replay).toBe(false)
  })

  it("treats a database unique-constraint race (two concurrent creates) as another in-flight request", async () => {
    const { prisma } = await import("../../src/database/prisma.js")
    // Simulate two requests both passing the findUnique-returns-null check
    // before either has written a row: the second create() hits a unique
    // constraint violation rather than corrupting state.
    prisma.idempotencyKey.create.mockImplementationOnce(async () => {
      const err = new Error("Unique constraint failed")
      err.code = "P2002"
      throw err
    })

    await expect(reserveIdempotencyKey({ ...base, key: "race-key3", body: { amount: 1 } })).rejects.toMatchObject({
      code: "IDEMPOTENCY_IN_PROGRESS",
    })
  })
})
