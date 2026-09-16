// Wraps a zod schema as Express middleware. Client-side validation is a UX
// nicety only — every mutating endpoint validates again here, server-side.
export function validateBody(schema) {
  return (req, res, next) => {
    req.body = schema.parse(req.body)
    next()
  }
}

export function validateQuery(schema) {
  return (req, res, next) => {
    req.query = schema.parse(req.query)
    next()
  }
}
