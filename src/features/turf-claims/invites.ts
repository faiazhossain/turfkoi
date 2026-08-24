import "server-only"

import { createHash, randomBytes } from "node:crypto"
import { and, eq, isNull } from "drizzle-orm"

import { db } from "@/db"
import { turfClaimInvites, turfs } from "@/db/schema"

/** 14 days — enough for a low-tech owner to get around to the link. */
export const CLAIM_INVITE_TTL_DAYS = 14

/** Cookie that carries a pending claim token across login/register. */
export const CLAIM_COOKIE = "turfkoi_claim"

export type ClaimTokenResolution =
  | { ok: true; inviteId: string; turfId: string; expiresAt: Date }
  | {
      ok: false
      reason: "invalid" | "expired" | "claimed" | "revoked" | "turf_claimed"
    }

function mintToken(): string {
  // A claim grants ownership — unlike referral codes, this needs real
  // entropy: 32 bytes, base64url (43 chars).
  return randomBytes(32).toString("base64url")
}

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex")
}

export function claimPath(token: string): string {
  return `/claim/${token}`
}

/**
 * Create (or replace) the invite for an unclaimed turf. Any previous active
 * invite is revoked first so old links die immediately; rows are kept for
 * audit. The plaintext token is returned once — only its hash is stored.
 */
export async function createClaimInvite(
  adminId: string,
  turfId: string,
  targetEmail?: string
): Promise<{ token: string; expiresAt: Date }> {
  await db
    .update(turfClaimInvites)
    .set({ revokedAt: new Date() })
    .where(
      and(
        eq(turfClaimInvites.turfId, turfId),
        isNull(turfClaimInvites.claimedAt),
        isNull(turfClaimInvites.revokedAt)
      )
    )

  const token = mintToken()
  const expiresAt = new Date(Date.now() + CLAIM_INVITE_TTL_DAYS * 24 * 60 * 60_000)
  await db.insert(turfClaimInvites).values({
    turfId,
    tokenHash: hashToken(token),
    targetEmail: targetEmail ?? null,
    invitedBy: adminId,
    expiresAt,
  })
  return { token, expiresAt }
}

/**
 * Resolve a claim token to its invite, checking every terminal state.
 * `turf_claimed` covers the case where the turf got an owner through some
 * other path while a fresh invite was still outstanding.
 */
export async function resolveClaimToken(
  token: string
): Promise<ClaimTokenResolution> {
  if (!token || token.length < 20 || token.length > 100) {
    return { ok: false, reason: "invalid" }
  }

  const rows = await db
    .select({
      id: turfClaimInvites.id,
      turfId: turfClaimInvites.turfId,
      expiresAt: turfClaimInvites.expiresAt,
      claimedAt: turfClaimInvites.claimedAt,
      revokedAt: turfClaimInvites.revokedAt,
      turfOwnerId: turfs.ownerId,
    })
    .from(turfClaimInvites)
    .innerJoin(turfs, eq(turfs.id, turfClaimInvites.turfId))
    .where(eq(turfClaimInvites.tokenHash, hashToken(token)))
    .limit(1)

  const invite = rows[0]
  if (!invite) return { ok: false, reason: "invalid" }
  if (invite.claimedAt) return { ok: false, reason: "claimed" }
  if (invite.revokedAt) return { ok: false, reason: "revoked" }
  if (invite.expiresAt < new Date()) return { ok: false, reason: "expired" }
  if (invite.turfOwnerId !== null) return { ok: false, reason: "turf_claimed" }

  return {
    ok: true,
    inviteId: invite.id,
    turfId: invite.turfId,
    expiresAt: invite.expiresAt,
  }
}
