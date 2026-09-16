import { describe, it, expect } from "vitest"
import { toMinorUnits, toMajorUnitsString, serializeMoney, applyBps } from "../../src/utils/money.js"

describe("money", () => {
  it("converts TZS (0 decimal exponent) major units to minor units 1:1", () => {
    expect(toMinorUnits(1500, "TZS")).toBe(1500n)
  })

  it("converts USD (2 decimal exponent) major units to minor units", () => {
    expect(toMinorUnits("19.99", "USD")).toBe(1999n)
  })

  it("rejects amounts with more precision than the currency supports", () => {
    expect(() => toMinorUnits("19.999", "USD")).toThrow()
  })

  it("rejects zero and negative amounts", () => {
    expect(() => toMinorUnits(0, "TZS")).toThrow()
    expect(() => toMinorUnits(-5, "TZS")).toThrow()
  })

  it("round-trips minor units back to a major-unit string", () => {
    expect(toMajorUnitsString(1999n, "USD")).toBe("19.99")
    expect(toMajorUnitsString(1500n, "TZS")).toBe("1500")
  })

  it("serializes money as strings, never floats", () => {
    const serialized = serializeMoney(1999n, "USD")
    expect(serialized).toEqual({ amount_minor: "1999", amount: "19.99", currency: "USD" })
    expect(typeof serialized.amount).toBe("string")
  })

  it("applies basis points with integer-only math", () => {
    expect(applyBps(10_000n, 250)).toBe(250n) // 2.5% of 10,000 = 250
    expect(applyBps(1n, 250)).toBe(0n) // rounds down, never fractional
  })
})
