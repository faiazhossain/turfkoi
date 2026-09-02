"use server"

import { randomUUID } from "node:crypto"
import { revalidatePath } from "next/cache"
import { and, eq } from "drizzle-orm"

import { db } from "@/db"
import { users, walletClaims, walletEntries } from "@/db/schema"
import { getCurrentUser } from "@/lib/auth"
import { bkashProvider } from "@/lib/payment"
import { createNotifications, notifyAdmins } from "@/features/notifications/create"

import { isTopupAmountValid, claimableBalance } from "./logic"
import { getWalletBalance, hasPendingWalletClaim } from "./queries"
import { applyWalletMovement, confirmWalletTopUp } from "./service"

export type ActionResult =
  | { ok: true; id?: string }
  | { ok: false; error: string }

function unauthorized(): ActionResult {
  return { ok: false, error: "errors.notSignedIn" }
}

function forbidden(): ActionResult {
  return { ok: false, error: "errors.noPermission" }
}

function revalidateWallet() {
  revalidatePath("/app/wallet")
  revalidatePath("/app")
}

/**
 * Wallet-first matchmaking fee, step 1: mint a pending top-up entry and a
 * bKash checkout URL (dev: the mock confirm route). The balance only moves
 * when the webhook / mock route confirms the entry.
 */
export async function initiateWalletTopUpAction(input: {
  amount: number
}): Promise<{ ok: true; id?: string; paymentUrl?: string } | { ok: false; error: string }> {
  const user = await getCurrentUser()
  if (!user) return unauthorized()
  if (!isTopupAmountValid(input.amount)) {
    return { ok: false, error: "wallet.errors.topupInvalidAmount" }
  }

  const idempotencyKey = randomUUID()
  const [entry] = await db
    .insert(walletEntries)
    .values({
      userId: user.id,
      type: "topup",
      status: "pending",
      amount: String(input.amount),
      idempotencyKey,
      provider: "bkash",
      description: "bKash top-up",
    })
    .returning({ id: walletEntries.id })

  const callbackUrl = `${process.env.NEXT_PUBLIC_APP_URL ?? ""}/api/payments/bkash/callback?purpose=wallet`

  let paymentUrl: string
  let providerReference: string
  try {
    const result = await bkashProvider.createPayment({
      kind: "wallet",
      amount: input.amount,
      platformFee: 0,
      idempotencyKey,
      callbackUrl,
    })
    paymentUrl = result.paymentUrl
    providerReference = result.providerReference
  } catch {
    await db
      .update(walletEntries)
      .set({ status: "failed", updatedAt: new Date() })
      .where(eq(walletEntries.id, entry.id))
    return { ok: false, error: "payments.errors.initFailed" }
  }

  await db
    .update(walletEntries)
    .set({ providerReference, updatedAt: new Date() })
    .where(eq(walletEntries.id, entry.id))

  return { ok: true, id: entry.id, paymentUrl }
}

/**
 * Step 2: a verified bKash webhook (or the dev mock route) landed for a
 * top-up — flip the entry to success and move the balance. Idempotent.
 */
export async function confirmWalletTopUpAction(
  providerReference: string
): Promise<ActionResult> {
  const [entry] = await db
    .select({
      userId: walletEntries.userId,
      amount: walletEntries.amount,
      status: walletEntries.status,
      idempotencyKey: walletEntries.idempotencyKey,
    })
    .from(walletEntries)
    .where(eq(walletEntries.providerReference, providerReference))
    .limit(1)
  if (!entry) return { ok: false, error: "wallet.errors.topupNotFound" }
  if (entry.status === "success") return { ok: true }
  if (entry.status !== "pending") {
    return { ok: false, error: "wallet.errors.topupNotPending" }
  }

  const finalStatus = await confirmWalletTopUp({
    userId: entry.userId,
    idempotencyKey: entry.idempotencyKey,
    amount: Number(entry.amount),
  })
  if (finalStatus !== "success") {
    return { ok: false, error: "wallet.errors.topupNotPending" }
  }

  const balance = await getWalletBalance(entry.userId)
  await createNotifications(
    {
      type: "wallet.topup",
      payload: { amount: Number(entry.amount), balanceAfter: balance },
      entityType: "wallet_entry",
      entityId: entry.idempotencyKey,
    },
    [entry.userId]
  ).catch(() => {})

  revalidateWallet()
  return { ok: true }
}

/**
 * Claim the whole wallet balance as cash. The balance is debited immediately
 * (type 'claim') so it can't be double-spent while the claim is pending; a
 * rejection credits it back. Payout happens offline via bKash within 3
 * working days of approval.
 */
