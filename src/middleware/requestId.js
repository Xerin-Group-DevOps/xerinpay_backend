import { publicId } from "../utils/publicId.js"

export function requestId(req, res, next) {
  const incoming = req.headers["x-request-id"]
  req.requestId = typeof incoming === "string" && incoming.length < 100 ? incoming : publicId("req")
  res.setHeader("X-Request-ID", req.requestId)
  next()
}
