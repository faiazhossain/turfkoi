/**
 * Centralized enum -> dictionary-key maps. Values are translation keys
 * (resolved with t()/getT()), NOT display strings, so locales stay in the
 * dictionaries. Typed against the actual Postgres enum unions — adding an
 * enum value without a key here fails typecheck.
 *
 * Pure module (type-only db imports) — safe in client components.
 */
import type {
  bookingStatus,
  matchState,
  slotStatus,
  teamMemberRole,
  userRole,
} from "@/db/schema/enums"
import type { TurfFormat } from "@/features/turfs/formats"

type EnumValues<E extends { enumValues: readonly string[] }> = E["enumValues"][number]

export type BookingStatusValue = EnumValues<typeof bookingStatus>
export type MatchStateValue = EnumValues<typeof matchState>
export type SlotStatusValue = EnumValues<typeof slotStatus>
export type TeamMemberRoleValue = EnumValues<typeof teamMemberRole>
export type UserRoleValue = EnumValues<typeof userRole>

export const BOOKING_STATUS_LABEL: Record<BookingStatusValue, string> = {
  available: "player.bookingStatus.available",
  held: "player.bookingStatus.held",
  payment_pending: "player.bookingStatus.payment_pending",
  payment_failed: "player.bookingStatus.payment_failed",
  confirmed: "player.bookingStatus.confirmed",
  expired: "player.bookingStatus.expired",
  cancelled: "player.bookingStatus.cancelled",
  refunded: "player.bookingStatus.refunded",
  completed: "player.bookingStatus.completed",
}

export const MATCH_STATE_LABEL: Record<MatchStateValue, string> = {
  draft: "matches.state.draft",
  open: "matches.state.open",
  opponent_found: "matches.state.opponent_found",
  payment_pending: "matches.state.payment_pending",
  confirmed: "matches.state.confirmed",
  roster_building: "matches.state.roster_building",
  ready: "matches.state.ready",
  ongoing: "matches.state.ongoing",
  completed: "matches.state.completed",
  cancelled: "matches.state.cancelled",
  expired: "matches.state.expired",
  disputed: "matches.state.disputed",
}

export const SLOT_STATUS_LABEL: Record<SlotStatusValue, string> = {
  available: "turfOwner.slots.status.available",
  held: "turfOwner.slots.status.held",
  booked: "turfOwner.slots.status.booked",
  maintenance: "turfOwner.slots.status.maintenance",
  blocked: "turfOwner.slots.status.blocked",
}

export const TEAM_MEMBER_ROLE_LABEL: Record<TeamMemberRoleValue, string> = {
  owner: "team.role.owner",
  captain: "team.role.captain",
  manager: "team.role.manager",
  player: "team.role.player",
}

export const USER_ROLE_LABEL: Record<UserRoleValue, string> = {
  admin: "admin.users.roles.admin",
  turf_owner: "admin.users.roles.turf_owner",
  team_owner: "admin.users.roles.team_owner",
  player: "admin.users.roles.player",
}

/** Format labels stay English in BOTH locales (BD turf-scene convention). */
export const TURF_FORMAT_LABEL: Record<TurfFormat, string> = {
  fives: "turfs.format.fives",
  sixes: "turfs.format.sixes",
  sevens: "turfs.format.sevens",
  eights: "turfs.format.eights",
  nines: "turfs.format.nines",
  tens: "turfs.format.tens",
  elevens: "turfs.format.elevens",
}

/**
 * Lookup helpers. Query layers hand us plain strings (serialized rows), so
 * the functions accept string and fall back to the legacy template-key
 * behavior; the Records above stay exhaustively typed, so a new enum value
 * without a key fails typecheck.
 */
export function bookingStatusLabel(status: string): string {
  return BOOKING_STATUS_LABEL[status as BookingStatusValue] ?? `player.bookingStatus.${status}`
}

export function matchStateLabel(state: string): string {
  return MATCH_STATE_LABEL[state as MatchStateValue] ?? `matches.state.${state}`
}

export function slotStatusLabel(status: string): string {
  return SLOT_STATUS_LABEL[status as SlotStatusValue] ?? `turfOwner.slots.status.${status}`
}

export function teamMemberRoleLabel(role: string): string {
  return TEAM_MEMBER_ROLE_LABEL[role as TeamMemberRoleValue] ?? `team.role.${role}`
}

export function userRoleLabel(role: string): string {
  return USER_ROLE_LABEL[role as UserRoleValue] ?? `admin.users.roles.${role}`
}

export function turfFormatLabelKey(format: string): string {
  return TURF_FORMAT_LABEL[format as TurfFormat] ?? `turfs.format.${format}`
}
