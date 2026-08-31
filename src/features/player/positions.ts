/**
 * Canonical player identity values. Columns stay plain text in Postgres so
 * legacy free-text rows keep rendering; NEW writes go through the Zod enums
 * in ../player/schemas.ts, and unknown/legacy values fall back to their raw
 * stored text at display time (see src/i18n/labels.ts).
 */
/**
 * On-field positions — real positions a player can be recorded as playing.
 * "any" below is a profile-level availability flag, not a position, so
 * forms that record what someone plays (e.g. match guests) use this list.
 */
export const FIELD_POSITION_IDS = [
  "goalkeeper",
  "defender",
  "midfielder",
  "winger",
  "forward",
  "striker",
] as const

export const POSITION_IDS = [...FIELD_POSITION_IDS, "any"] as const

export const SKILL_IDS = [
  "learning",
  "casual",
  "intermediate",
  "good",
  "competitive",
] as const

export type PlayerPositionId = (typeof POSITION_IDS)[number]
export type PlayerSkillId = (typeof SKILL_IDS)[number]
