import nodemailer from "nodemailer"
import { env } from "../config/env.js"
import { prisma } from "../database/prisma.js"
import { logger } from "../utils/logger.js"

let transporter = null
function getTransporter() {
  if (!env.smtp.host) return null
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: env.smtp.host,
      port: env.smtp.port,
      secure: env.smtp.secure,
      auth: env.smtp.user ? { user: env.smtp.user, pass: env.smtp.password } : undefined,
    })
  }
  return transporter
}

function render(template, variables) {
  const fill = (str) => str.replace(/\{\{(\w+)\}\}/g, (_, key) => (variables[key] ?? ""))
  return { subject: fill(template.subject), html: fill(template.bodyHtml), text: fill(template.bodyText) }
}

// Sends via SMTP when configured. When it isn't (no SMTP_HOST set — the
// common case in this sandbox and in a fresh dev environment), the email is
// logged as SKIPPED_NOT_CONFIGURED rather than silently pretending to send
// it — see guide.md #78 "real data only".
export async function sendTemplatedEmail(templateKey, toEmail, variables = {}) {
  const template = await prisma.emailTemplate.findUnique({ where: { key: templateKey } })
  if (!template || !template.enabled) {
    logger.warn({ templateKey }, "email template missing or disabled")
    return
  }

  const { subject, html, text } = render(template, variables)
  const transport = getTransporter()

  if (!transport) {
    logger.info({ templateKey, toEmail, subject }, "SMTP not configured — email logged, not sent")
    await prisma.emailLog.create({ data: { templateKey, toEmail, subject, status: "SKIPPED_NOT_CONFIGURED" } })
    return
  }

  try {
    const info = await transport.sendMail({
      from: `"${env.smtp.fromName}" <${env.smtp.fromAddress}>`,
      to: toEmail,
      subject,
      html,
      text,
    })
    await prisma.emailLog.create({ data: { templateKey, toEmail, subject, status: "SENT", providerMessageId: info.messageId } })
  } catch (err) {
    logger.error({ err, templateKey, toEmail }, "failed to send email")
    await prisma.emailLog.create({ data: { templateKey, toEmail, subject, status: "FAILED", error: String(err.message || err) } })
  }
}
