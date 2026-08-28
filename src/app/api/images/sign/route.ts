import { NextResponse } from "next/server"
import { eq } from "drizzle-orm"
import { z } from "zod"

import { db } from "@/db"
import { turfPhotos } from "@/db/schema"

import { imageActor, assertImageRights } from "@/features/images/auth"
import { signUpload, MAX_UPLOAD_BYTES, IMAGE_CONTEXTS } from "@/features/images/service"
import { MAX_TURF_PHOTOS } from "@/features/images/constants"
import type { ImageContextKind } from "@/features/images/service"

const bodySchema = z.object({
  context: z.enum(["turf", "team", "player", "receipt"]),
  resourceId: z.string().uuid(),
})

/**
 * Step 1 of the signed direct-upload flow: authorize, then mint a
 * single-asset upload grant (server-generated public id + signature).
 * The client uploads straight to Cloudinary with these params.
 */
export async function POST(req: Request) {
  const user = await imageActor()
  const parsed = bodySchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ error: "images.errors.invalidBody" }, { status: 400 })
  }
  const { context, resourceId } = parsed.data

  const rights = await assertImageRights(user, context, resourceId)
  if (!rights.ok) {
    return NextResponse.json({ error: rights.error }, { status: 403 })
  }

  // Fail fast when the turf gallery is already full — no point uploading.
  if (context === "turf") {
    const rows = await db
      .select({ id: turfPhotos.id })
      .from(turfPhotos)
      .where(eq(turfPhotos.turfId, resourceId))
    if (rows.length >= MAX_TURF_PHOTOS) {
      return NextResponse.json(
        { error: "images.errors.maxPhotos" },
        { status: 400 }
      )
    }
  }

  try {
    const signed = signUpload(context as ImageContextKind, resourceId)
    return NextResponse.json({
      ...signed,
      maxOriginalBytes: MAX_UPLOAD_BYTES,
      maxDim: IMAGE_CONTEXTS[context as ImageContextKind].maxDim,
    })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "images.errors.setupFailed" },
      { status: 400 }
    )
  }
}
