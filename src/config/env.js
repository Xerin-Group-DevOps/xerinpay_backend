import "dotenv/config"

function required(name, fallbackForTest) {
  const value = process.env[name]
  if (value) return value
  if (process.env.NODE_ENV === "test" && fallbackForTest !== undefined) {
    return fallbackForTest
  }
  throw new Error(`Missing required environment variable: ${name}`)
}

const isTest = process.env.NODE_ENV === "test"

export const env = {
  nodeEnv: process.env.NODE_ENV || "development",
  isProduction: process.env.NODE_ENV === "production",
  isTest,
  port: Number(process.env.PORT) || 3001,
  apiBaseUrl: process.env.API_BASE_URL || "http://localhost:3001",
  webAppUrl: process.env.WEB_APP_URL || "http://localhost:3000",
  corsAllowedOrigins: (process.env.CORS_ALLOWED_ORIGINS || "http://localhost:3000")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean),

  databaseUrl: process.env.DATABASE_URL || "",

  jwtAccessSecret: required("JWT_ACCESS_SECRET", "test-access-secret-test-access-secret"),
  jwtRefreshSecret: required("JWT_REFRESH_SECRET", "test-refresh-secret-test-refresh-secret"),
  jwtAccessTtlMinutes: Number(process.env.JWT_ACCESS_TTL_MINUTES) || 15,
  jwtRefreshTtlDays: Number(process.env.JWT_REFRESH_TTL_DAYS) || 30,

  encryptionKeyBase64: required(
    "ENCRYPTION_KEY_BASE64",
    Buffer.alloc(32, 7).toString("base64"),
  ),

  smtp: {
    host: process.env.SMTP_HOST || "",
    port: Number(process.env.SMTP_PORT) || 587,
    secure: process.env.SMTP_SECURE === "true",
    user: process.env.SMTP_USER || "",
    password: process.env.SMTP_PASSWORD || "",
    fromName: process.env.EMAIL_FROM_NAME || "XerinPay",
    fromAddress: process.env.EMAIL_FROM_ADDRESS || "no-reply@xerinpay.example",
  },

  selcom: {
    apiBaseUrl: process.env.SELCOM_API_BASE_URL || "https://apigwtest.selcommobile.com",
    apiKey: process.env.SELCOM_API_KEY || "",
    apiSecret: process.env.SELCOM_API_SECRET || "",
    merchantId: process.env.SELCOM_MERCHANT_ID || "",
  },

  rateLimit: {
    windowMs: Number(process.env.RATE_LIMIT_WINDOW_MS) || 60_000,
    maxDefault: Number(process.env.RATE_LIMIT_MAX_DEFAULT) || 120,
    maxAuth: Number(process.env.RATE_LIMIT_MAX_AUTH) || 10,
    maxPaymentCreate: Number(process.env.RATE_LIMIT_MAX_PAYMENT_CREATE) || 30,
  },
}
