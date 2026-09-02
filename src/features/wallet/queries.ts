import "server-only"

import { and, desc, eq, sql } from "drizzle-orm"

import { db } from "@/db"
import { users, walletBalances, walletClaims, walletEntries } from "@/db/schema"

/** Current spendable balance (৳). Missing row = never topped up = ৳0. */
export async function getWalletBalance(userId: string): Promise<number> {
  const [row] = await db
    .select({ balance: walletBalances.balance })
    .from(walletBalances)
    .where(eq(walletBalances.userId, userId))
    .limit(1)
  return row ? Number(row.balance) : 0
}

export type WalletEntryRow = {
  id: string
  type: "topup" | "match_fee" | "credit" | "claim"
  status: "pending" | "success" | "failed"
  amount: number
  balanceAfter: number | null
  matchId: string | null
  description: string | null
  createdAt: Date
}

/** Newest-first entry history for the wallet page. */
export async function listWalletEntries(
  userId: string,
  limit = 30
): Promise<WalletEntryRow[]> {
  const rows = await db
    .select({
      id: walletEntries.id,
      type: walletEntries.type,
      status: walletEntries.status,
      amount: walletEntries.amount,
      balanceAfter: walletEntries.balanceAfter,
      matchId: walletEntries.matchId,
      description: walletEntries.description,
      createdAt: walletEntries.createdAt,
    })
    .from(walletEntries)
    .where(eq(walletEntries.userId, userId))
    .orderBy(desc(walletEntries.createdAt))
    .limit(limit)
  return rows.map((r) => ({
    ...r,
    amount: Number(r.amount),
    balanceAfter: r.balanceAfter == null ? null : Number(r.balanceAfter),
  }))
}

/** True while the user has a claim awaiting an admin decision. */
export async function hasPendingWalletClaim(userId: string): Promise<boolean> {
  const rows = await db
    .select({ id: walletClaims.id })
    .from(walletClaims)
    .where(and(eq(walletClaims.userId, userId), eq(walletClaims.status, "pending")))
    .limit(1)
  return rows.length > 0
}

export type WalletClaimRow = {
  id: string
  userId: string
  userName: string | null
  userPhone: string
  amount: number
  status: "pending" | "approved" | "paid" | "rejected"
  note: string | null
  createdAt: Date
  handledAt: Date | null
}

/** Admin queue — shape mirrors listRefundRequests (admin/queries.ts). */
export async function listWalletClaims(
  status?: "pending" | "approved" | "paid" | "rejected",
  limit = 50
): Promise<WalletClaimRow[]> {
  const rows = await db
    .select({
      id: walletClaims.id,
      userId: walletClaims.userId,
      userName: users.name,
      userPhone: users.phone,
      amount: walletClaims.amount,
      status: walletClaims.status,
      note: walletClaims.note,
      createdAt: walletClaims.createdAt,
      handledAt: walletClaims.handledAt,
    })
    .from(walletClaims)
    .innerJoin(users, eq(users.id, walletClaims.userId))
    .where(status ? eq(walletClaims.status, status) : undefined)
    .orderBy(desc(walletClaims.createdAt))
    .limit(limit)
  return rows.map((r) => ({ ...r, amount: Number(r.amount) }))
}

/**
 * Invariant check: balance = SUM(success entries). Dev/admin debug only —
 * a non-zero drift means a statement wrote one side without the other.
 */
export async function reconcileWalletBalance(
  userId: string
): Promise<{ stored: number; computed: number; drift: number }> {
  const stored = await getWalletBalance(userId)
  const [row] = await db
    .select({
      computed: sql<string>`COALESCE(SUM(${walletEntries.amount}), 0)`,
    })
    .from(walletEntries)
    .where(
      and(eq(walletEntries.userId, userId), eq(walletEntries.status, "success"))
    )
  const computed = Number(row?.computed ?? 0)
  return { stored, computed, drift: stored - computed }
}
