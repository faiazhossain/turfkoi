import "server-only"

import { and, eq, isNull } from "drizzle-orm"

import { db } from "@/db"
import { turfClaimInvites } from "@/db/schema"

/** The (at most one) unclaimed, unrevoked invite for a turf, if any. */
export async function getActiveInviteForTurf(turfId: string) {
  const rows = await db
    .select({
      id: turfClaimInvites.id,
      targetEmail: turfClaimInvites.targetEmail,
      expiresAt: turfClaimInvites.expiresAt,
      createdAt: turfClaimInvites.createdAt,
    })
    .from(turfClaimInvites)
    .where(
      and(
        eq(turfClaimInvites.turfId, turfId),
        isNull(turfClaimInvites.claimedAt),
        isNull(turfClaimInvites.revokedAt)
      )
    )
    .limit(1)
  return rows[0] ?? null
}
