import { describe, it, expect } from "vitest"
import { redactSensitive, maskEmail, maskPhone } from "../../src/utils/redact.js"

describe("redaction", () => {
  it("redacts sensitive keys at any depth without touching other fields", () => {
    const input = { email: "a@b.com", password: "hunter2", nested: { apiSecret: "xsk_live_abc", ok: 1 } }
    const output = redactSensitive(input)
    expect(output.password).toBe("[REDACTED]")
    expect(output.nested.apiSecret).toBe("[REDACTED]")
    expect(output.email).toBe("a@b.com")
    expect(output.nested.ok).toBe(1)
  })

  it("redacts inside arrays too", () => {
    const output = redactSensitive([{ token: "abc" }, { fine: "yes" }])
    expect(output[0].token).toBe("[REDACTED]")
    expect(output[1].fine).toBe("yes")
  })

  it("masks an email while keeping the domain readable", () => {
    expect(maskEmail("nafidh750@gmail.com")).toBe("na*******@gmail.com")
  })

  it("masks a phone number except the last 4 digits", () => {
    expect(maskPhone("255712345678")).toBe("********5678")
  })
})
