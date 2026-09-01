import { NextResponse } from "next/server"
import NextAuth from "next-auth"

import { authConfig } from "@/auth.config"
import {
  CLAIM_COOKIE,
  CLAIM_INVITE_TTL_DAYS,
} from "@/features/turf-claims/constants"
import { MATCH_LINK_COOKIE, MATCH_LINK_TTL_SECONDS } from "@/features/matches/constants"

// Edge-safe: uses only authConfig (no DB / node:crypto), so the proxy
// bundle stays small and runtime-compatible.
const { auth } = NextAuth(authConfig)

// /claim/<token> visited while signed out: park the token in an httpOnly
// cookie so login/register can route straight back to the claim page after
// auth (see homeForUser). Pages can't set cookies in Next 16 — only Server
// Actions, Route Handlers, and the proxy — so this lives here.
const CLAIM_PATH = /^\/claim\/([A-Za-z0-9_-]{20,100})$/

// Same pattern for match invite links: a signed-out visitor opening
// /m/<token> or /matches/<id> gets the path parked so post-auth routing
// (homeForUser / onboarding) sends them back to the match.
const MATCH_LINK_PREFIXES = ["/matches/", "/m/"]

export default auth((req) => {
  const pathname = req.nextUrl.pathname
  const claimMatch = CLAIM_PATH.exec(pathname)
  if (claimMatch && !req.auth) {
    const res = NextResponse.next()
    res.cookies.set(CLAIM_COOKIE, claimMatch[1], {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: CLAIM_INVITE_TTL_DAYS * 24 * 60 * 60,
    })
    return res
  }
  if (
    !req.auth &&
    MATCH_LINK_PREFIXES.some((p) => pathname.startsWith(p))
  ) {
    const res = NextResponse.next()
    res.cookies.set(MATCH_LINK_COOKIE, pathname, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: MATCH_LINK_TTL_SECONDS,
    })
    return res
  }
})

export const config = {
  matcher: [
    "/login",
    "/register",
    "/forgot-password",
    "/auth/:path*",
    "/app/:path*",
    "/team/:path*",
    "/turf-owner/:path*",
    "/admin/:path*",
    "/claim/:path*",
    "/matches/:path*",
    "/m/:path*",
  ],
}
