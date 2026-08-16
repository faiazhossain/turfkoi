import NextAuth from "next-auth"
import Credentials from "next-auth/providers/credentials"
import bcrypt from "bcryptjs"

import { authConfig } from "@/auth.config"
import { resolveIdentifier } from "@/features/auth/identifier"
import { getUserByIdentifier, getUserRoles } from "@/features/auth/users"

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
      }
      return token
    },
  },
})

if (process.env.NODE_ENV === "production" && !process.env.AUTH_SECRET) {
  console.error("[auth] FATAL: AUTH_SECRET is not set in production.")
}
