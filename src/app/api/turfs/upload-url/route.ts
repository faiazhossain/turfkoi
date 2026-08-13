import { NextResponse } from "next/server"
import { z } from "zod"

import { getCurrentUser } from "@/lib/auth"
import { can } from "@/lib/capabilities"
import { db } from "@/db"
import { turfs } from "@/db/schema"
import { eq } from "drizzle-orm"
import { createTurfPhotoUpload } from "@/features/turfs/storage"

const bodySchema = z.object({
  turfId: z.string().uuid(),
  filename: z.string().min(1).max(120),
  contentType: z.string().min(1),
})

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
  const { turfId } = parsed.data
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

  try {
    const upload = await createTurfPhotoUpload(parsed.data)
    return NextResponse.json(upload)
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Upload setup failed" },
      { status: 400 }
    )
  }
}
