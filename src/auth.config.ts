import type { DefaultSession, NextAuthConfig } from "next-auth"

import type { Role } from "@/lib/capabilities"

// Edge-safe session augmentation (no DB imports here - this file is bundled
// into the middleware).
declare module "next-auth" {
  interface Session {
    user: {
      id: string
      phone?: string | null
      roles: Role[]
    } & DefaultSession["user"]
  }
}

declare module "@auth/core/jwt" {
  interface JWT {
    id?: string
    phone?: string | null
    roles?: Role[]
  }
}

const PROTECTED_PREFIXES = [
  "/app",
  "/team",
  "/turf-owner",
  "/admin",
  "/auth/onboarding",
]

/**
 * Edge-safe config shared by middleware and the full Auth.js config.
 * The Credentials provider (which needs the DB) is added in src/auth.ts.
 */
export const authConfig = {
  secret:
    process.env.AUTH_SECRET ?? "dev-insecure-secret-set-AUTH_SECRET-in-prod",
  trustHost: true,
  session: { strategy: "jwt" },
  pages: { signIn: "/login" },
  providers: [], // added in src/auth.ts (Node runtime)
  callbacks: {
    authorized: ({ auth, request }) => {
      const loggedIn = !!auth?.user
      const path = request.nextUrl.pathname
      const isProtected = PROTECTED_PREFIXES.some(
        (p) => path === p || path.startsWith(p + "/")
      )
      const isAuthRoute = path === "/login" || path.startsWith("/auth/")
      if (isProtected && !loggedIn) return false // -> redirects to /login
      if (isAuthRoute && loggedIn && path !== "/auth/onboarding") {
        return Response.redirect(new URL("/app", request.nextUrl))
      }
      return true
    },
    // session() reads from the token only (edge-safe). Roles are loaded into the
    // JWT at sign-in via jwt() in src/auth.ts.
    session: ({ session, token }) => {
      if (token?.id) {
        session.user.id = token.id
        session.user.phone = token.phone ?? null
        session.user.roles = token.roles ?? []
      }
      return session
    },
  },
} satisfies NextAuthConfig
