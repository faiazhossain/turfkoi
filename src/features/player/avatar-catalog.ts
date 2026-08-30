/**
 * DeshiTurf preset avatar catalog — the single source of truth for preset
 * player avatars. Pure module: safe in server and client components.
 *
 * ## Islamic-compliance design constraint (product requirement)
 *
 * Presets are STRICTLY NON-ANIMATE. Every asset may only depict inanimate
 * football objects, equipment, stadium architecture, pitch geometry,
 * numerals, letters, or abstract patterns. Never add: humans, faces,
 * silhouettes, body parts, animals, birds, mascots, fantasy creatures, or
 * any shape a viewer could read as a living being. Also never add religious
 * symbols, Qur'anic text, or divine/prophetic names — the system is
 * sports-first and stays that way. Before adding a preset, run the safety
 * checklist in the feature docs (section 20) and keep it inanimate.
 *
 * ## SVG asset design language (public/avatars/<id>.svg)
 *
 * - viewBox="0 0 96 96", full-bleed square. Shown in circles and rounded
 *   squares, so focal content stays inside the central 64x64 (16..80).
 * - Dark-only palette, baked hex (the app is dark-only per audit I2; if a
 *   light theme ever ships, the whole set must be re-exported):
 *   ground #11161D, top-light gradient #1B2431 -> #10151C, structure
 *   strokes #2D3C4F, primary accent #8CE000, secondary accent #7453FA,
 *   neutral whites at 0.06-0.9 opacity.
 * - Flat vector, stroke-width ~2 (6 for the big number glyphs), round caps
 *   and joins, one focal object, subtle top light so tiles read at 32px.
 * - Numerals and letters are drawn as <path>/<ellipse> strokes, never
 *   <text> — SVG-in-<img> would render system fonts and break the system.
 * - Forbidden inside assets: <script>, <image>, external refs, <text>,
 *   <animate*>, turbulence filters; at most one soft feGaussianBlur.
 * - Bump AVATAR_CATALOG_VERSION when art changes — /public URLs are not
 *   content-hashed, so the version query busts caches.
 */

export const AVATAR_SERIES = [
  "football",
  "equipment",
  "stadium",
  "numbers",
  "abstract",
] as const

export type AvatarSeries = (typeof AVATAR_SERIES)[number]

export type PresetAvatar = {
  /** Catalog id == filename stem in public/avatars/. kebab-case ASCII. */
  id: string
  series: AvatarSeries
  /** Root-relative asset path (no cache-busting query). */
  file: string
  /** Dictionary key for alt/aria text (player.avatars.*). */
  labelKey: string
}

const avatar = (id: string, series: AvatarSeries): PresetAvatar => ({
  id,
  series,
  file: `/avatars/${id}.svg`,
  labelKey: `player.avatars.${id.replace(/-([a-z0-9])/g, (_, c: string) =>
    c.toUpperCase()
  )}`,
})

export const PRESET_AVATARS: readonly PresetAvatar[] = [
  // Football
  avatar("ball-classic", "football"),
  avatar("ball-monochrome", "football"),
  avatar("ball-gold", "football"),
  avatar("ball-neon", "football"),
  // Equipment
  avatar("boot-strike", "equipment"),
  avatar("ref-whistle", "equipment"),
  avatar("captain-armband", "equipment"),
  avatar("training-cone", "equipment"),
  avatar("shin-guard", "equipment"),
  avatar("training-bib", "equipment"),
  avatar("trophy-cup", "equipment"),
  avatar("jersey-classic", "equipment"),
  // Stadium / pitch
  avatar("goal-frame", "stadium"),
  avatar("goal-net", "stadium"),
  avatar("corner-flag", "stadium"),
  avatar("floodlight-mast", "stadium"),
  avatar("stadium-bowl", "stadium"),
  avatar("pitch-center-circle", "stadium"),
  // Identity numbers (jersey-number style; extend the catalog to add more)
  avatar("number-7", "numbers"),
  avatar("number-9", "numbers"),
  avatar("number-10", "numbers"),
  avatar("number-11", "numbers"),
  avatar("number-17", "numbers"),
  avatar("number-23", "numbers"),
  // Abstract / geometric
  avatar("crest-shield", "abstract"),
  avatar("hex-mosaic", "abstract"),
  avatar("speed-lines", "abstract"),
  avatar("pitch-lines", "abstract"),
  avatar("star-burst", "abstract"),
]

const ID_SET = new Set(PRESET_AVATARS.map((a) => a.id))

/** All catalog ids, in catalog order (the whitelist used by server actions). */
export const PRESET_AVATAR_IDS: readonly string[] = PRESET_AVATARS.map(
  (a) => a.id
)

export const AVATARS_BY_SERIES: Record<AvatarSeries, readonly PresetAvatar[]> =
  {
    football: PRESET_AVATARS.filter((a) => a.series === "football"),
    equipment: PRESET_AVATARS.filter((a) => a.series === "equipment"),
    stadium: PRESET_AVATARS.filter((a) => a.series === "stadium"),
    numbers: PRESET_AVATARS.filter((a) => a.series === "numbers"),
    abstract: PRESET_AVATARS.filter((a) => a.series === "abstract"),
  }

/** Cache-busting version for /public asset URLs (bump when art changes). */
export const AVATAR_CATALOG_VERSION = "1"

/**
 * Exact-match whitelist check — the server-side trust boundary. Never
 * prefix/regex-match client-supplied ids against this set.
 */
export function isPresetAvatarId(id: string): boolean {
  return ID_SET.has(id)
}

export function getPresetAvatar(id: string): PresetAvatar | null {
  return PRESET_AVATARS.find((a) => a.id === id) ?? null
}

/** Cache-busted src for a preset id, or null when the id is unknown. */
export function presetAvatarSrc(id: string): string | null {
  return getPresetAvatar(id)?.file
    ? `${getPresetAvatar(id)!.file}?v=${AVATAR_CATALOG_VERSION}`
    : null
}
