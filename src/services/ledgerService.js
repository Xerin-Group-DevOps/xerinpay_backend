import { AppError } from "../errors/AppError.js"

// Double-entry ledger. Every balance-changing operation posts a balanced
// set of entries (sum of debits === sum of credits) inside the caller's
// existing database transaction — there is no code path that mutates a
// balance field directly. Entries are never updated after creation;
// corrections happen via new compensating entries (see refund/payout
// services).
export async function postLedgerEntries(tx, entries) {
  if (entries.length === 0) return
  const currency = entries[0].currency
  let debitTotal = 0n
  let creditTotal = 0n
  for (const entry of entries) {
    if (entry.currency !== currency) {
      throw AppError.internal("Ledger entries in a single posting must share one currency")
    }
    if (entry.direction === "DEBIT") debitTotal += BigInt(entry.amountMinor)
    else creditTotal += BigInt(entry.amountMinor)
  }
  if (debitTotal !== creditTotal) {
    throw AppError.internal("Ledger posting is not balanced (debits must equal credits)")
  }

  for (const entry of entries) {
    await tx.ledgerEntry.create({
      data: {
        ledgerAccountId: entry.ledgerAccountId,
        direction: entry.direction,
        amountMinor: entry.amountMinor,
        currency: entry.currency,
        referenceType: entry.referenceType,
        referenceId: entry.referenceId,
        paymentId: entry.paymentId ?? null,
        description: entry.description ?? null,
      },
    })
  }
}

export async function getOrCreateLedgerAccount(tx, { merchantId = null, type, currency }) {
  const existing = await tx.ledgerAccount.findFirst({ where: { merchantId, type, currency } })
  if (existing) return existing
  return tx.ledgerAccount.create({ data: { merchantId, type, currency } })
}

export async function getMerchantWalletBalance(tx, merchantId, currency) {
  const account = await tx.ledgerAccount.findFirst({
    where: { merchantId, type: "MERCHANT_WALLET", currency },
  })
  if (!account) return { availableMinor: 0n, currency }

  const entries = await tx.ledgerEntry.findMany({ where: { ledgerAccountId: account.id } })
  let balance = 0n
  for (const entry of entries) {
    balance += entry.direction === "CREDIT" ? BigInt(entry.amountMinor) : -BigInt(entry.amountMinor)
  }
  return { availableMinor: balance, currency }
}

// Records a payment's success: money in from the provider is split between
// the merchant's wallet (net) and platform fee revenue.
export async function postPaymentSuccess(tx, { merchantId, currency, amountMinor, feeAmountMinor, paymentId }) {
  const netAmountMinor = BigInt(amountMinor) - BigInt(feeAmountMinor)
  const clearing = await getOrCreateLedgerAccount(tx, { merchantId: null, type: "PROVIDER_CLEARING", currency })
  const wallet = await getOrCreateLedgerAccount(tx, { merchantId, type: "MERCHANT_WALLET", currency })
  const feeRevenue = await getOrCreateLedgerAccount(tx, { merchantId: null, type: "PLATFORM_FEE_REVENUE", currency })

  const entries = [
    { ledgerAccountId: clearing.id, direction: "DEBIT", amountMinor, currency, referenceType: "PAYMENT", referenceId: paymentId, paymentId, description: "Payment received from provider" },
    { ledgerAccountId: wallet.id, direction: "CREDIT", amountMinor: netAmountMinor, currency, referenceType: "PAYMENT", referenceId: paymentId, paymentId, description: "Net payment credited to merchant wallet" },
  ]
  if (feeAmountMinor > 0n) {
    entries.push({ ledgerAccountId: feeRevenue.id, direction: "CREDIT", amountMinor: feeAmountMinor, currency, referenceType: "FEE", referenceId: paymentId, paymentId, description: "XerinPay platform fee" })
  }
  await postLedgerEntries(tx, entries)
}

export async function postRefund(tx, { merchantId, currency, amountMinor, paymentId, refundId }) {
  const clearing = await getOrCreateLedgerAccount(tx, { merchantId: null, type: "PROVIDER_CLEARING", currency })
  const wallet = await getOrCreateLedgerAccount(tx, { merchantId, type: "MERCHANT_WALLET", currency })

  await postLedgerEntries(tx, [
    { ledgerAccountId: wallet.id, direction: "DEBIT", amountMinor, currency, referenceType: "REFUND", referenceId: refundId, paymentId, description: "Refund debited from merchant wallet" },
    { ledgerAccountId: clearing.id, direction: "CREDIT", amountMinor, currency, referenceType: "REFUND", referenceId: refundId, paymentId, description: "Refund returned via provider" },
  ])
}

export async function postPayoutReserved(tx, { merchantId, currency, amountMinor, payoutId }) {
  const wallet = await getOrCreateLedgerAccount(tx, { merchantId, type: "MERCHANT_WALLET", currency })
  const suspense = await getOrCreateLedgerAccount(tx, { merchantId: null, type: "PLATFORM_SUSPENSE", currency })

  await postLedgerEntries(tx, [
    { ledgerAccountId: wallet.id, direction: "DEBIT", amountMinor, currency, referenceType: "PAYOUT", referenceId: payoutId, description: "Payout reserved from merchant wallet" },
    { ledgerAccountId: suspense.id, direction: "CREDIT", amountMinor, currency, referenceType: "PAYOUT", referenceId: payoutId, description: "Payout in transit" },
  ])
}

export async function postPayoutCompleted(tx, { currency, amountMinor, payoutId }) {
  const suspense = await getOrCreateLedgerAccount(tx, { merchantId: null, type: "PLATFORM_SUSPENSE", currency })
  const clearing = await getOrCreateLedgerAccount(tx, { merchantId: null, type: "PROVIDER_CLEARING", currency })

  await postLedgerEntries(tx, [
    { ledgerAccountId: suspense.id, direction: "DEBIT", amountMinor, currency, referenceType: "PAYOUT", referenceId: payoutId, description: "Payout settled to destination" },
    { ledgerAccountId: clearing.id, direction: "CREDIT", amountMinor, currency, referenceType: "PAYOUT", referenceId: payoutId, description: "Funds left via provider" },
  ])
}

export async function postPayoutFailed(tx, { merchantId, currency, amountMinor, payoutId }) {
  const wallet = await getOrCreateLedgerAccount(tx, { merchantId, type: "MERCHANT_WALLET", currency })
  const suspense = await getOrCreateLedgerAccount(tx, { merchantId: null, type: "PLATFORM_SUSPENSE", currency })

  await postLedgerEntries(tx, [
    { ledgerAccountId: suspense.id, direction: "DEBIT", amountMinor, currency, referenceType: "PAYOUT", referenceId: payoutId, description: "Failed payout reversed" },
    { ledgerAccountId: wallet.id, direction: "CREDIT", amountMinor, currency, referenceType: "PAYOUT", referenceId: payoutId, description: "Funds returned to merchant wallet" },
  ])
}
