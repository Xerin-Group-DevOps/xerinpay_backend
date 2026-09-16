import express from "express"
import cors from "cors"
import helmet from "helmet"
import compression from "compression"
import { env } from "./config/env.js"
import { requestId } from "./middleware/requestId.js"
import { defaultLimiter } from "./middleware/rateLimit.js"
import { errorHandler, notFoundHandler } from "./middleware/errorHandler.js"
import healthRoutes from "./routes/health.routes.js"
import providerCallbackRoutes from "./routes/providerCallbacks.routes.js"
import v1Routes from "./routes/v1/index.js"

export function createApp() {
  const app = express()

  app.set("trust proxy", 1)
  app.use(helmet())
  app.use(
    cors({
      origin: env.corsAllowedOrigins,
      credentials: true,
    }),
  )
  app.use(compression())
  app.use(requestId)

  // Mounted ahead of the JSON body parser: provider callbacks need the raw
  // request body to verify their HMAC signature.
  app.use("/api/providers", providerCallbackRoutes)

  app.use(express.json({ limit: "1mb" }))
  app.use(defaultLimiter)

  app.use("/health", healthRoutes)
  app.use("/api/v1", v1Routes)

  app.get("/", (req, res) => {
    res.json({ service: "XerinPay API", tagline: "Payments Made Simple.", docs: "/api/v1" })
  })

  app.use(notFoundHandler)
  app.use(errorHandler)

  return app
}
