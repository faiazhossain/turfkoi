import { redirect } from "next/navigation"
import { cookies } from "next/headers"

import { getCurrentUser } from "@/lib/auth"
import { getTurfById } from "@/features/turfs/queries"

import {
  CLAIM_COOKIE,
  CLAIM_INVITE_TTL_DAYS,
  resolveClaimToken,
} from "@/features/turf-claims/invites"
import { ClaimTurfButton } from "@/components/turf-claims/claim-turf-button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"

const FAILURE_COPY: Record<string, { title: string; body: string }> = {
  invalid: {
    title: "This claim link isn't valid",
    body: "Check that you opened the full link, or ask the Turfkoi team for a new one.",
  },
  expired: {
    title: "This claim link has expired",
    body: `Claim links stay valid for ${CLAIM_INVITE_TTL_DAYS} days. Ask the Turfkoi team to send a fresh one.`,
  },
  claimed: {
    title: "This turf has already been claimed",
    body: "If that wasn't you, contact the Turfkoi team.",
  },
  revoked: {
    title: "This claim link was replaced",
    body: "A newer invite was sent for this turf — use the most recent link.",
  },
  turf_claimed: {
    title: "This turf has already been claimed",
    body: "If that wasn't you, contact the Turfkoi team.",
  },
}

/**
 * Turf-owner claim landing. An admin seeds the turf and sends this link; the
 * holder signs in (or registers via email OTP) and claims ownership. Signed-out
 * visitors get the claim token parked in an httpOnly cookie so login/register
 * can route them straight back here (see homeForUser).
 */
export default async function ClaimTurfPage({
  params,
}: {
  params: Promise<{ token: string }>
}) {
  const { token } = await params
  const resolved = await resolveClaimToken(token)

  if (!resolved.ok) {
    const copy = FAILURE_COPY[resolved.reason]!
    return (
      <div className="mx-auto flex max-w-md flex-col gap-6 px-4 py-16">
        <Card>
          <CardHeader>
            <CardTitle className="font-heading text-2xl">{copy.title}</CardTitle>
            <CardDescription>{copy.body}</CardDescription>
          </CardHeader>
        </Card>
      </div>
    )
  }

  const user = await getCurrentUser()
  if (!user) {
    const store = await cookies()
    store.set(CLAIM_COOKIE, token, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: CLAIM_INVITE_TTL_DAYS * 24 * 60 * 60,
    })
    redirect("/login")
  }

  const turf = await getTurfById(resolved.turfId)
  if (!turf) redirect("/login")

  const place = [turf.area, turf.city].filter(Boolean).join(", ")

  return (
    <div className="mx-auto flex max-w-md flex-col gap-6 px-4 py-16">
      <Card>
        <CardHeader>
          <CardTitle className="font-heading text-2xl">
            Claim &ldquo;{turf.name}&rdquo;
          </CardTitle>
          <CardDescription>
            You&apos;ve been invited to manage this turf on Turfkoi.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <dl className="space-y-2 text-sm">
            <div className="flex justify-between gap-4">
              <dt className="text-muted-foreground">Format</dt>
              <dd>{turf.format === "fives" ? "5-a-side" : "7-a-side"}</dd>
            </div>
            {place ? (
              <div className="flex justify-between gap-4">
                <dt className="text-muted-foreground">Location</dt>
                <dd className="text-right">{place}</dd>
              </div>
            ) : null}
            {turf.address ? (
              <div className="flex justify-between gap-4">
                <dt className="text-muted-foreground">Address</dt>
                <dd className="text-right">{turf.address}</dd>
              </div>
            ) : null}
          </dl>
          <ClaimTurfButton token={token} />
        </CardContent>
      </Card>
    </div>
  )
}
