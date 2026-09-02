import "server-only"

import { eq } from "drizzle-orm"

import { db } from "@/db"
import { walletEntries } from "@/db/schema"
import { confirmPaymentAction } from "@/features/bookings/actions"
import { confirmWalletTopUpAction } from "@/features/wallet/actions"

/**
 * Webhook dispatcher: route a verified providerReference to the right
 * confirmer. Wallet top-ups are looked up first (the reference lives on
 * wallet_entries); everything else falls through to the untouched booking
 * confirmer. Both paths are idempotent, so duplicate or out-of-order
 * webhooks collapse to a no-op.
 */
export async function confirmAnyPaymentAction(
  providerReference: string
): Promise<{ ok: boolean }> {
  const [entry] = await db
    .select({ id: walletEntries.id })
    .from(walletEntries)
    .where(eq(walletEntries.providerReference, providerReference))
    .limit(1)
  if (entry) {
    const res = await confirmWalletTopUpAction(providerReference)
    return { ok: res.ok }
  }
  const res = await confirmPaymentAction(providerReference)
  return { ok: res.ok }
}
