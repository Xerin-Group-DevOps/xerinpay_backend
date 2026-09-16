import { sweepDueRetries } from "../services/webhookService.js"
import { logger } from "../utils/logger.js"

// In-process retry sweep — adequate for a single API instance. Running
// more than one instance in production needs a real job queue (Redis/
// BullMQ or similar) instead; see DEPLOYMENT.md.
export function startWebhookRetryJob(intervalMs = 60_000) {
  const timer = setInterval(() => {
    sweepDueRetries().catch((err) => logger.error({ err }, "webhook retry sweep failed"))
  }, intervalMs)
  timer.unref()
  return timer
}
