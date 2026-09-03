import "server-only"

import { and, eq, sql, type SQL } from "drizzle-orm"

import { db } from "@/db"
import { walletEntries } from "@/db/schema"
import { MATCH_FEE_BDT } from "@/lib/pricing"

/**
 * Wallet balance movement under neon-http (no interactive transactions —
 * db.transaction() throws, see features/matches/seat-claim.ts).
 *
 * Every statement is atomic on its own: the guarded `UPDATE wallet_balances`
 * is the SOLE authority (row lock + WHERE re-check make races safe), and the
 * ledger row is inserted only from its RETURNING rows — so balance and
 * ledger can never diverge. The idempotency-key guard lives in the UPDATE's
 * WHERE too, so a retry after success is a clean no-op.
 *
 * The stored balance row must exist before movement: always prepend
 * ensureBalanceSql in the same db.batch (a data-modifying CTE in the same
 * statement would not be visible to the UPDATE's snapshot).
 */

/** First-touch: create the balance row at ৳0. Cheap + safe to always run. */
export function ensureBalanceSql(userId: string): SQL {
  return sql`INSERT INTO wallet_balances (user_id, balance)
    VALUES (${userId}, 0) ON CONFLICT (user_id) DO NOTHING`
}

function movementSql(input: {
  userId: string
  /** Signed: negative = debit, positive = credit. */
  amount: number
  idempotencyKey: string
  entryType: "match_fee" | "claim" | "credit"
  matchId?: string | null
  claimId?: string | null
  description?: string | null
  /** Extra predicate on the authoritative UPDATE (e.g. "the claim won"). */
  extraGuard?: SQL | null
}): SQL {
  const {
    userId,
    amount,
    idempotencyKey,
    entryType,
    matchId = null,
    claimId = null,
    description = null,
    extraGuard = null,
  } = input
  const abs = Math.abs(amount)
  // Debits require sufficient balance; credits always pass this guard.
  const floor = amount < 0 ? abs : 0
  const sign = amount < 0 ? "-" : "+"
  return sql`
    WITH upd AS (
      UPDATE wallet_balances
      SET balance = balance ${sql.raw(sign)} ${abs}::numeric, updated_at = now()
      WHERE user_id = ${userId}
        AND balance >= ${floor}::numeric
        AND NOT EXISTS (
          SELECT 1 FROM wallet_entries WHERE idempotency_key = ${idempotencyKey}
        )
        ${extraGuard ? sql`AND ${extraGuard}` : sql``}
      RETURNING balance
    ), entry AS (
      INSERT INTO wallet_entries (
        user_id, type, status, amount, match_id, claim_id,
        balance_after, idempotency_key, description
      )
      SELECT ${userId}, ${entryType}::wallet_entry_type, 'success',
             ${amount}::numeric, ${matchId}, ${claimId},
             (SELECT balance FROM upd), ${idempotencyKey}, ${description}
      FROM upd
      RETURNING id
    )
    SELECT 1
  `
}

export type WalletMovement = {
  userId: string
  /** Signed: negative = debit, positive = credit. */
  amount: number
  idempotencyKey: string
  entryType: "match_fee" | "claim" | "credit"
  matchId?: string | null
  claimId?: string | null
  description?: string | null
}

/**
 * Standalone wallet movement (top-up confirm, claim debit/credit-back). Runs
 * as one batch: balance row ensured + single-statement movement. Returns
 * true when the entry exists afterwards (first application OR a retry after
 * success; false = insufficient balance for a debit).
 */
export async function applyWalletMovement(
  input: WalletMovement
): Promise<boolean> {
  // Two separate statements (db.batch can't take raw SQL in this drizzle
  // version): the ensure is a trivial idempotent insert, the movement itself
  // is one atomic statement.
  await db.execute(ensureBalanceSql(input.userId))
  await db.execute(movementSql(input))
  const [row] = await db
    .select({ id: walletEntries.id })
    .from(walletEntries)
    .where(eq(walletEntries.idempotencyKey, input.idempotencyKey))
    .limit(1)
  return row !== undefined
}

/**
 * The away-side claim / match-create guard fragment: TRUE when the idem-keyed
 * fee entry exists — i.e. the fee statement earlier in the same db.batch
 * charged the payer. Use it to guard the match-side INSERT so an unfunded
 * captain can never create a fee-less match (batch statements run in one
 * server-side transaction, so later statements see the fee row).
 */
export function feeAppliedGuardSql(idempotencyKey: string): SQL {
  return sql`EXISTS (
    SELECT 1 FROM wallet_entries WHERE idempotency_key = ${idempotencyKey}
  )`
}

export type MatchFeeCharge = {
  userId: string
  matchId: string
  idempotencyKey: string
  /** "home" | "away" — only for the description column. */
  side?: "home" | "away"
  /**
   * Extra predicate on the fee UPDATE — the batch's later statements guard
   * on this fee's existence, so a no-op here must mean no charge (e.g. the
   * FCFS claim lost the race).
   */
  extraGuard?: SQL | null
}

/** Fee debit statement (charged at the match checkpoints, wallet-first). */
export function matchFeeDebitSql(charge: MatchFeeCharge): SQL {
  return movementSql({
    userId: charge.userId,
    amount: -MATCH_FEE_BDT,
    idempotencyKey: charge.idempotencyKey,
    entryType: "match_fee",
    matchId: charge.matchId,
    description: charge.side ? `match fee (${charge.side})` : "match fee",
    extraGuard: charge.extraGuard ?? null,
  })
}

