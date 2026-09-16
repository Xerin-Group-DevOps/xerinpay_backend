// Seeds platform RBAC, email templates, provider registry rows and the
// default platform fee rule. In non-production environments it also
// creates one clearly-labelled demo merchant so a fresh checkout can be
// exercised immediately — see README.md "Demo data".
import "dotenv/config"
import { PrismaClient } from "@prisma/client"
import { hashPassword } from "../src/security/password.js"
import { PLATFORM_ROLES, PERMISSIONS } from "../src/config/permissions.js"
import { EMAIL_TEMPLATES } from "./emailTemplates.js"

const prisma = new PrismaClient()

async function seedRbac() {
  for (const key of Object.values(PERMISSIONS)) {
    await prisma.permission.upsert({ where: { key }, update: {}, create: { key } })
  }

  for (const [roleKey, def] of Object.entries(PLATFORM_ROLES)) {
    const role = await prisma.role.upsert({
      where: { key: roleKey },
      update: { name: def.name },
      create: { key: roleKey, name: def.name },
    })
    for (const permissionKey of def.permissions) {
      const permission = await prisma.permission.findUnique({ where: { key: permissionKey } })
      await prisma.rolePermission.upsert({
        where: { roleId_permissionId: { roleId: role.id, permissionId: permission.id } },
        update: {},
        create: { roleId: role.id, permissionId: permission.id },
      })
    }
  }
}

async function seedEmailTemplates() {
  for (const template of EMAIL_TEMPLATES) {
    await prisma.emailTemplate.upsert({ where: { key: template.key }, update: template, create: template })
  }
}

async function seedProviders() {
  await prisma.provider.upsert({
    where: { key: "selcom" },
    update: {},
    create: { key: "selcom", name: "Selcom Pay", status: "ACTIVE", capabilities: ["payments", "status_check", "callbacks", "mobile_money_push"], priority: 10 },
  })
}

async function seedDefaultFeeRule() {
  const existing = await prisma.feeRule.findFirst({ where: { merchantId: null, paymentProfileId: null, currency: "TZS" } })
  if (!existing) {
    await prisma.feeRule.create({
      data: { currency: "TZS", percentageBps: 250, fixedAmountMinor: 0n, active: true, priority: 0 },
    })
  }
}

async function seedSuperAdmin() {
  const email = process.env.SEED_SUPER_ADMIN_EMAIL
  const password = process.env.SEED_SUPER_ADMIN_PASSWORD
  if (!email || !password) {
    console.log("SEED_SUPER_ADMIN_EMAIL / SEED_SUPER_ADMIN_PASSWORD not set — skipping super admin seed.")
    return
  }
  const passwordHash = await hashPassword(password)
  const user = await prisma.user.upsert({
    where: { email },
    update: {},
    create: { name: "XerinPay Admin", email, passwordHash, status: "ACTIVE", emailVerifiedAt: new Date() },
  })
  const role = await prisma.role.findUnique({ where: { key: "SUPER_ADMIN" } })
  await prisma.userRole.upsert({
    where: { userId_roleId: { userId: user.id, roleId: role.id } },
    update: {},
    create: { userId: user.id, roleId: role.id },
  })
  console.log(`Super admin ready: ${email}`)
}

async function main() {
  await seedRbac()
  await seedEmailTemplates()
  await seedProviders()
  await seedDefaultFeeRule()
  await seedSuperAdmin()
  console.log("Seed complete.")
}

main()
  .catch((err) => {
    console.error(err)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
