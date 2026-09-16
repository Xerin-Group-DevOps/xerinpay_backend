import argon2 from "argon2"

const HASH_OPTIONS = { type: argon2.argon2id, memoryCost: 19456, timeCost: 2, parallelism: 1 }

export async function hashPassword(plainPassword) {
  return argon2.hash(plainPassword, HASH_OPTIONS)
}

export async function verifyPassword(hash, plainPassword) {
  try {
    return await argon2.verify(hash, plainPassword)
  } catch {
    return false
  }
}

// Minimum viable strength gate: length + character diversity. Real breach
// database checks (e.g. HIBP k-anonymity) are a documented future addition,
// not implemented here — see SECURITY.md.
export function assertPasswordStrength(password) {
  const problems = []
  if (!password || password.length < 10) problems.push("Password must be at least 10 characters long")
  if (!/[a-z]/.test(password)) problems.push("Password must include a lowercase letter")
  if (!/[A-Z]/.test(password)) problems.push("Password must include an uppercase letter")
  if (!/[0-9]/.test(password)) problems.push("Password must include a number")
  return problems
}
