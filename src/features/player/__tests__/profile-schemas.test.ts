import { describe, expect, it } from "vitest"

import { updateProfileSchema } from "../schemas"

function issuesOf(payload: unknown): string[] {
  const result = updateProfileSchema.safeParse(payload)
  expect(result.success).toBe(false)
  return (result as { error: { issues: { message: string }[] } }).error.issues.map(
    (i) => i.message
  )
}

describe("updateProfileSchema", () => {
  it("accepts a full canonical payload", () => {
    const result = updateProfileSchema.safeParse({
      name: "Rakib Hasan",
      position: "midfielder",
      secondaryPosition: "defender",
      skill: "good",
      bio: "ডিফেন্সে খেলতে বেশি পছন্দ করি।",
      area: "Mirpur",
      coords: { lat: 23.8, lng: 90.4 },
      avatarType: "preset",
      avatarPresetId: "ball-gold",
    })
    expect(result.success).toBe(true)
  })

  it("leaves omitted fields untouched (undefined in, undefined out)", () => {
    const result = updateProfileSchema.parse({})
    expect(result).toEqual({})
  })

  it("maps empty-string form values to the clear/leave contract", () => {
    const result = updateProfileSchema.parse({
      position: "",
      secondaryPosition: "",
      bio: "",
      area: "",
    })
    // Primary/skill: untouched pickers submit "" -> undefined (leave).
    expect(result.position).toBeUndefined()
    // Secondary: "" is the explicit "none" chip -> null (clear).
    expect(result.secondaryPosition).toBeNull()
    // Bio/area: present-but-empty -> null (clear).
    expect(result.bio).toBeNull()
    expect(result.area).toBeNull()
  })

  it("rejects non-canonical position/skill writes", () => {
    expect(issuesOf({ position: "MID" })).toContain(
      "profile.errors.invalidPosition"
    )
    expect(issuesOf({ skill: "world class" })).toContain(
      "profile.errors.invalidSkill"
    )
    expect(issuesOf({ secondaryPosition: "../../evil" })).toContain(
      "profile.errors.invalidPosition"
    )
  })

  it("enforces the name rules with shared auth error keys", () => {
    expect(issuesOf({ name: "A" })).toContain("auth.errors.name_short")
    expect(issuesOf({ name: "x".repeat(61) })).toContain("auth.errors.name_max")
  })

  it("caps bio length and normalizes whitespace", () => {
    expect(issuesOf({ bio: "ক".repeat(281) })).toContain(
      "profile.errors.bioTooLong"
    )
    const result = updateProfileSchema.parse({ bio: "  ভালো   খেলি  " })
    expect(result.bio).toBe("ভালো খেলি")
  })

  it("rejects preset ids outside the catalog whitelist, including crafted paths", () => {
    for (const bad of ["../../evil", "ball-gold.svg", "", "ball-gold?x=1", "nope"]) {
      expect(
        issuesOf({ avatarType: "preset", avatarPresetId: bad })
      ).toContain("profile.errors.invalidAvatar")
    }
    // A preset id cannot ride along with a photo mode switch.
    expect(
      issuesOf({ avatarType: "photo", avatarPresetId: "ball-gold" })
    ).toContain("profile.errors.invalidAvatar")
    // Unknown avatarType values are rejected outright.
    expect(issuesOf({ avatarType: "uploads/evil.svg" })).toContain(
      "profile.errors.invalidAvatar"
    )
  })

  it("accepts whitelisted preset ids", () => {
    const result = updateProfileSchema.parse({
      avatarType: "preset",
      avatarPresetId: "number-10",
    })
    expect(result.avatarType).toBe("preset")
    expect(result.avatarPresetId).toBe("number-10")
  })
})
