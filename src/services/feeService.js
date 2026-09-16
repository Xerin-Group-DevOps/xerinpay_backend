import { applyBps } from "../utils/money.js"

// Deterministic, auditable fee calculation. Rule precedence: a profile
// + payment-method-specific rule beats a merchant-wide rule beats the
// platform default, so a merchant can override without touching global
// config. The chosen rule is returned alongside the amounts so callers can
// record exactly which rule produced a given fee.
export function selectFeeRule(rules, { paymentProfileId, merchantId, paymentMethod, currency }) {
  const candidates = rules.filter((rule) => rule.active && rule.currency === currency)

  const scoreOf = (rule) => {
    let score = 0
    if (rule.paymentProfileId === paymentProfileId) score += 4
    else if (rule.paymentProfileId !== null) return -1
    if (rule.merchantId === merchantId) score += 2
    else if (rule.merchantId !== null) return -1
    if (rule.paymentMethod === paymentMethod) score += 1
    else if (rule.paymentMethod !== null) return -1
    return score
  }

  const ranked = candidates
    .map((rule) => ({ rule, score: scoreOf(rule) }))
    .filter((entry) => entry.score >= 0)
    .sort((a, b) => b.score - a.score || b.rule.priority - a.rule.priority)

  return ranked[0]?.rule ?? null
}

export function calculateFee(rule, amountMinor) {
  if (!rule) return 0n
  let fee = applyBps(amountMinor, rule.percentageBps) + BigInt(rule.fixedAmountMinor)
  if (rule.minAmountMinor != null && fee < BigInt(rule.minAmountMinor)) fee = BigInt(rule.minAmountMinor)
  if (rule.maxAmountMinor != null && fee > BigInt(rule.maxAmountMinor)) fee = BigInt(rule.maxAmountMinor)
  if (fee > BigInt(amountMinor)) fee = BigInt(amountMinor)
  return fee
}

export const DEFAULT_PLATFORM_FEE_BPS = 250 // 2.5% platform default, overridable per merchant/profile/method
