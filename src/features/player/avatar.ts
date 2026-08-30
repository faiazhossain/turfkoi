/**
 * Resolves a player_profiles row into something renderable. Pure module —
 * safe in server and client components.
 *
 * Read contract (matches migration 0019's avatar_type semantics):
 *   type "preset" + known id  -> preset asset
 *   type "photo", or legacy NULL type with a Cloudinary id -> photo
 *   anything else             -> initials fallback (never a broken <img>)
 */
import { clientImageUrl } from "@/features/images/urls"

import { getPresetAvatar, presetAvatarSrc } from "./avatar-catalog"

export type AvatarDisplay =
  | { kind: "photo"; src: string; altKey: string }
  | { kind: "preset"; src: string; labelKey: string }
  | { kind: "initials"; text: string }

export function resolveAvatarDisplay(input: {
  avatarType?: string | null
  avatarPublicId?: string | null
  avatarPresetId?: string | null
  name?: string | null
}): AvatarDisplay {
  if (input.avatarType === "preset") {
    const src = input.avatarPresetId ? presetAvatarSrc(input.avatarPresetId) : null
    const preset = input.avatarPresetId
      ? getPresetAvatar(input.avatarPresetId)
      : null
    if (preset && src) {
      return { kind: "preset", src, labelKey: preset.labelKey }
    }
  }
  if (
    (!input.avatarType || input.avatarType === "photo") &&
    input.avatarPublicId
  ) {
    return {
      kind: "photo",
      src: clientImageUrl(input.avatarPublicId, "avatar"),
      altKey: "settings.avatarAlt",
    }
  }
  return { kind: "initials", text: initialsFromName(input.name) }
}

/**
 * First grapheme of the first two words — Intl.Segmenter keeps Bangla
 * conjuncts and vowel signs intact ("রাকিব হাসান" -> "রা হা").
 */
export function initialsFromName(name: string | null | undefined): string {
  if (!name) return ""
  const words = name.trim().split(/\s+/).filter(Boolean)
  return words
    .slice(0, 2)
    .map(firstGrapheme)
    .join(" ")
    .toUpperCase()
}

function firstGrapheme(word: string): string {
  if (typeof Intl !== "undefined" && "Segmenter" in Intl) {
    const segmenter = new Intl.Segmenter("bn", { granularity: "grapheme" })
    const first = segmenter.segment(word)[Symbol.iterator]().next()
    return first.done ? "" : first.value.segment
  }
  return word.slice(0, 1)
}
