import { AppError } from "../errors/AppError.js"
import { asyncHandler } from "../utils/asyncHandler.js"
import { reserveIdempotencyKey, completeIdempotencyKey, failIdempotencyKey } from "../services/idempotencyService.js"

// Requires an Idempotency-Key header on financial mutation endpoints and
// makes the reservation/replay/completion transparent to the controller:
// call `req.idempotency.complete(status, body)` once the response is known.
export function requireIdempotencyKey(endpoint) {
  return asyncHandler(async (req, res, next) => {
    const key = req.headers["idempotency-key"]
    if (!key || typeof key !== "string") {
      throw AppError.badRequest("An Idempotency-Key header is required for this request.", "IDEMPOTENCY_KEY_REQUIRED")
    }

    const result = await reserveIdempotencyKey({
      merchantId: req.merchant.id,
      paymentProfileId: req.paymentProfile.id,
      apiCredentialId: req.apiCredential?.id ?? null,
      endpoint,
      key,
      body: req.body,
    })

    if (result.replay) {
      return res.status(result.responseStatus).json(result.responseBody)
    }

    let settled = false
    req.idempotency = {
      recordId: result.recordId,
      complete: async (status, body) => {
        settled = true
        if (status < 400) {
          await completeIdempotencyKey(result.recordId, status, body)
        } else {
          await failIdempotencyKey(result.recordId)
        }
      },
    }

    // Safety net: if the handler throws (or forgets to call complete()),
    // the reservation must not stay IN_PROGRESS forever — that would
    // permanently block every future retry of this key, even after
    // whatever failed has been fixed.
    res.on("finish", () => {
      if (!settled) failIdempotencyKey(result.recordId).catch(() => {})
    })

    next()
  })
}
