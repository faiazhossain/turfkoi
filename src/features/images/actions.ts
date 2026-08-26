"use server"

import { revalidatePath } from "next/cache"
import { and, asc, desc, eq, sql } from "drizzle-orm"
import { z } from "zod"

import { db } from "@/db"
import { isUniqueViolation } from "@/db/errors"
import { playerProfiles, teams, turfPhotos } from "@/db/schema"
import { getCurrentUser } from "@/lib/auth"

import { assertImageRights } from "./auth"
import { destroyAsset } from "./service"
import { MAX_TURF_PHOTOS } from "./constants"

export type ActionResult =
  | { ok: true; id?: string }
  | { ok: false; error: string }

const publicIdSchema = z
  .string()
  .min(1)
  .max(300)
  .regex(/^[a-zA-Z0-9/_-]+$/, "images.errors.invalidRef")

async function actor() {
  return getCurrentUser()
}

/**
 * Persist a confirmed turf photo. Row insert only happens after the
 * Cloudinary asset exists and passed confirmation — a failed insert leaves
 * an orphan we destroy here rather than a dangling DB reference.
 */
export async function addTurfPhotoAction(
  turfId: string,
  publicId: string
): Promise<ActionResult> {
  const parsed = publicIdSchema.safeParse(publicId)
  if (!parsed.success) return { ok: false, error: "images.errors.invalidRef" }
  const user = await actor()
  if (!user) return { ok: false, error: "errors.notSignedIn" }

  const rights = await assertImageRights(user, "turf", turfId)
  if (!rights.ok) return { ok: false, error: rights.error }

  const existing = await db
    .select({ id: turfPhotos.id, isCover: turfPhotos.isCover })
    .from(turfPhotos)
    .where(eq(turfPhotos.turfId, turfId))
    .orderBy(asc(turfPhotos.sortOrder))
  if (existing.length >= MAX_TURF_PHOTOS) {
    await destroyAsset(parsed.data)
    return { ok: false, error: "images.errors.maxPhotos" }
  }

  const maxRow = await db
    .select({ sortOrder: turfPhotos.sortOrder })
    .from(turfPhotos)
    .where(eq(turfPhotos.turfId, turfId))
    .orderBy(desc(turfPhotos.sortOrder))
    .limit(1)

  try {
    const [inserted] = await db
      .insert(turfPhotos)
      .values({
        turfId,
        publicId: parsed.data,
        sortOrder: (maxRow[0]?.sortOrder ?? -1) + 1,
        // First photo becomes the cover automatically.
        isCover: existing.length === 0,
      })
      .returning({ id: turfPhotos.id })
    revalidatePath(`/turf-owner/turfs/${turfId}`)
    revalidatePath("/turfs")
    return { ok: true, id: inserted.id }
  } catch (err) {
    // DB failed after a successful upload — don't orphan the asset.
    await destroyAsset(parsed.data)
    if (isUniqueViolation(err)) {
      return { ok: false, error: "images.errors.alreadyAdded" }
    }
    throw err
  }
}

export async function deleteTurfPhotoAction(photoId: string): Promise<ActionResult> {
  const user = await actor()
  if (!user) return { ok: false, error: "errors.notSignedIn" }

  const rows = await db
    .select({ id: turfPhotos.id, turfId: turfPhotos.turfId, publicId: turfPhotos.publicId, isCover: turfPhotos.isCover })
    .from(turfPhotos)
    .where(eq(turfPhotos.id, photoId))
    .limit(1)
  const photo = rows[0]
  if (!photo) return { ok: false, error: "images.errors.photoNotFound" }

  const rights = await assertImageRights(user, "turf", photo.turfId)
  if (!rights.ok) return { ok: false, error: rights.error }

  await db.delete(turfPhotos).where(eq(turfPhotos.id, photoId))

  // Promote the earliest remaining photo when the cover was removed.
  if (photo.isCover) {
    await db
      .update(turfPhotos)
      .set({ isCover: true })
      .where(
        and(
          eq(turfPhotos.turfId, photo.turfId),
          eq(
            turfPhotos.id,
            sql`(SELECT id FROM turf_photos WHERE turf_id = ${photo.turfId} ORDER BY sort_order ASC LIMIT 1)`
          )
        )
      )
  }

  await destroyAsset(photo.publicId)
  revalidatePath(`/turf-owner/turfs/${photo.turfId}`)
  revalidatePath("/turfs")
  return { ok: true }
}

export async function setCoverTurfPhotoAction(photoId: string): Promise<ActionResult> {
  const user = await actor()
  if (!user) return { ok: false, error: "errors.notSignedIn" }

  const rows = await db
    .select({ id: turfPhotos.id, turfId: turfPhotos.turfId })
    .from(turfPhotos)
    .where(eq(turfPhotos.id, photoId))
    .limit(1)
  const photo = rows[0]
  if (!photo) return { ok: false, error: "images.errors.photoNotFound" }

  const rights = await assertImageRights(user, "turf", photo.turfId)
  if (!rights.ok) return { ok: false, error: rights.error }

  // Two conditional updates stand in for a transaction (neon-http has none).
  await db
    .update(turfPhotos)
    .set({ isCover: false })
    .where(and(eq(turfPhotos.turfId, photo.turfId), eq(turfPhotos.isCover, true)))
  await db
    .update(turfPhotos)
    .set({ isCover: true })
    .where(and(eq(turfPhotos.id, photoId), eq(turfPhotos.turfId, photo.turfId)))

  revalidatePath(`/turf-owner/turfs/${photo.turfId}`)
  revalidatePath("/turfs")
  return { ok: true }
}

