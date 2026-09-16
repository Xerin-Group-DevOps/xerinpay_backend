import crypto from "node:crypto"
import { env } from "../config/env.js"

// AES-256-GCM at-rest encryption for provider credentials and webhook
// signing secrets. The key lives only in ENCRYPTION_KEY_BASE64 (env/secret
// manager), never in the database alongside the ciphertext.
const KEY = Buffer.from(env.encryptionKeyBase64, "base64")

if (KEY.length !== 32) {
  throw new Error("ENCRYPTION_KEY_BASE64 must decode to exactly 32 bytes")
}

export function encryptSecret(plainText) {
  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv("aes-256-gcm", KEY, iv)
  const ciphertext = Buffer.concat([cipher.update(plainText, "utf8"), cipher.final()])
  const authTag = cipher.getAuthTag()
  return Buffer.concat([iv, authTag, ciphertext]).toString("base64")
}

export function decryptSecret(encoded) {
  const raw = Buffer.from(encoded, "base64")
  const iv = raw.subarray(0, 12)
  const authTag = raw.subarray(12, 28)
  const ciphertext = raw.subarray(28)
  const decipher = crypto.createDecipheriv("aes-256-gcm", KEY, iv)
  decipher.setAuthTag(authTag)
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8")
}
