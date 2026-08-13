import { NextResponse } from "next/server"
import { GetObjectCommand, S3Client } from "@aws-sdk/client-s3"
import { z } from "zod"

import { getCurrentUser } from "@/lib/auth"
import { can } from "@/lib/capabilities"
import { db } from "@/db"
import { turfs } from "@/db/schema"
import { eq } from "drizzle-orm"
import { logger } from "@/lib/logger"
import { detectImageMime, isAllowedImageMime } from "@/lib/file-validation"

const bodySchema = z.object({
  turfId: z.string().uuid(),
  key: z.string().min(1).max(200),
  contentType: z.string().min(1),
})

let _client: S3Client | undefined
function client(): S3Client {
  if (_client) return _client
  _client = new S3Client({
    region: process.env.STORAGE_REGION ?? "auto",
    endpoint: process.env.STORAGE_ENDPOINT,
    credentials: {
      accessKeyId: process.env.STORAGE_ACCESS_KEY ?? "",
      secretAccessKey: process.env.STORAGE_SECRET_KEY ?? "",
    },
  })
  return _client
}

/**
 * H5 magic-byte verification (Phase 8). The client PUTs to R2 via a presigned
 * URL, then calls this route. We fetch the first 32 bytes via a ranged GET,
 * sniff the actual signature, and either accept the photo or delete the object
 * + return 415. R2 honours the `range` parameter on GetObject.
 */
export async function POST(req: Request) {
  const user = await getCurrentUser()
  if (!user?.roles.includes("turf_owner")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  const parsed = bodySchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid body" },
      { status: 400 }
    )
  }
  const { turfId, key, contentType } = parsed.data

  const turf = await db
    .select({ ownerId: turfs.ownerId })
    .from(turfs)
    .where(eq(turfs.id, turfId))
    .limit(1)
  if (!turf[0]) {
    return NextResponse.json({ error: "Turf not found" }, { status: 404 })
  }
  if (!can(user, "turf.update", { ownerId: turf[0].ownerId })) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const bucket = process.env.STORAGE_BUCKET
  if (!bucket) {
    return NextResponse.json({ error: "Storage misconfigured" }, { status: 500 })
  }

  try {
    const got = await client().send(
      new GetObjectCommand({ Bucket: bucket, Key: key, Range: "bytes=0-31" })
    )
    const body = await got.Body?.transformToByteArray()
    if (!body) {
      return NextResponse.json({ error: "Empty upload" }, { status: 400 })
    }
    const detected = detectImageMime(body)
    if (!detected || !isAllowedImageMime(detected) || detected !== contentType) {
      // Mismatch — delete the offending object so it can't be served.
      logger.warn("upload.magic_byte_mismatch", {
        turfId,
        key,
        declared: contentType,
        detected,
      })
      // Best-effort delete; deferred so we always return the 415.
      void import("@aws-sdk/client-s3").then(({ DeleteObjectCommand }) =>
        client().send(new DeleteObjectCommand({ Bucket: bucket, Key: key }))
      )
      return NextResponse.json(
        { error: "File failed magic-byte validation.", detected },
        { status: 415 }
      )
    }
    return NextResponse.json({ ok: true, mime: detected })
  } catch (err) {
    logger.error("upload.verify_failed", { turfId, key, err: String(err) })
    return NextResponse.json(
      { error: "Verification failed" },
      { status: 500 }
    )
  }
}
