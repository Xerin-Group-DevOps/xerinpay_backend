// Money is always handled as an integer count of the currency's smallest
// unit ("minor units") — never as a JS float. TZS conventionally has no
// fractional subunit in everyday use, so its exponent is 0; other
// currencies can be added without touching any payment/ledger logic.
const CURRENCY_MINOR_EXPONENT = {
  TZS: 0,
  USD: 2,
  KES: 2,
  UGX: 0,
  EUR: 2,
  GBP: 2,
}

export function minorExponentFor(currency) {
  return CURRENCY_MINOR_EXPONENT[currency] ?? 2
}

// Parses a merchant-supplied amount (major units, e.g. "1500.00") into an
// integer minor-unit BigInt. Throws on any non-integer-after-scaling input
// so we never silently truncate a fraction of a cent.
export function toMinorUnits(amountMajor, currency) {
  const exponent = minorExponentFor(currency)
  const factor = 10 ** exponent
  const numeric = Number(amountMajor)
  if (!Number.isFinite(numeric) || numeric <= 0) {
    throw new Error("Amount must be a positive number")
  }
  const scaled = Math.round(numeric * factor)
  // Guard against float drift producing an amount that doesn't round-trip.
  if (Math.abs(scaled / factor - numeric) > 1e-9) {
    throw new Error("Amount has more precision than the currency supports")
  }
  return BigInt(scaled)
}

export function toMajorUnitsString(amountMinor, currency) {
  const exponent = minorExponentFor(currency)
  const value = BigInt(amountMinor)
  if (exponent === 0) return value.toString()
  const factor = 10n ** BigInt(exponent)
  const whole = value / factor
  const fraction = (value % factor).toString().padStart(exponent, "0")
  return `${whole}.${fraction}`
}

// Serializes a money amount for API responses: amounts always travel as
// strings so BigInt precision survives JSON and clients never parse them
// into floats by accident.
export function serializeMoney(amountMinor, currency) {
  return {
    amount_minor: amountMinor.toString(),
    amount: toMajorUnitsString(amountMinor, currency),
    currency,
  }
}

export function applyBps(amountMinor, bps) {
  // integer-safe percentage-of: bps is basis points (1/100th of a percent)
  return (BigInt(amountMinor) * BigInt(bps)) / 10_000n
}
