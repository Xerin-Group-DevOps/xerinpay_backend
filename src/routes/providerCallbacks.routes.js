import { Router } from "express"
import express from "express"
import { selcomCallback } from "../controllers/providerCallbackController.js"

const router = Router()

// Raw body is required to verify the provider's signature before any JSON
// parsing happens.
router.post("/selcom/callback", express.raw({ type: "*/*", limit: "1mb" }), selcomCallback)

export default router
