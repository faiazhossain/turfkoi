import "server-only"
import { or, desc, eq, ilike, inArray, ne, sql, gte } from "drizzle-orm"

import { db } from "@/db"
import {
  users,
  userRoles,
  turfs,
  teams,
  teamMembers,
  bookings,
  transactions,
  matches,
  payouts,
  refundRequests,
  reports,
} from "@/db/schema"
import {
  type bookingStatus,
  type transactionStatus,
  type refundRequestStatus,
  type reportStatus,
} from "@/db/schema"

type BookingStatusValue = (typeof bookingStatus.enumValues)[number]
type TransactionStatusValue = (typeof transactionStatus.enumValues)[number]
type RefundStatusValue = (typeof refundRequestStatus.enumValues)[number]
type ReportStatusValue = (typeof reportStatus.enumValues)[number]

export interface AdminKPIs {
  totalUsers: number
  totalTurfs: number
  pendingTurfs: number
  totalTeams: number
  disputedMatches: number
  activeBookings: number
  revenue30d: number
  failedTransactions: number
  pendingPayoutsCount: number
  pendingPayoutsAmount: number
  pendingRefunds: number
  openReports: number
}

const ACTIVE_BOOKING_STATES = [
  "held",
  "payment_pending",
  "confirmed",
] as const

export async function getAdminKPIs(): Promise<AdminKPIs> {
  const since = new Date(Date.now() - 30 * 86400000)

  const [userAgg] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(users)
    .where(ne(users.status, "deleted"))

  const [turfAgg] = await db
    .select({
      total: sql<number>`count(*)::int`,
      pending: sql<number>`count(*) filter (where ${turfs.isVerified} = false)::int`,
    })
    .from(turfs)

  const [teamAgg] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(teams)

  const [disputedAgg] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(matches)
    .where(
      or(eq(matches.resultStatus, "disputed"), eq(matches.state, "disputed"))
    )

  const [bookingAgg] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(bookings)
    .where(inArray(bookings.status, [...ACTIVE_BOOKING_STATES]))

  const [txnAgg] = await db
    .select({
      revenue: sql<number>`COALESCE(sum(${transactions.amount}), 0)::numeric`,
      failed: sql<number>`count(*) filter (where ${transactions.status} = 'failed')::int`,
    })
    .from(transactions)
    .where(gte(transactions.createdAt, since))

  const [payoutAgg] = await db
    .select({
      count: sql<number>`count(*)::int`,
      amount: sql<number>`COALESCE(sum(${payouts.amount}), 0)::numeric`,
    })
    .from(payouts)
    .where(eq(payouts.status, "pending"))

  const [refundAgg] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(refundRequests)
    .where(eq(refundRequests.status, "pending"))

  const [reportAgg] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(reports)
    .where(inArray(reports.status, ["pending", "reviewing"]))

  return {
    totalUsers: userAgg?.count ?? 0,
    totalTurfs: turfAgg?.total ?? 0,
    pendingTurfs: turfAgg?.pending ?? 0,
    totalTeams: teamAgg?.count ?? 0,
    disputedMatches: disputedAgg?.count ?? 0,
    activeBookings: bookingAgg?.count ?? 0,
    revenue30d: Number(txnAgg?.revenue ?? 0),
    failedTransactions: txnAgg?.failed ?? 0,
    pendingPayoutsCount: payoutAgg?.count ?? 0,
    pendingPayoutsAmount: Number(payoutAgg?.amount ?? 0),
    pendingRefunds: refundAgg?.count ?? 0,
    openReports: reportAgg?.count ?? 0,
  }
}

// (or_ shim removed — we import `or` from drizzle-orm directly.)

export interface AdminUserRow {
  id: string
  phone: string
  name: string | null
  email: string | null
  status: "active" | "suspended" | "deleted"
  roles: string[]
  createdAt: Date
}

