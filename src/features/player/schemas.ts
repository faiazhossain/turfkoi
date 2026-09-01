import { z } from "zod"

import { isPresetAvatarId } from "./avatar-catalog"
import { RESERVED_USERNAMES, USERNAME_RE } from "./username"
import { POSITION_IDS, SKILL_IDS } from "./positions"

/**
 * Write contract for player identity fields:
 *   undefined -> leave the stored value untouched
 *   null      -> clear (Drizzle's set() skips undefined keys)
 *   ""        -> treated as null at the schema edge (form inputs submit "")
 */
const emptyToUndefined = <T extends z.ZodType>(schema: T) =>
  z.preprocess((v) => (v === "" ? undefined : v), schema)

const positionField = emptyToUndefined(
  z.enum(POSITION_IDS, "profile.errors.invalidPosition").optional()
)
const skillField = emptyToUndefined(
  z.enum(SKILL_IDS, "profile.errors.invalidSkill").optional()
)

export const updateProfileSchema = z
  .object({
    // Present-but-empty name fails validation instead of silently keeping
    // the old value — the edit form always sends name.
    name: z
      .string()
      .trim()
      .min(2, "auth.errors.name_short")
      .max(60, "auth.errors.name_max")
      .optional(),
    // Player Network handle: "" = untouched (form submits "" when unchanged).
    username: z
      .string()
      .optional()
      .transform((v) => (v === undefined ? undefined : v.trim().toLowerCase().replace(/^@/, "")))
      .refine((v) => v === undefined || v === "" || USERNAME_RE.test(v), "auth.errors.usernameInvalid")
      .refine(
        (v) => v === undefined || v === "" || !RESERVED_USERNAMES.has(v),
        "auth.errors.usernameReserved"
      ),
    position: positionField,
    // Secondary position: "" (the "none" chip) means explicit clear.
    secondaryPosition: z.preprocess(
      (v) => (v === "" ? null : v),
      emptyToUndefined(
        z.enum(POSITION_IDS, "profile.errors.invalidPosition").nullish()
      )
    ),
    skill: skillField,
    bio: z.preprocess((v) => {
      if (typeof v !== "string") return v
      // Collapse runs of spaces/tabs (keep newlines), strip bidi/control
      // overrides that could spoof rendering, trim.
      const cleaned = v
        .replace(/[^\S\n]+/g, " ")
        .replace(/[‎‏‪-‮⁦-⁩]/g, "")
        .trim()
      return cleaned === "" ? null : cleaned
    }, z.string().max(280, "profile.errors.bioTooLong").nullable().optional()),
    area: z.preprocess(
      (v) => (v === "" ? null : v),
      z.string().trim().max(80).nullable().optional()
    ),
    coords: z
      .object({
        lat: z.number().min(-90).max(90),
        lng: z.number().min(-180).max(180),
      })
      .nullable()
      .optional(),
    avatarType: z
      .enum(["photo", "preset"], "profile.errors.invalidAvatar")
      .optional(),
    avatarPresetId: z.string().max(48).optional(),
  })
  .superRefine((v, ctx) => {
    if (v.avatarType === "preset") {
      // Server-side whitelist check — never trust a client-supplied id/path.
      if (!v.avatarPresetId || !isPresetAvatarId(v.avatarPresetId)) {
        ctx.addIssue({
          code: "custom",
          path: ["avatarPresetId"],
          message: "profile.errors.invalidAvatar",
        })
      }
    }
    if (v.avatarType === "photo" && v.avatarPresetId) {
      // A preset id cannot ride along with a photo mode switch.
      ctx.addIssue({
        code: "custom",
        path: ["avatarPresetId"],
        message: "profile.errors.invalidAvatar",
      })
    }
  })
export type UpdateProfileValues = z.infer<typeof updateProfileSchema>

/**
 * Client-side form validation only. Deliberately lenient about position/
 * skill (legacy free text must not block saving — it is canonicalized in
 * the submit handler and re-validated strictly by updateProfileSchema).
 */
export const profileEditFormSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, "auth.errors.name_short")
    .max(60, "auth.errors.name_max"),
  position: z.string(),
  secondaryPosition: z.string(),
  skill: z.string(),
  area: z.string().max(80),
  bio: z.string().max(280, "profile.errors.bioTooLong"),
  coords: z
    .object({
      lat: z.number().min(-90).max(90),
      lng: z.number().min(-180).max(180),
    })
    .nullish(),
  avatarType: z.enum(["photo", "preset"]).optional(),
  avatarPresetId: z.string().max(48).optional(),
})
export type ProfileEditFormSchema = z.infer<typeof profileEditFormSchema>