export async function requestWalletClaimAction(): Promise<ActionResult> {
  const user = await getCurrentUser()
  if (!user) return unauthorized()

  if (await hasPendingWalletClaim(user.id)) {
    return { ok: false, error: "wallet.errors.claimAlreadyPending" }
  }

  const balance = await getWalletBalance(user.id)
  if (balance <= 0) {
    return { ok: false, error: "wallet.errors.claimNothingToClaim" }
  }

  const [claim] = await db
    .insert(walletClaims)
    .values({ userId: user.id, amount: String(balance) })
    .returning({ id: walletClaims.id })

  const moved = await applyWalletMovement({
    userId: user.id,
    amount: -balance,
    idempotencyKey: `claim_${claim.id}`,
    entryType: "claim",
    claimId: claim.id,
    description: "cash claim requested",
  })
  if (!moved) {
    // Balance moved concurrently — don't leave a phantom claim hanging.
    await db
      .update(walletClaims)
      .set({ status: "rejected", note: "system", handledAt: new Date(), updatedAt: new Date() })
      .where(eq(walletClaims.id, claim.id))
    return { ok: false, error: "wallet.errors.claimNothingToClaim" }
  }

  const [profile] = await db
    .select({ name: users.name })
    .from(users)
    .where(eq(users.id, user.id))
    .limit(1)
  await notifyAdmins({
    type: "wallet.claim_received",
    payload: { amount: balance, userName: profile?.name ?? "" },
    entityType: "wallet_claim",
    entityId: claim.id,
  }).catch(() => {})

  revalidateWallet()
  return { ok: true, id: claim.id }
}

/**
 * Admin decision on a cash claim. approve → payout window opens (offline
 * bKash within 3 working days); markPaid → money left the platform; reject →
 * the held balance is credited back to the user.
 */
export async function decideWalletClaimAction(input: {
  claimId: string
  decision: "approve" | "reject" | "markPaid"
  note?: string
}): Promise<ActionResult> {
  const admin = await getCurrentUser()
  if (!admin) return unauthorized()
  if (!admin.roles.includes("admin")) return forbidden()

  const [claim] = await db
    .select()
    .from(walletClaims)
    .where(eq(walletClaims.id, input.claimId))
    .limit(1)
  if (!claim) return { ok: false, error: "wallet.errors.claimNotFound" }

  const amount = Number(claim.amount)

  if (input.decision === "approve") {
    if (claim.status !== "pending") {
      return { ok: false, error: "wallet.errors.claimAlreadyHandled" }
    }
    await db
      .update(walletClaims)
      .set({
        status: "approved",
        handledBy: admin.id,
        handledAt: new Date(),
        note: input.note ?? claim.note,
        updatedAt: new Date(),
      })
      .where(and(eq(walletClaims.id, claim.id), eq(walletClaims.status, "pending")))
    await createNotifications(
      { type: "wallet.claim_approved", payload: { amount }, entityType: "wallet_claim", entityId: claim.id },
      [claim.userId]
    ).catch(() => {})
  } else if (input.decision === "reject") {
    if (claim.status !== "pending") {
      return { ok: false, error: "wallet.errors.claimAlreadyHandled" }
    }
    await db
      .update(walletClaims)
      .set({
        status: "rejected",
        handledBy: admin.id,
        handledAt: new Date(),
        note: input.note ?? claim.note,
        updatedAt: new Date(),
      })
      .where(and(eq(walletClaims.id, claim.id), eq(walletClaims.status, "pending")))
    // Give the held balance back — the claim debit reverses.
    await applyWalletMovement({
      userId: claim.userId,
      amount,
      idempotencyKey: `claim_back_${claim.id}`,
      entryType: "credit",
      claimId: claim.id,
      description: "claim rejected — balance returned",
    })
    await createNotifications(
      { type: "wallet.claim_rejected", payload: { amount, note: input.note ?? null }, entityType: "wallet_claim", entityId: claim.id },
      [claim.userId]
    ).catch(() => {})
  } else {
    if (claim.status !== "approved") {
      return { ok: false, error: "wallet.errors.claimNotApproved" }
    }
    await db
      .update(walletClaims)
      .set({
        status: "paid",
        handledBy: admin.id,
        handledAt: new Date(),
        note: input.note ?? claim.note,
        updatedAt: new Date(),
      })
      .where(and(eq(walletClaims.id, claim.id), eq(walletClaims.status, "approved")))
    await createNotifications(
      { type: "wallet.claim_paid", payload: { amount }, entityType: "wallet_claim", entityId: claim.id },
      [claim.userId]
    ).catch(() => {})
  }

  revalidatePath("/admin/wallet-claims")
  revalidateWallet()
  return { ok: true }
}

/** Claimable amount for the wallet UI (0 while a claim is pending). */
export async function claimableBalanceForUser(): Promise<number> {
  const user = await getCurrentUser()
  if (!user) return 0
  const [balance, pending] = await Promise.all([
    getWalletBalance(user.id),
    hasPendingWalletClaim(user.id),
  ])
  return claimableBalance(balance, pending)
}
