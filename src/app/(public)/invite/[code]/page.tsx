import { redirect } from "next/navigation"
import { cookies } from "next/headers"
import { notFound } from "next/navigation"

import { isValidReferralCode } from "@/features/auth/referrals"

const REF_COOKIE = "turfkoi_ref"
const REF_TTL_SECONDS = 60 * 60 * 24 * 30 // 30 days

/**
 * A3 — referral landing. `/invite/ABC123` stamps an httpOnly cookie and bounces
 * to /login. The verify-OTP action reads the cookie and attributes the new
 * signup to the referrer on first sign-in.
 */
export default async function InviteLandingPage({
  params,
}: {
  params: Promise<{ code: string }>
}) {
  const { code } = await params
  const valid = await isValidReferralCode(code).catch(() => false)
  if (!valid) notFound()

  const store = await cookies()
  store.set(REF_COOKIE, code, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: REF_TTL_SECONDS,
  })

  redirect("/login")
}
