import { asyncHandler } from "../utils/asyncHandler.js"
import { prisma } from "../database/prisma.js"
import * as profileService from "../services/paymentProfileService.js"
import { serializeProfile } from "../services/paymentProfileService.js"

export const listProfiles = asyncHandler(async (req, res) => {
  const profiles = await prisma.paymentProfile.findMany({ where: { merchantId: req.merchant.id }, orderBy: { createdAt: "desc" } })
  res.json({ success: true, data: profiles.map(serializeProfile) })
})

export const createProfile = asyncHandler(async (req, res) => {
  const profile = await profileService.createPaymentProfile({ merchant: req.merchant, ...req.body, createdByUserId: req.user.id })
  res.status(201).json({ success: true, data: serializeProfile(profile) })
})

export const getProfile = asyncHandler(async (req, res) => {
  res.json({ success: true, data: serializeProfile(req.paymentProfile) })
})

export const updateProfile = asyncHandler(async (req, res) => {
  const updated = await profileService.updatePaymentProfile({ profile: req.paymentProfile, updates: req.body, actorUserId: req.user.id })
  res.json({ success: true, data: serializeProfile(updated) })
})

export const disableProfile = asyncHandler(async (req, res) => {
  const updated = await profileService.setPaymentProfileStatus({ profile: req.paymentProfile, status: "DISABLED", actorUserId: req.user.id })
  res.json({ success: true, data: serializeProfile(updated) })
})

export const enableProfile = asyncHandler(async (req, res) => {
  const updated = await profileService.setPaymentProfileStatus({ profile: req.paymentProfile, status: "ACTIVE", actorUserId: req.user.id })
  res.json({ success: true, data: serializeProfile(updated) })
})
