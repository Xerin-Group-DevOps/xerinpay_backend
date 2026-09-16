import { createApp } from "./app.js"
import { env } from "./config/env.js"
import { logger } from "./utils/logger.js"
import { startWebhookRetryJob } from "./jobs/webhookRetryJob.js"

const app = createApp()

app.listen(env.port, () => {
  logger.info(`XerinPay API listening on http://localhost:${env.port} (${env.nodeEnv})`)
  startWebhookRetryJob()
})
