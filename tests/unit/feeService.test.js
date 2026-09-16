import { describe, it, expect } from "vitest"
import { selectFeeRule, calculateFee } from "../../src/services/feeService.js"

const platformDefault = { id: "1", merchantId: null, paymentProfileId: null, paymentMethod: null, currency: "TZS", percentageBps: 250, fixedAmountMinor: 0n, minAmountMinor: null, maxAmountMinor: null, active: true, priority: 0 }
const merchantOverride = { id: "2", merchantId: "m1", paymentProfileId: null, paymentMethod: null, currency: "TZS", percentageBps: 150, fixedAmountMinor: 0n, minAmountMinor: null, maxAmountMinor: null, active: true, priority: 0 }
const profileOverride = { id: "3", merchantId: "m1", paymentProfileId: "p1", paymentMethod: null, currency: "TZS", percentageBps: 100, fixedAmountMinor: 0n, minAmountMinor: null, maxAmountMinor: null, active: true, priority: 0 }

describe("feeService", () => {
  it("falls back to the platform default when nothing more specific matches", () => {
    const rule = selectFeeRule([platformDefault], { paymentProfileId: "pX", merchantId: "mX", paymentMethod: "mobile_money", currency: "TZS" })
    expect(rule.id).toBe("1")
  })

  it("prefers a merchant-specific rule over the platform default", () => {
    const rule = selectFeeRule([platformDefault, merchantOverride], { paymentProfileId: "pX", merchantId: "m1", paymentMethod: "mobile_money", currency: "TZS" })
    expect(rule.id).toBe("2")
  })

  it("prefers a payment-profile-specific rule over a merchant-wide rule", () => {
    const rule = selectFeeRule([platformDefault, merchantOverride, profileOverride], { paymentProfileId: "p1", merchantId: "m1", paymentMethod: "mobile_money", currency: "TZS" })
    expect(rule.id).toBe("3")
  })

  it("never matches a rule scoped to a different merchant or profile", () => {
    const rule = selectFeeRule([merchantOverride, profileOverride], { paymentProfileId: "other-profile", merchantId: "other-merchant", paymentMethod: "mobile_money", currency: "TZS" })
    expect(rule).toBeNull()
  })

  it("calculates a deterministic percentage + fixed fee", () => {
    const fee = calculateFee({ percentageBps: 250, fixedAmountMinor: 100n, minAmountMinor: null, maxAmountMinor: null }, 10_000n)
    expect(fee).toBe(350n) // 2.5% of 10,000 (250) + fixed 100
  })

  it("clamps to the configured minimum and maximum", () => {
    const withMin = calculateFee({ percentageBps: 0, fixedAmountMinor: 0n, minAmountMinor: 500n, maxAmountMinor: null }, 10_000n)
    expect(withMin).toBe(500n)
    const withMax = calculateFee({ percentageBps: 5000, fixedAmountMinor: 0n, minAmountMinor: null, maxAmountMinor: 1000n }, 10_000n)
    expect(withMax).toBe(1000n)
  })

  it("never charges more fee than the payment amount itself", () => {
    const fee = calculateFee({ percentageBps: 0, fixedAmountMinor: 999_999n, minAmountMinor: null, maxAmountMinor: null }, 100n)
    expect(fee).toBe(100n)
  })

  it("returns zero fee when no rule applies", () => {
    expect(calculateFee(null, 10_000n)).toBe(0n)
  })
})
