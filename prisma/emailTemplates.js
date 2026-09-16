// Seeded default templates. Editable later from Admin -> Communication ->
// Email once that screen exists (see README "Remaining work") — for now,
// edit directly via SystemSetting-less EmailTemplate rows in the database.
export const EMAIL_TEMPLATES = [
  {
    key: "welcome",
    subject: "Welcome to XerinPay",
    bodyHtml: "<p>Hi {{name}},</p><p>Your XerinPay account is ready. Payments Made Simple.</p>",
    bodyText: "Hi {{name}}, your XerinPay account is ready. Payments Made Simple.",
  },
  {
    key: "new_login",
    subject: "New sign-in to your XerinPay account",
    bodyHtml: "<p>Hi {{name}},</p><p>We noticed a new sign-in from IP {{ipAddress}}. If this wasn't you, reset your password immediately.</p>",
    bodyText: "Hi {{name}}, new sign-in from IP {{ipAddress}}. If this wasn't you, reset your password immediately.",
  },
  {
    key: "password_reset",
    subject: "Reset your XerinPay password",
    bodyHtml: "<p>Hi {{name}},</p><p>Use this code to reset your password: <strong>{{reset_token}}</strong>. It expires in 1 hour.</p>",
    bodyText: "Hi {{name}}, use this code to reset your password: {{reset_token}}. It expires in 1 hour.",
  },
  {
    key: "api_key_created",
    subject: "New API credential created",
    bodyHtml: "<p>A new {{environment}} API credential named \"{{name}}\" was created on your XerinPay account.</p>",
    bodyText: "A new {{environment}} API credential named \"{{name}}\" was created on your XerinPay account.",
  },
  {
    key: "payment_success",
    subject: "Payment received",
    bodyHtml: "<p>A payment of {{amount}} {{currency}} was received.</p>",
    bodyText: "A payment of {{amount}} {{currency}} was received.",
  },
  {
    key: "payment_failed",
    subject: "Payment failed",
    bodyHtml: "<p>A payment attempt of {{amount}} {{currency}} failed.</p>",
    bodyText: "A payment attempt of {{amount}} {{currency}} failed.",
  },
  {
    key: "kyc_status",
    subject: "Your KYC status has changed",
    bodyHtml: "<p>Your business verification status is now: <strong>{{status}}</strong>.</p>",
    bodyText: "Your business verification status is now: {{status}}.",
  },
]
