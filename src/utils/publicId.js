import { customAlphabet } from "nanoid"

// Non-predictable, non-enumerable public identifiers. Alphabet excludes
// visually ambiguous characters. Internal database UUIDs are never exposed
// in API responses.
const alphabet = "23456789abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ"
const nano = customAlphabet(alphabet, 20)

export function publicId(prefix) {
  return `${prefix}_${nano()}`
}
