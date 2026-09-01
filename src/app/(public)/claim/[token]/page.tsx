import { redirect } from "next/navigation"
import Link from "next/link"

import { getCurrentUser } from "@/lib/auth"
import { getT } from "@/i18n/server"
import { getTurfById } from "@/features/turfs/queries"
import { turfFormatLabel } from "@/features/turfs/formats"
import { Button } from "@/components/ui/button"

import {
  CLAIM_INVITE_TTL_DAYS,
  resolveClaimToken,
} from "@/features/turf-claims/invites"
import { ClaimTurfButton } from "@/components/turf-claims/claim-turf-button"
import { ClaimOtpFlow } from "@/components/turf-claims/claim-otp-flow"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"

const FAILURE_KEYS: Record<string, { titleKey: string; bodyKey: string }> = {
  invalid: { titleKey: "claim.invalidTitle", bodyKey: "claim.invalidBody" },
  expired: { titleKey: "claim.expiredTitle", bodyKey: "claim.expiredBody" },
  claimed: { titleKey: "claim.claimedTitle", bodyKey: "claim.claimedBody" },
  revoked: { titleKey: "claim.revokedTitle", bodyKey: "claim.revokedBody" },
  turf_claimed: { titleKey: "claim.claimedTitle", bodyKey: "claim.claimedBody" },
}

/**
 * Turf-owner claim landing. An admin seeds the turf and sends this link; the
 * holder signs in (or registers via email OTP) and claims ownership. Signed-out
 * visitors see the turf first with sign-in/register options; the proxy parks
 * the claim token in an httpOnly cookie so login/register route them straight
 * back here (see homeForUser).
 */
export default async function ClaimTurfPage({
  params,
}: {
  params: Promise<{ token: string }>
}) {
  const { token } = await params
  const [resolved, t] = await Promise.all([resolveClaimToken(token), getT()])

  if (!resolved.ok) {
    const copy = FAILURE_KEYS[resolved.reason]!
    return (
      <div className="mx-auto flex max-w-md flex-col gap-6 px-4 py-16">
        <Card>
          <CardHeader>
            <CardTitle className="font-heading text-2xl">
              {t(copy.titleKey, resolved.reason === "expired" ? { days: CLAIM_INVITE_TTL_DAYS } : undefined)}
            </CardTitle>
            <CardDescription>{t(copy.bodyKey, resolved.reason === "expired" ? { days: CLAIM_INVITE_TTL_DAYS } : undefined)}</CardDescription>
          </CardHeader>
        </Card>
      </div>
    )
  }

  const user = await getCurrentUser()

  // The pending-claim cookie is parked by the proxy on this request, so
  // login/register route straight back here (see homeForUser). But we don't
  // redirect signed-out owners to login — show them what they're claiming
  // first and let them pick sign-in or registration.
  const turf = await getTurfById(resolved.turfId)
  if (!turf) redirect("/login")

  const place = [turf.area, turf.city].filter(Boolean).join(", ")
  // +8801•••••1234 — enough for the owner to recognize their own number.
  const maskedPhone = resolved.targetPhone
    ? resolved.targetPhone.slice(0, 6) + "•••••" + resolved.targetPhone.slice(-4)
    : null

  return (
    <div className="mx-auto flex max-w-md flex-col gap-6 px-4 py-16">
      <Card>
        <CardHeader>
          <CardTitle className="font-heading text-2xl">
            {t("claim.claimTitle", { name: turf.name })}
          </CardTitle>
          <CardDescription>{t("claim.claimDesc")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <dl className="space-y-2 text-sm">
            <div className="flex justify-between gap-4">
              <dt className="text-dt-dim">{t("claim.format")}</dt>
              <dd>{turfFormatLabel(turf.format)}</dd>
            </div>
            {place ? (
              <div className="flex justify-between gap-4">
                <dt className="text-dt-dim">{t("claim.location")}</dt>
                <dd className="text-right">{place}</dd>
              </div>
            ) : null}
            {turf.address ? (
              <div className="flex justify-between gap-4">
                <dt className="text-dt-dim">{t("claim.address")}</dt>
                <dd className="text-right">{turf.address}</dd>
              </div>
            ) : null}
          </dl>
          {user ? (
            <ClaimTurfButton token={token} />
          ) : maskedPhone ? (
            <ClaimOtpFlow token={token} maskedPhone={maskedPhone} />
          ) : (
            <div className="space-y-3">
              <p className="text-sm text-dt-dim">{t("claim.signInNote")}</p>
              <div className="flex gap-2">
                <Button size="lg" render={<Link href="/login" />}>
                  {t("nav.signIn")}
                </Button>
                <Button size="lg" variant="outline" render={<Link href="/register" />}>
                  {t("auth.createAccount")}
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
