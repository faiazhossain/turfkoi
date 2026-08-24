import { NextResponse } from "next/server"
import NextAuth from "next-auth"

import { authConfig } from "@/auth.config"
import {
  CLAIM_COOKIE,
  CLAIM_INVITE_TTL_DAYS,
} from "@/features/turf-claims/constants"

// Edge-safe: uses only authConfig (no DB / node:crypto), so the proxy
// bundle stays small and runtime-compatible.
const { auth } = NextAuth(authConfig)

// /claim/<token> visited while signed out: park the token in an httpOnly
// cookie so login/register can route straight back to the claim page after
// auth (see homeForUser). Pages can't set cookies in Next 16 — only Server
// Actions, Route Handlers, and the proxy — so this lives here.
const CLAIM_PATH = /^\/claim\/([A-Za-z0-9_-]{20,100})$/

export default auth((req) => {
  const match = CLAIM_PATH.exec(req.nextUrl.pathname)
  if (match && !req.auth) {
    const res = NextResponse.next()
    res.cookies.set(CLAIM_COOKIE, match[1], {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: CLAIM_INVITE_TTL_DAYS * 24 * 60 * 60,
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
  ],
}