export async function listUsers(search?: string): Promise<AdminUserRow[]> {
  const rows = await db
    .select({
      id: users.id,
      phone: users.phone,
      name: users.name,
      email: users.email,
      status: users.status,
      createdAt: users.createdAt,
      role: userRoles.role,
    })
    .from(users)
    .leftJoin(userRoles, eq(userRoles.userId, users.id))
    .where(
      search
        ? ilike(users.phone, `%${search}%`)
        : undefined
    )
    .orderBy(desc(users.createdAt))
    .limit(50)

  const byUser = new Map<string, AdminUserRow>()
  for (const r of rows) {
    const cur =
      byUser.get(r.id) ??
      {
        id: r.id,
        phone: r.phone,
        name: r.name,
        email: r.email,
        status: r.status,
        roles: [],
        createdAt: r.createdAt,
      }
    if (r.role) cur.roles.push(r.role)
    byUser.set(r.id, cur)
  }
  return Array.from(byUser.values())
}

export async function listTurfsAdmin(
  filter: "pending" | "verified" | "all" = "all"
) {
  const rows = await db
    .select({
      id: turfs.id,
      name: turfs.name,
      slug: turfs.slug,
      area: turfs.area,
      city: turfs.city,
      format: turfs.format,
      isVerified: turfs.isVerified,
      isActive: turfs.isActive,
      ownerId: turfs.ownerId,
      ownerPhone: users.phone,
      createdAt: turfs.createdAt,
    })
    .from(turfs)
    .innerJoin(users, eq(users.id, turfs.ownerId))
    .where(
      filter === "pending"
        ? eq(turfs.isVerified, false)
        : filter === "verified"
        ? eq(turfs.isVerified, true)
        : undefined
    )
    .orderBy(desc(turfs.createdAt))
    .limit(100)
  return rows
}

export async function listTeamsAdmin() {
  const rows = await db
    .select({
      id: teams.id,
      name: teams.name,
      slug: teams.slug,
      createdAt: teams.createdAt,
      memberCount: sql<number>`count(${teamMembers.userId})::int`,
    })
    .from(teams)
    .leftJoin(teamMembers, eq(teamMembers.teamId, teams.id))
    .groupBy(teams.id)
    .orderBy(desc(teams.createdAt))
    .limit(100)
  return rows
}

export interface AdminBookingRow {
  id: string
  turfName: string
  bookerPhone: string
  date: string
  slotStart: string
  slotEnd: string
  status: string
  totalAmount: string | null
  createdAt: Date
}

export async function listBookingsAdmin(
  filter: { status?: string; limit?: number } = {}
): Promise<AdminBookingRow[]> {
  const limit = Math.min(filter.limit ?? 50, 200)
  return db
    .select({
      id: bookings.id,
      turfName: turfs.name,
      bookerPhone: users.phone,
      date: bookings.date,
      slotStart: bookings.slotStart,
      slotEnd: bookings.slotEnd,
      status: bookings.status,
      totalAmount: bookings.totalAmount,
      createdAt: bookings.createdAt,
    })
    .from(bookings)
    .innerJoin(turfs, eq(turfs.id, bookings.turfId))
    .innerJoin(users, eq(users.id, bookings.bookerId))
    .where(
      filter.status
        ? eq(bookings.status, filter.status as BookingStatusValue)
        : undefined
    )
    .orderBy(desc(bookings.createdAt))
    .limit(limit)
}

export interface AdminTransactionRow {
  id: string
  bookingId: string
  payerPhone: string
  amount: string
  platformFee: string
  provider: string
  status: string
  providerReference: string | null
  createdAt: Date
}

export async function listTransactionsAdmin(
  filter: { status?: string; limit?: number } = {}
): Promise<AdminTransactionRow[]> {
  const limit = Math.min(filter.limit ?? 50, 200)
  return db
    .select({
      id: transactions.id,
      bookingId: transactions.bookingId,
      payerPhone: users.phone,
      amount: transactions.amount,
      platformFee: transactions.platformFee,
      provider: transactions.provider,
      status: transactions.status,
      providerReference: transactions.providerReference,
      createdAt: transactions.createdAt,
    })
    .from(transactions)
    .innerJoin(users, eq(users.id, transactions.payerId))
    .where(
      filter.status
        ? eq(transactions.status, filter.status as TransactionStatusValue)
        : undefined
    )
    .orderBy(desc(transactions.createdAt))
    .limit(limit)
}

