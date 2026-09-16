import { Router } from "express"
import { prisma } from "../database/prisma.js"

const router = Router()
const startedAt = Date.now()

router.get("/", (req, res) => {
  res.json({ status: "ok", service: "xerinpay-api", uptime_seconds: Math.floor((Date.now() - startedAt) / 1000) })
})

router.get("/live", (req, res) => {
  res.json({ status: "ok" })
})

// Actually checks the database — never a hardcoded "ok" (guide.md #67, #78).
router.get("/ready", async (req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`
    res.json({ status: "ok", database: "connected" })
  } catch (err) {
    res.status(503).json({ status: "unavailable", database: "disconnected", error: err.message })
  }
})

export default router
