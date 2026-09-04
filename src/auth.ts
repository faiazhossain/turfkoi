import NextAuth from "next-auth"
import Credentials from "next-auth/providers/credentials"
import bcrypt from "bcryptjs"
import { eq } from "drizzle-orm"

import { db } from "@/db"
import { users } from "@/db/schema"
import { authConfig } from "@/auth.config"
import { resolveIdentifier } from "@/features/auth/identifier"
import { isTokenStale } from "@/features/auth/token-staleness"
import { getUserByIdentifier, getUserRoles } from "@/features/auth/users"

// AUTH_SECRET missing in production throws at import time in auth.config.ts
// (fail-fast) — the old boot-time warning is no longer reachable.

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  providers: [
    Credentials({
      id: "credentials",
      credentials: {
        identifier: { label: "Phone or email", type: "text" },
        password: { label: "Password", type: "password" },
      },
      authorize: async (raw) => {
        const identifier = resolveIdentifier(String(raw?.identifier ?? ""))
        const password = String(raw?.password ?? "")
        if (!identifier || !password) return null

        // Inactive (suspended / deleted) accounts must not sign in even with
        // a valid password.
        const user = await getUserByIdentifier(identifier)
        if (!user || user.status !== "active" || !user.passwordHash) return null

        const valid = await bcrypt.compare(password, user.passwordHash)
        if (!valid) return null
        return {
          id: user.id,
          phone: user.phone,
          email: user.email,
          name: user.name,
        }
      },
    }),
  ],
  callbacks: {
    ...authConfig.callbacks,
    // jwt() runs on sign-in (Node runtime) - loads roles into the token.
    jwt: async ({ token, user }) => {
      if (user) {
        const u = user as {
          id: string
          phone?: string | null
          email?: string | null
        }
        token.id = u.id
        token.phone = u.phone ?? null
        token.email = u.email ?? null
        token.roles = await getUserRoles(u.id)
        return token
      }
      // Session eviction (token versioning): a token issued before the
      // account's last password change is stripped of every claim, which
      // cascades to "unauthenticated" (session() skips a token without id,
      // getCurrentUser returns null, protected layouts redirect to /login).
      // Costs one PK lookup per authenticated request - the same profile as
      // the per-request getUserRoles read in getCurrentUser.
      if (token.id) {
        const [row] = await db
          .select({ pwd: users.passwordChangedAt })
          .from(users)
          .where(eq(users.id, token.id))
          .limit(1)
        if (isTokenStale(token.iat, row?.pwd ?? null)) {
          return {}
        }
      }
      return token
    },
  },
})
