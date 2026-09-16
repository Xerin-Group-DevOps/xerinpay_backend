import crypto from "node:crypto"

// Credential secrets are generated from crypto.randomBytes — never from
// timestamps, IDs or anything guessable — and only ever stored hashed
// (SHA-256 is sufficient here: the input is 256 bits of real entropy, so
// this is a lookup hash, not a password hash that needs to resist offline
// guessing of a low-entropy secret).
function randomToken(byteLength) {
  return crypto.randomBytes(byteLength).toString("base64url")
}

export function generateApiKeyPair(environment) {
  const envTag = environment === "PRODUCTION" ? "live" : "test"
  const publicKey = `xpk_${envTag}_${randomToken(18)}`
  const secretKey = `xsk_${envTag}_${randomToken(32)}`
  return { publicKey, secretKey }
}

export function hashSecretKey(secretKey) {
  return crypto.createHash("sha256").update(secretKey).digest("hex")
}

export function lastFour(secretKey) {
  return secretKey.slice(-4)
}

export function timingSafeEqualHex(a, b) {
  const bufA = Buffer.from(a, "hex")
  const bufB = Buffer.from(b, "hex")
  if (bufA.length !== bufB.length) return false
  return crypto.timingSafeEqual(bufA, bufB)
}
