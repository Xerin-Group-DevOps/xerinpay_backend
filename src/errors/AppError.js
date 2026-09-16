export class AppError extends Error {
  constructor(code, message, statusCode = 400, details) {
    super(message)
    this.name = "AppError"
    this.code = code
    this.statusCode = statusCode
    this.details = details
  }

  static badRequest(message, code = "INVALID_REQUEST", details) {
    return new AppError(code, message, 400, details)
  }

  static unauthorized(message = "Authentication required", code = "UNAUTHENTICATED") {
    return new AppError(code, message, 401)
  }

  static forbidden(message = "You do not have permission to perform this action", code = "FORBIDDEN") {
    return new AppError(code, message, 403)
  }

  static notFound(message = "Resource not found", code = "NOT_FOUND") {
    return new AppError(code, message, 404)
  }

  static conflict(message, code = "CONFLICT") {
    return new AppError(code, message, 409)
  }

  static tooManyRequests(message = "Too many requests", code = "RATE_LIMITED") {
    return new AppError(code, message, 429)
  }

  static internal(message = "Something went wrong. Please try again.", code = "INTERNAL_ERROR") {
    return new AppError(code, message, 500)
  }
}
