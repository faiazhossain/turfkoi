import { NextResponse } from "next/server"
import { z } from "zod"

import { imageActor, assertImageRights } from "@/features/images/auth"
import {
  confirmAsset,
  destroyAsset,
  type ImageContextKind,
} from "@/features/images/service"

const bodySchema = z.object({
  context: z.enum(["turf", "team", "player"]),
  resourceId: z.string().uuid(),
  publicId: z.string().min(1).max(300),
})

/**
 * Step 2 of the upload flow: after Cloudinary stores the asset, the client
 * reports back. Rights are re-checked and the stored asset is verified via
 * the Admin API (folder/format/bytes). A rejected asset is destroyed so
 * nothing invalid lingers. DB persistence happens in server actions.
 */
export async function POST(req: Request) {
  const user = await imageActor()
  const parsed = bodySchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ error: "images.errors.invalidBody" }, { status: 400 })
  }
  const { context, resourceId, publicId } = parsed.data

  const rights = await assertImageRights(user, context, resourceId)
  if (!rights.ok) {
    return NextResponse.json({ error: rights.error }, { status: 403 })
  }

  const confirmed = await confirmAsset(
    context as ImageContextKind,
    resourceId,
    publicId
  )
  if (!confirmed.ok) {
    if (confirmed.reason !== "not_found") {
      // Something invalid WAS stored — remove it.
      await destroyAsset(publicId)
    }
    const messages = {
      not_found: "images.errors.uploadNotFound",
      bad_format: "images.errors.badFormat",
      too_large: "images.errors.tooLarge",
      bad_folder: "images.errors.badFolder",
    } as const
    return NextResponse.json(
      { error: messages[confirmed.reason] },
      { status: confirmed.reason === "bad_folder" ? 403 : 415 }
    )
  }

  return NextResponse.json({ ok: true })
}
