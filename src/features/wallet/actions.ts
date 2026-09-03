"use server"

import { revalidatePath } from "next/cache"
import { and, eq, sql } from "drizzle-orm"

import { db } from "@/db"
import { isUniqueViolation } from "@/db/errors"
import { paymentSubmissions, users, walletClaims } from "@/db/schema"
import { getCurrentUser } from "@/lib/auth"
import { logAudit } from "@/lib/audit"
import { createNotifications, notifyAdmins } from "@/features/notifications/create"
import { confirmAsset } from "@/features/images/service"

import { submissionEvidenceSchema, normalizeTxId } from "@/features/payments/schemas"
import { isTopupAmountValid, claimableBalance } from "./logic"
import { getWalletBalance, hasPendingWalletClaim } from "./queries"
import { applyWalletMovement, ensureBalanceSql } from "./service"

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
 * Manual bKash Send Money top-up, step 1: the user sends money to the
 * DeshiTurf bKash number and files the TxID + optional receipt. NO ledger row
 * is written — the balance only moves when an admin VERIFIES the submission
 * (verifyTopupSubmission). Amount is validated server-side.
 */
export async function submitWalletTopUpAction(input: {
  amount: number
  transactionId: string
  senderNumber: string
  receiptPublicId?: string
  userNote?: string
}): Promise<ActionResult> {
  const user = await getCurrentUser()
  if (!user) return unauthorized()
  if (!isTopupAmountValid(input.amount)) {
    return { ok: false, error: "wallet.errors.topupInvalidAmount" }
  }
  const evidence = submissionEvidenceSchema.safeParse({
    transactionId: input.transactionId,
    senderNumber: input.senderNumber,
    receiptPublicId: input.receiptPublicId,
    userNote: input.userNote,
  })
  if (!evidence.success) {
    return { ok: false, error: evidence.error.issues[0]?.message ?? "errors.invalid" }
  }

  // One pending top-up submission at a time keeps the review queue honest;
  // resubmission is possible after a rejection.
  const [pending] = await db
    .select({ id: paymentSubmissions.id })
    .from(paymentSubmissions)
    .where(
      and(
        eq(paymentSubmissions.payerId, user.id),
        eq(paymentSubmissions.purpose, "wallet_topup"),
        eq(paymentSubmissions.status, "pending")
      )
    )
    .limit(1)
  if (pending) {
    return { ok: false, error: "payments.errors.alreadyPending" }
  }

  // Receipt (optional): must exist in the payer's receipts folder.
  if (evidence.data.receiptPublicId) {
    const confirm = await confirmAsset(
      "receipt",
      user.id,
      evidence.data.receiptPublicId
    )
    if (!confirm.ok) return { ok: false, error: "payments.errors.receiptInvalid" }
  }

  const [submission] = await db
    .insert(paymentSubmissions)
    .values({
      payerId: user.id,
      purpose: "wallet_topup",
      amount: String(input.amount),
      transactionId: normalizeTxId(evidence.data.transactionId),
      senderNumber: evidence.data.senderNumber,
      receiptPublicId: evidence.data.receiptPublicId ?? null,
      userNote: evidence.data.userNote || null,
    })
    .returning({ id: paymentSubmissions.id })

  const [profile] = await db
    .select({ name: users.name })
    .from(users)
    .where(eq(users.id, user.id))
    .limit(1)

  await notifyAdmins({
    type: "payment.submission_received",
    payload: {
      purpose: "wallet_topup",
      amount: input.amount,
      payerName: profile?.name ?? "",
    },
    entityType: "payment_submission",
    entityId: submission.id,
  }).catch(() => {})

  revalidateWallet()
  revalidatePath("/admin/payments")
  return { ok: true, id: submission.id }
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
    .catch((err: unknown) => {
      // Race: a pending claim already exists (wallet_claims_one_pending).
      if (isUniqueViolation(err)) return []
      throw err
    })
  if (!claim) {
    return { ok: false, error: "wallet.errors.claimAlreadyPending" }
  }

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
    // ATOMIC (audit G-3): claim rejection + the held-balance credit-back are
    // ONE statement — a crash can no longer leave the claim rejected with the
    // user's money still held. The nightly sweep backstops with the same
    // idempotency key.
    await db.execute(ensureBalanceSql(claim.userId))
    const rejectCte = await db.execute(sql`
      WITH cl AS (
        UPDATE wallet_claims
        SET status = 'rejected',
            handled_by = ${admin.id}::uuid,
            handled_at = now(),
            note = ${input.note ?? claim.note},
            updated_at = now()
        WHERE id = ${claim.id}::uuid AND status = 'pending'
        RETURNING user_id, amount
      ), upd AS (
        UPDATE wallet_balances
        SET balance = balance + (SELECT amount::numeric FROM cl), updated_at = now()
        WHERE user_id = (SELECT user_id FROM cl)
        RETURNING balance
      ), entry AS (
        INSERT INTO wallet_entries (
          user_id, type, status, amount, claim_id, balance_after,
          idempotency_key, description
        )
        SELECT (SELECT user_id FROM cl), 'credit', 'success',
               (SELECT amount FROM cl), ${claim.id}::uuid,
               (SELECT balance FROM upd),
               ${`claim_back_${claim.id}`},
               'claim rejected — balance returned'
        FROM upd
        RETURNING id
      )
      SELECT (SELECT count(*) FROM entry)::int AS applied
    `)
    const applied = Number(
      (rejectCte as unknown as { rows: { applied: number }[] }).rows?.[0]?.applied ?? 0
    )
    if (applied === 0) {
      return { ok: false, error: "wallet.errors.claimAlreadyHandled" }
    }
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

  void logAudit({
    actorId: admin.id,
    action: `wallet_claim.${input.decision}`,
    resourceType: "wallet_claim",
    resourceId: claim.id,
    before: { status: claim.status, amount: claim.amount },
    after: { status: input.decision === "approve" ? "approved" : input.decision === "reject" ? "rejected" : "paid" },
  }).catch(() => {})

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
