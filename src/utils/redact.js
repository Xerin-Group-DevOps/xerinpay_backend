const SENSITIVE_KEYS = new Set([
  "password",
  "secret",
  "secretkey",
  "secret_key",
  "apisecret",
  "authorization",
  "token",
  "accesstoken",
  "refreshtoken",
  "encryptedconfig",
  "encryptedsecret",
  "cardnumber",
  "cvv",
])

// Deep-clones a plain object/array, replacing any value whose key looks
// sensitive with a fixed marker. Used before writing request bodies into
// API/audit logs.
export function redactSensitive(value) {
  if (Array.isArray(value)) return value.map(redactSensitive)
  if (value && typeof value === "object") {
    const out = {}
    for (const [key, val] of Object.entries(value)) {
      out[key] = SENSITIVE_KEYS.has(key.toLowerCase()) ? "[REDACTED]" : redactSensitive(val)
    }
    return out
  }
  return value
}

export function maskEmail(email) {
  if (!email || !email.includes("@")) return email
  const [local, domain] = email.split("@")
  const visible = local.slice(0, 2)
  return `${visible}${"*".repeat(Math.max(local.length - 2, 1))}@${domain}`
}

export function maskPhone(phone) {
  if (!phone) return phone
  return phone.slice(0, -4).replace(/\d/g, "*") + phone.slice(-4)
}
