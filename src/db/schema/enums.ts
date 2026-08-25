import { pgEnum } from "drizzle-orm/pg-core"

// SS5 / SS6
export const userStatus = pgEnum("user_status", [
  "active",
  "suspended",
  "deleted",
])
export const userRole = pgEnum("user_role", [
  "admin",
  "turf_owner",
  "team_owner",
  "player",
])

// SS21 (team-internal roles, distinct from RBAC user roles)
export const teamMemberRole = pgEnum("team_member_role", [
  "owner",
  "captain",
  "manager",
  "player",
])

// Turf playing format, 5- through 11-a-side (match_type is separate).
export const turfFormat = pgEnum("turf_format", [
  "fives",
  "sixes",
  "sevens",
  "eights",
  "nines",
  "tens",
  "elevens",
])

// F8: slot status enum
export const slotStatus = pgEnum("slot_status", [
  "available",
  "held",
  "booked",
  "maintenance",
  "blocked",
])

// Slot system P1: how a materialized row came to exist. "template" rows are
// owned by the schedule and may be updated/deleted by materialization;
// "manual" rows were hand-added or hand-edited by the owner and are never
// touched by regeneration (single-slot touch > date exception > schedule).
export const slotSource = pgEnum("slot_source", ["template", "manual"])

// Slot system P2: how a date-level price exception modifies section prices.
// multiplier scales them (holiday rate 1.25x, rounded to whole Taka);
// absolute replaces them.
export const datePriceMode = pgEnum("date_price_mode", ["multiplier", "absolute"])

// SS27 booking lifecycle
export const bookingStatus = pgEnum("booking_status", [
  "available",
  "held",
  "payment_pending",
  "payment_failed",
  "confirmed",
  "expired",
  "cancelled",
  "refunded",
  "completed",
])

// SS29 transaction state machine
export const transactionStatus = pgEnum("transaction_status", [
  "created",
  "pending",
  "success",
  "failed",
  "cancelled",
  "refunded",
  "partially_refunded",
])

export const paymentProvider = pgEnum("payment_provider", [
  "bkash",
  "nagad", // Post-MVP (audit B6: bKash only in MVP)
  "card",
])

export const payoutStatus = pgEnum("payout_status", [
  "pending",
  "scheduled",
  "paid",
  "failed",
])

export const matchType = pgEnum("match_type", ["fives", "sevens"])

// SS23 match state machine
export const matchState = pgEnum("match_state", [
  "draft",
  "open",
  "opponent_found",
  "payment_pending",
  "confirmed",
  "roster_building",
  "ready",
  "ongoing",
  "completed",
  "cancelled",
  "expired",
  "disputed",
])

// F1: result status
export const resultStatus = pgEnum("result_status", [
  "pending",
  "confirmed",
  "disputed",
])

export const matchPlayerRole = pgEnum("match_player_role", ["member", "guest"])

export const matchSide = pgEnum("match_side", ["home", "away"])

export const requestStatus = pgEnum("request_status", [
  "pending",
  "accepted",
  "rejected",
  "cancelled",
  "expired",
])

// Money-flow model: per-turf-owner cancellation policy
export const cancellationPolicy = pgEnum("cancellation_policy", [
  "flexible",
  "moderate",
  "rebook_contingent",
  "strict",
])

export const reportStatus = pgEnum("report_status", [
  "pending",
  "reviewing",
  "resolved",
  "dismissed",
])

// Owner-initiated "list my turf" applications (Option C funnel). Admin
// approves -> turf is seeded + claim invite minted; rejected stays archived.
export const turfApplicationStatus = pgEnum("turf_application_status", [
  "pending",
  "approved",
  "rejected",
])

// H4: dual-control refund request lifecycle. Amounts > Tk5,000 must move
// pending → approved by a *second* admin before the money actually moves.
export const refundRequestStatus = pgEnum("refund_request_status", [
  "pending",
  "approved",
  "rejected",
  "executed",
  "cancelled",
])