function topupConfirmSql(input: {
  submissionId: string
  adminId: string
  idempotencyKey: string
}): SQL {
  return sql`
    WITH sub AS (
      UPDATE payment_submissions
      SET status = 'consumed',
          consumed_at = now(),
          consumed_by = ${input.adminId}::uuid,
          reviewed_by = ${input.adminId}::uuid,
          reviewed_at = now(),
          updated_at = now()
      WHERE id = ${input.submissionId}::uuid
        AND status = 'pending'
        AND purpose = 'wallet_topup'
      RETURNING payer_id, amount, transaction_id
    ), upd AS (
      UPDATE wallet_balances
      SET balance = balance + (SELECT amount::numeric FROM sub), updated_at = now()
      WHERE user_id = (SELECT payer_id FROM sub)
      RETURNING balance
    ), entry AS (
      INSERT INTO wallet_entries (
        user_id, type, status, amount, balance_after,
        idempotency_key, provider, provider_reference, description
      )
      SELECT (SELECT payer_id FROM sub), 'topup', 'success',
             (SELECT amount FROM sub), (SELECT balance FROM upd),
             ${input.idempotencyKey}, 'bkash', (SELECT transaction_id FROM sub),
             'bKash send-money top-up (admin verified)'
      FROM upd
      RETURNING id
    )
    SELECT 1
  `
}

/**
 * Land an admin-verified manual top-up: consume the payment submission and
 * credit the wallet in ONE statement — the pending → consumed flip is the
 * guard, so a crash between "verified" and "applied" is impossible by
 * construction and double-verify is a clean no-op. Caller must run
 * ensureBalanceSql(payerId) first (a first-time top-up has no balance row).
 * Returns true when the ledger entry exists afterwards.
 */
export async function verifyTopupSubmission(input: {
  submissionId: string
  adminId: string
  payerId: string
}): Promise<boolean> {
  const idempotencyKey = `topup_pay_${input.submissionId}`
  await db.execute(ensureBalanceSql(input.payerId))
  await db.execute(
    topupConfirmSql({
      submissionId: input.submissionId,
      adminId: input.adminId,
      idempotencyKey,
    })
  )
  const [row] = await db
    .select({ id: walletEntries.id })
    .from(walletEntries)
    .where(eq(walletEntries.idempotencyKey, idempotencyKey))
    .limit(1)
  return row !== undefined
}

/**
 * Credit back every successful fee debit on a fall-through match. Idempotent
 * (per-entry `fee_back_<entryId>` keys), safe to call from multiple paths —
 * only the first call moves money. Callers must have already verified the
 * match state is a fall-through (logic.shouldCreditMatchFees).
 */
export async function creditMatchFees(matchId: string): Promise<number> {
  const fees = await db
    .select({
      id: walletEntries.id,
      userId: walletEntries.userId,
    })
    .from(walletEntries)
    .where(
      and(
        eq(walletEntries.matchId, matchId),
        eq(walletEntries.type, "match_fee"),
        eq(walletEntries.status, "success")
      )
    )
  const { createNotifications } = await import(
    "@/features/notifications/create"
  )
  let credited = 0
  for (const fee of fees) {
    const backKey = `fee_back_${fee.id}`
    const applied = await applyWalletMovement({
      userId: fee.userId,
      amount: MATCH_FEE_BDT,
      idempotencyKey: backKey,
      entryType: "credit",
      matchId,
      description: "match fee credited back",
    })
    if (applied) {
      credited += 1
      await createNotifications(
        {
          type: "match.fee_credited",
          payload: { matchId, amount: MATCH_FEE_BDT },
          entityType: "wallet_entry",
          entityId: backKey,
        },
        [fee.userId]
      ).catch(() => {})
    }
  }
  return credited
}

/**
 * Credit back ONE fee entry (the decline path returns the challenger's
 * latest live hold). Idempotent via the per-entry back key.
 */
export async function creditFeeEntry(entryId: string): Promise<boolean> {
  const [fee] = await db
    .select({ userId: walletEntries.userId, matchId: walletEntries.matchId })
    .from(walletEntries)
    .where(eq(walletEntries.id, entryId))
    .limit(1)
  if (!fee) return false
  const applied = await applyWalletMovement({
    userId: fee.userId,
    amount: MATCH_FEE_BDT,
    idempotencyKey: `fee_back_${entryId}`,
    entryType: "credit",
    matchId: fee.matchId,
    description: "challenge declined — fee credited back",
  })
  return applied
}

/** Latest successful away-fee entry for a (match, sender), if any. */
export async function latestAwayFeeEntry(
  matchId: string,
  userId: string
): Promise<{ id: string; idempotencyKey: string } | null> {
  const [row] = await db
    .select({ id: walletEntries.id, idempotencyKey: walletEntries.idempotencyKey })
    .from(walletEntries)
    .where(
      and(
        eq(walletEntries.matchId, matchId),
        eq(walletEntries.userId, userId),
        eq(walletEntries.type, "match_fee"),
        eq(walletEntries.status, "success")
      )
    )
    .orderBy(sql`created_at DESC`)
    .limit(1)
  return row ?? null
}