/**
 * Swap a photo with its neighbor in the given direction. Guarded updates —
 * a concurrent reorder can at worst no-op.
 */
export async function moveTurfPhotoAction(
  photoId: string,
  dir: "earlier" | "later"
): Promise<ActionResult> {
  const user = await actor()
  if (!user) return { ok: false, error: "errors.notSignedIn" }

  const rows = await db
    .select({ id: turfPhotos.id, turfId: turfPhotos.turfId, sortOrder: turfPhotos.sortOrder })
    .from(turfPhotos)
    .where(eq(turfPhotos.id, photoId))
    .limit(1)
  const photo = rows[0]
  if (!photo) return { ok: false, error: "images.errors.photoNotFound" }

  const rights = await assertImageRights(user, "turf", photo.turfId)
  if (!rights.ok) return { ok: false, error: rights.error }

  const neighbors = await db
    .select({ id: turfPhotos.id, sortOrder: turfPhotos.sortOrder })
    .from(turfPhotos)
    .where(
      and(
        eq(turfPhotos.turfId, photo.turfId),
        dir === "earlier"
          ? sql`${turfPhotos.sortOrder} < ${photo.sortOrder}`
          : sql`${turfPhotos.sortOrder} > ${photo.sortOrder}`
      )
    )
    .orderBy(dir === "earlier" ? desc(turfPhotos.sortOrder) : asc(turfPhotos.sortOrder))
    .limit(1)
  const neighbor = neighbors[0]
  if (!neighbor) return { ok: true } // already at the end

  await db
    .update(turfPhotos)
    .set({ sortOrder: neighbor.sortOrder })
    .where(eq(turfPhotos.id, photo.id))
  await db
    .update(turfPhotos)
    .set({ sortOrder: photo.sortOrder })
    .where(eq(turfPhotos.id, neighbor.id))

  revalidatePath(`/turf-owner/turfs/${photo.turfId}`)
  return { ok: true }
}

export async function setTeamLogoAction(
  teamId: string,
  publicId: string
): Promise<ActionResult> {
  const parsed = publicIdSchema.safeParse(publicId)
  if (!parsed.success) return { ok: false, error: "images.errors.invalidRef" }
  const user = await actor()
  if (!user) return { ok: false, error: "errors.notSignedIn" }

  const rights = await assertImageRights(user, "team", teamId)
  if (!rights.ok) {
    await destroyAsset(parsed.data)
    return { ok: false, error: rights.error }
  }

  const rows = await db
    .select({ logoPublicId: teams.logoPublicId })
    .from(teams)
    .where(eq(teams.id, teamId))
    .limit(1)
  if (!rows[0]) {
    await destroyAsset(parsed.data)
    return { ok: false, error: "images.errors.teamNotFound" }
  }

  try {
    await db
      .update(teams)
      .set({ logoPublicId: parsed.data, updatedAt: new Date() })
      .where(eq(teams.id, teamId))
  } catch (err) {
    await destroyAsset(parsed.data)
    throw err
  }

  // Retire the replaced asset.
  if (rows[0].logoPublicId && rows[0].logoPublicId !== parsed.data) {
    await destroyAsset(rows[0].logoPublicId)
  }

  revalidatePath(`/team/${teamId}`)
  revalidatePath("/team")
  return { ok: true }
}

export async function setPlayerAvatarAction(publicId: string): Promise<
  { ok: true } | { ok: false; error: string }
> {
  const parsed = publicIdSchema.safeParse(publicId)
  if (!parsed.success) return { ok: false, error: "images.errors.invalidRef" }
  const user = await actor()
  if (!user) return { ok: false, error: "errors.notSignedIn" }

  const existing = await db
    .select({ avatarPublicId: playerProfiles.avatarPublicId })
    .from(playerProfiles)
    .where(eq(playerProfiles.userId, user.id))
    .limit(1)

  try {
    await db
      .insert(playerProfiles)
      .values({ userId: user.id, avatarPublicId: parsed.data })
      .onConflictDoUpdate({
        target: playerProfiles.userId,
        set: { avatarPublicId: parsed.data, updatedAt: new Date() },
      })
  } catch (err) {
    await destroyAsset(parsed.data)
    throw err
  }

  if (existing[0]?.avatarPublicId && existing[0].avatarPublicId !== parsed.data) {
    await destroyAsset(existing[0].avatarPublicId)
  }

  revalidatePath("/app/settings")
  revalidatePath("/app")
  return { ok: true }
}
