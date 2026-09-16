import { AppError } from "../errors/AppError.js"
import { logger } from "../utils/logger.js"
import { env } from "../config/env.js"

export function notFoundHandler(req, res) {
  res.status(404).json({
    success: false,
    error: { code: "NOT_FOUND", message: "The requested resource was not found.", request_id: req.requestId },
  })
}

// Centralized error mapping. Internal details (stack traces, SQL errors,
// file paths, env vars) never reach the response body — only a safe code,
// message and request ID for support/debugging correlation.
export function errorHandler(err, req, res, _next) {
  if (err instanceof AppError) {
    if (err.statusCode >= 500) {
      logger.error({ err, requestId: req.requestId }, "internal error")
    }
    return res.status(err.statusCode).json({
      success: false,
      error: { code: err.code, message: err.message, request_id: req.requestId, details: err.details },
    })
  }

  if (err?.name === "ZodError") {
    return res.status(400).json({
      success: false,
      error: {
        code: "VALIDATION_ERROR",
        message: "The request failed validation.",
        request_id: req.requestId,
        details: err.issues?.map((issue) => ({ path: issue.path.join("."), message: issue.message })),
      },
    })
  }

  logger.error({ err, requestId: req.requestId }, "unhandled error")
  res.status(500).json({
    success: false,
    error: {
      code: "INTERNAL_ERROR",
      message: "Something went wrong. Please try again.",
      request_id: req.requestId,
      ...(env.isProduction ? {} : { debug: err?.message }),
    },
  })
}
