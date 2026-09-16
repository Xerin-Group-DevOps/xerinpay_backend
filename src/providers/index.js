import { prisma } from "../database/prisma.js"
import { decryptSecret } from "../security/encryption.js"
import { AppError } from "../errors/AppError.js"
import { SelcomProvider } from "./SelcomProvider.js"
import { sandboxProvider } from "./SandboxProvider.js"

const PROVIDER_FACTORIES = {
  selcom: (config) => new SelcomProvider(config),
}

// Sandbox environment always routes to the in-process simulator — this is
// the guarantee that a sandbox credential can never touch a live provider,
// however the admin has configured production routing (guide.md #41).
export async function resolveProvider(environment) {
  if (environment === "SANDBOX") return sandboxProvider

  const provider = await prisma.provider.findFirst({
    where: { status: "ACTIVE" },
    orderBy: { priority: "desc" },
    include: { credentials: { where: { environment: "PRODUCTION" } } },
  })

  if (!provider || provider.credentials.length === 0) {
    throw AppError.internal(
      "No production payment provider is configured yet. Contact support.",
      "PROVIDER_NOT_CONFIGURED",
    )
  }

  const factory = PROVIDER_FACTORIES[provider.key]
  if (!factory) {
    throw AppError.internal(`Provider '${provider.key}' has no adapter registered.`, "PROVIDER_NOT_SUPPORTED")
  }

  const config = JSON.parse(decryptSecret(provider.credentials[0].encryptedConfig))
  return factory(config)
}
