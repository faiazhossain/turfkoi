import NextAuth from "next-auth"

import { authConfig } from "@/auth.config"

// Edge-safe: uses only authConfig (no DB / node:crypto), so the middleware
// bundle stays small and runtime-compatible.
const { auth } = NextAuth(authConfig)

export default auth

export const config = {
  matcher: [
    "/login",
    "/auth/:path*",
    "/app/:path*",
    "/team/:path*",
    "/turf-owner/:path*",
    "/admin/:path*",
  ],
}