export interface AdminDisputedMatchRow {
  id: string
  bookingId: string
  state: string
  resultStatus: string
  homeScore: number | null
  awayScore: number | null
  kickoffAt: Date | null
  turfName: string
  createdAt: Date
}

export async function listDisputedMatches(): Promise<AdminDisputedMatchRow[]> {
  return db
    .select({
      id: matches.id,
      bookingId: matches.bookingId,
      state: matches.state,
      resultStatus: matches.resultStatus,
      homeScore: matches.homeScore,
      awayScore: matches.awayScore,
      kickoffAt: matches.kickoffAt,
      turfName: turfs.name,
      createdAt: matches.createdAt,
    })
    .from(matches)
    .innerJoin(bookings, eq(bookings.id, matches.bookingId))
    .innerJoin(turfs, eq(turfs.id, bookings.turfId))
    .where(
      or(eq(matches.resultStatus, "disputed"), eq(matches.state, "disputed"))
    )
    .orderBy(desc(matches.createdAt))
    .limit(50)
}

export interface AdminRefundRequestRow {
  id: string
  bookingId: string
  turfName: string
  amount: string
  reason: string | null
  status: string
  requestedById: string
  requestedByPhone: string
  approvedByPhone: string | null
  createdAt: Date
  approvedAt: Date | null
}

export async function listRefundRequests(
  filter: { status?: string; limit?: number } = {}
): Promise<AdminRefundRequestRow[]> {
  const limit = Math.min(filter.limit ?? 50, 200)
  const rows = await db
    .select({
      id: refundRequests.id,
      bookingId: refundRequests.bookingId,
      amount: refundRequests.amount,
      reason: refundRequests.reason,
      status: refundRequests.status,
      createdAt: refundRequests.createdAt,
      approvedAt: refundRequests.approvedAt,
      approvedBy: refundRequests.approvedBy,
      requestedById: refundRequests.requestedBy,
      requesterPhone: users.phone,
      turfName: turfs.name,
    })
    .from(refundRequests)
    .innerJoin(users, eq(users.id, refundRequests.requestedBy))
    .innerJoin(bookings, eq(bookings.id, refundRequests.bookingId))
    .innerJoin(turfs, eq(turfs.id, bookings.turfId))
    .where(
      filter.status
        ? eq(refundRequests.status, filter.status as RefundStatusValue)
        : undefined
    )
    .orderBy(desc(refundRequests.createdAt))
    .limit(limit)

  // Second lookup for approver phone (avoids a self-join on users).
  const approverIds = Array.from(
    new Set(rows.map((r) => r.approvedBy).filter(Boolean) as string[])
  )
  let approverMap = new Map<string, string>()
  if (approverIds.length > 0) {
    const approvers = await db
      .select({ id: users.id, phone: users.phone })
      .from(users)
      .where(inArray(users.id, approverIds))
    approverMap = new Map(approvers.map((a) => [a.id, a.phone]))
  }

  return rows.map((r) => ({
    id: r.id,
    bookingId: r.bookingId,
    turfName: r.turfName,
    amount: r.amount,
    reason: r.reason,
    status: r.status,
    requestedById: r.requestedById,
    requestedByPhone: r.requesterPhone,
    approvedByPhone: r.approvedBy ? (approverMap.get(r.approvedBy) ?? null) : null,
    createdAt: r.createdAt,
    approvedAt: r.approvedAt,
  }))
}

export interface AdminReportRow {
  id: string
  reporterPhone: string
  entityType: string
  entityId: string
  reason: string
  status: string
  createdAt: Date
}

export async function listReports(
  filter: { status?: string; limit?: number } = {}
): Promise<AdminReportRow[]> {
  const limit = Math.min(filter.limit ?? 50, 200)
  return db
    .select({
      id: reports.id,
      entityType: reports.entityType,
      entityId: reports.entityId,
      reason: reports.reason,
      status: reports.status,
      createdAt: reports.createdAt,
      reporterPhone: users.phone,
    })
    .from(reports)
    .innerJoin(users, eq(users.id, reports.reporterId))
    .where(
      filter.status
        ? eq(reports.status, filter.status as ReportStatusValue)
        : undefined
    )
    .orderBy(desc(reports.createdAt))
    .limit(limit)
}
