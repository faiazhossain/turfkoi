import {
  index,
  numeric,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core"

import { users } from "./users"
import { matches } from "./matches"
import {
  paymentProvider,
  walletClaimStatus,
  walletEntryStatus,
  walletEntryType,
} from "./enums"

/*
 * Matchmaking-fee wallet (৳25 per team per match — wallet-first collection).
 *
 * neon-http has no interactive transactions, so the stored balance row is the
 * atomic guard: every debit/credit writes the ledger row and moves
 * wallet_balances.balance in ONE statement (see features/wallet/service.ts).
 * Invariant: balance = SUM(entries WHERE status = 'success'); amounts are
 * signed (debit negative, credit positive).
 */

export const walletBalances = pgTable("wallet_balances", {
  userId: uuid("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "restrict" }),
  balance: numeric("balance", { precision: 12, scale: 2 })
    .notNull()
    .default("0.00"),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
})

export const walletClaims = pgTable(
  "wallet_claims",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    amount: numeric("amount", { precision: 12, scale: 2 }).notNull(),
    status: walletClaimStatus("status").notNull().default("pending"),
    handledBy: uuid("handled_by").references(() => users.id, {
      onDelete: "set null",
    }),
    handledAt: timestamp("handled_at", { withTimezone: true }),
    note: text("note"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [index("wallet_claims_status_idx").on(t.status)]
)

export const walletEntries = pgTable(
  "wallet_entries",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    type: walletEntryType("type").notNull(),
    // 'pending' only for bKash top-ups awaiting webhook confirmation.
    status: walletEntryStatus("status").notNull().default("success"),
    // Signed: debit negative (match_fee, claim), credit positive.
    amount: numeric("amount", { precision: 12, scale: 2 }).notNull(),
    balanceAfter: numeric("balance_after", { precision: 12, scale: 2 }),
    matchId: uuid("match_id").references(() => matches.id, {
      onDelete: "restrict",
    }),
    claimId: uuid("claim_id").references(() => walletClaims.id, {
      onDelete: "restrict",
    }),
    provider: paymentProvider("provider"),
    providerReference: text("provider_reference"),
    idempotencyKey: text("idempotency_key").notNull().unique(),
    description: text("description"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    index("wallet_entries_user_created_idx").on(t.userId, t.createdAt),
    index("wallet_entries_match_idx").on(t.matchId),
    index("wallet_entries_status_idx").on(t.status),
  ]
)
