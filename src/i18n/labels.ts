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
  matchType,
  squadRole,
  slotStatus,
  teamMemberRole,
  userRole,
} from "@/db/schema/enums"
import type { AvatarSeries } from "@/features/player/avatar-catalog"
import type {
  PlayerPositionId,
  PlayerSkillId,
} from "@/features/player/positions"
import type { TurfFormat } from "@/features/turfs/formats"

type EnumValues<E extends { enumValues: readonly string[] }> = E["enumValues"][number]

export type BookingStatusValue = EnumValues<typeof bookingStatus>
export type MatchStateValue = EnumValues<typeof matchState>
export type MatchTypeValue = EnumValues<typeof matchType>
export type SquadRoleValue = EnumValues<typeof squadRole>
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

/** Format labels stay English in BOTH locales (BD turf-scene convention). */
export const MATCH_TYPE_LABEL: Record<MatchTypeValue, string> = {
  fives: "matches.format.fives",
  sevens: "matches.format.sevens",
  nines: "matches.format.nines",
  elevens: "matches.format.elevens",
}

export function matchTypeLabelKey(type: string): string {
  return MATCH_TYPE_LABEL[type as MatchTypeValue] ?? `matches.format.${type}`
}

export const SQUAD_ROLE_LABEL: Record<SquadRoleValue, string> = {
  starting: "matches.squad.starting",
  substitute: "matches.squad.substitutes",
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

/**
 * Conversational, context-aware status line (replaces technical state names
 * in the match room): open = opponent wanted (recruiting happens in
 * parallel), confirmed = match confirmed. Null → no sub-line.
 */
export function matchStateContextLabelKey(state: string): string | null {
  if (state === "open") return "matches.stateContext.open"
  if (state === "confirmed") return "matches.stateContext.confirmed"
  return null
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

/**
 * Player identity labels (position/skill). Unlike the enum maps above, the
 * backing columns are free text that predates canonical ids, so the helpers
 * return null for unknown/legacy values — callers then render the raw stored
 * string instead of t()-ing a key that does not exist.
 */
export const POSITION_LABEL: Record<PlayerPositionId, string> = {
  goalkeeper: "player.position.goalkeeper",
  defender: "player.position.defender",
  midfielder: "player.position.midfielder",
  winger: "player.position.winger",
  forward: "player.position.forward",
  striker: "player.position.striker",
  any: "player.position.any",
}

export const SKILL_LABEL: Record<PlayerSkillId, string> = {
  learning: "player.skill.learning",
  casual: "player.skill.casual",
  intermediate: "player.skill.intermediate",
  good: "player.skill.good",
  competitive: "player.skill.competitive",
}

export const AVATAR_SERIES_LABEL: Record<AvatarSeries, string> = {
  football: "player.avatarSeries.football",
  equipment: "player.avatarSeries.equipment",
  stadium: "player.avatarSeries.stadium",
  numbers: "player.avatarSeries.numbers",
  abstract: "player.avatarSeries.abstract",
}

/** Dict key for a canonical position id, or null for legacy free text. */
export function positionLabelKey(
  value: string | null | undefined
): string | null {
  return (POSITION_LABEL as Record<string, string>)[value ?? ""] ?? null
}

/** Dict key for a canonical skill id, or null for legacy free text. */
export function skillLabelKey(value: string | null | undefined): string | null {
  return (SKILL_LABEL as Record<string, string>)[value ?? ""] ?? null
}
