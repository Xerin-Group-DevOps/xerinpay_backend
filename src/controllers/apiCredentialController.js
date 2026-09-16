import { asyncHandler } from "../utils/asyncHandler.js"
import { prisma } from "../database/prisma.js"
import { AppError } from "../errors/AppError.js"
import * as credentialService from "../services/apiCredentialService.js"
import { serializeCredential } from "../services/apiCredentialService.js"

export const listCredentials = asyncHandler(async (req, res) => {
  const credentials = await prisma.apiCredential.findMany({ where: { paymentProfileId: req.paymentProfile.id }, orderBy: { createdAt: "desc" } })
  res.json({ success: true, data: credentials.map(serializeCredential) })
})

export const createCredential = asyncHandler(async (req, res) => {
  const { credential, secretKey } = await credentialService.createApiCredential({
    merchant: req.merchant,
    paymentProfile: req.paymentProfile,
    ...req.body,
    createdByUserId: req.user.id,
  })
  res.status(201).json({ success: true, data: { ...serializeCredential(credential), secret_key: secretKey, secret_key_notice: "Save this secret now — it will not be shown again." } })
})

async function loadOwnedCredential(req) {
  const credential = await prisma.apiCredential.findUnique({ where: { publicId: req.params.credentialId } })
  if (!credential || credential.paymentProfileId !== req.paymentProfile.id) throw AppError.notFound("API credential not found")
  return credential
}

export const revokeCredential = asyncHandler(async (req, res) => {
  const credential = await loadOwnedCredential(req)
  const updated = await credentialService.revokeApiCredential({ credential, actorUserId: req.user.id })
  res.json({ success: true, data: serializeCredential(updated) })
})

export const rotateCredential = asyncHandler(async (req, res) => {
  const credential = await loadOwnedCredential(req)
  const { credential: rotated, secretKey } = await credentialService.rotateApiCredential({ credential, actorUserId: req.user.id })
  res.status(201).json({ success: true, data: { ...serializeCredential(rotated), secret_key: secretKey, secret_key_notice: "Save this secret now — it will not be shown again." } })
})
