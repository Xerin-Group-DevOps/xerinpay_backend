import { describe, it, expect } from "vitest"
import { canTransition, assertTransition } from "../../src/domain/paymentStateMachine.js"

describe("paymentStateMachine", () => {
  it("allows the normal happy-path progression", () => {
    expect(canTransition("CREATED", "PENDING")).toBe(true)
    expect(canTransition("PENDING", "PROCESSING")).toBe(true)
    expect(canTransition("PROCESSING", "SUCCESS")).toBe(true)
    expect(canTransition("SUCCESS", "REFUNDED")).toBe(true)
  })

  it("treats re-applying the same status as a safe no-op (duplicate webhook)", () => {
    expect(canTransition("SUCCESS", "SUCCESS")).toBe(true)
  })

  it("rejects moving a terminal payment backwards", () => {
    expect(canTransition("FAILED", "SUCCESS")).toBe(false)
    expect(canTransition("REFUNDED", "SUCCESS")).toBe(false)
    expect(canTransition("CANCELLED", "PENDING")).toBe(false)
  })

  it("rejects skipping straight from CREATED to REFUNDED", () => {
    expect(canTransition("CREATED", "REFUNDED")).toBe(false)
  })

  it("throws a structured conflict error for an invalid transition", () => {
    expect(() => assertTransition("FAILED", "SUCCESS")).toThrow(/cannot move/i)
  })
})
