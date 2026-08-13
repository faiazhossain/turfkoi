import NextAuth from "next-auth"
import Credentials from "next-auth/providers/credentials"

import { authConfig } from "@/auth.config"
import { normalizePhone } from "@/features/auth/phone"
import { authorizeSignIn } from "@/features/auth/otp-service"
import { getUserRoles } from "@/features/auth/users"

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  providers: [
    Credentials({
      id: "phone-otp",
      credentials: {
        phone: { label: "Phone", type: "text" },
        code: { label: "Code", type: "text" },
      },
      authorize: async (raw) => {
        const phone = normalizePhone(String(raw?.phone ?? ""))
        const code = String(raw?.code ?? "").trim()
        const user = await authorizeSignIn(phone, code)
        if (!user) return null
        return { id: user.id, phone: user.phone, name: user.name }
      },
    }),
  ],
  callbacks: {
    ...authConfig.callbacks,
    // jwt() runs on sign-in (Node runtime) - loads roles into the token.
    jwt: async ({ token, user }) => {
      if (user) {
        const u = user as { id: string; phone?: string | null }
        token.id = u.id
        token.phone = u.phone ?? null
        token.roles = await getUserRoles(u.id)
      }
      return token
    },
  },
})

if (process.env.NODE_ENV === "production" && !process.env.AUTH_SECRET) {
  console.error("[auth] FATAL: AUTH_SECRET is not set in production.")
}
