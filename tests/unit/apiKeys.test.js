import { describe, it, expect } from "vitest"
import { generateApiKeyPair, hashSecretKey, lastFour } from "../../src/security/apiKeys.js"

describe("API key generation", () => {
  it("generates sandbox keys with the test prefix and production keys with the live prefix", () => {
    expect(generateApiKeyPair("SANDBOX").publicKey).toMatch(/^xpk_test_/)
    expect(generateApiKeyPair("SANDBOX").secretKey).toMatch(/^xsk_test_/)
    expect(generateApiKeyPair("PRODUCTION").publicKey).toMatch(/^xpk_live_/)
    expect(generateApiKeyPair("PRODUCTION").secretKey).toMatch(/^xsk_live_/)
  })

  it("never generates the same secret twice", () => {
    const seen = new Set()
    for (let i = 0; i < 200; i++) {
      seen.add(generateApiKeyPair("SANDBOX").secretKey)
    }
    expect(seen.size).toBe(200)
  })

  it("hashes deterministically so lookups work, but never reveals the secret", () => {
    const { secretKey } = generateApiKeyPair("SANDBOX")
    const hash1 = hashSecretKey(secretKey)
    const hash2 = hashSecretKey(secretKey)
    expect(hash1).toBe(hash2)
    expect(hash1).not.toContain(secretKey)
  })

  it("exposes only the last 4 characters for display", () => {
    const { secretKey } = generateApiKeyPair("PRODUCTION")
    expect(lastFour(secretKey)).toBe(secretKey.slice(-4))
    expect(lastFour(secretKey).length).toBe(4)
  })
})
