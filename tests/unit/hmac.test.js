import { describe, it, expect, vi } from "vitest"
import { buildSignatureHeader, verifySignatureHeader, sha256Hex } from "../../src/security/hmac.js"

describe("webhook HMAC signing", () => {
  it("verifies a signature it generated itself", () => {
    const secret = "whsec_test"
    const body = JSON.stringify({ hello: "world" })
    const header = buildSignatureHeader(secret, body)
    expect(verifySignatureHeader(secret, header, body)).toBe(true)
  })

  it("rejects a signature verified with the wrong secret", () => {
    const body = JSON.stringify({ hello: "world" })
    const header = buildSignatureHeader("whsec_a", body)
    expect(verifySignatureHeader("whsec_b", header, body)).toBe(false)
  })

  it("rejects a tampered payload", () => {
    const secret = "whsec_test"
    const header = buildSignatureHeader(secret, JSON.stringify({ amount: 100 }))
    expect(verifySignatureHeader(secret, header, JSON.stringify({ amount: 100000 }))).toBe(false)
  })

  it("rejects a stale timestamp outside the replay tolerance", () => {
    const secret = "whsec_test"
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-01-01T00:00:00Z"))
    const body = "{}"
    const header = buildSignatureHeader(secret, body)
    vi.setSystemTime(new Date("2026-01-01T00:10:00Z")) // 10 minutes later
    expect(verifySignatureHeader(secret, header, body, 5 * 60 * 1000)).toBe(false)
    vi.useRealTimers()
  })

  it("produces deterministic hashes for idempotency request fingerprints", () => {
    expect(sha256Hex("same-input")).toBe(sha256Hex("same-input"))
    expect(sha256Hex("input-a")).not.toBe(sha256Hex("input-b"))
  })
})
