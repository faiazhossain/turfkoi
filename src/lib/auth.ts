import { cache } from "react"

import type { Role } from "@/lib/capabilities"
import { auth } from "@/auth"
import { getUserRoles } from "@/features/auth/users"

export interface AuthSession {
  user: { id: string; phone?: string | null; name?: string | null }
}

export async function getSession(): Promise<AuthSession | null> {
  const session = await auth()
  if (!session?.user?.id) return null
  return {
    user: {
      id: session.user.id,
      phone: session.user.phone,
      name: session.user.name ?? null,
    },
  }
}

/**
 * Authoritative current user with fresh roles. Roles are re-read from the DB
 * (the JWT copy can go stale mid-session, e.g. after creating a team). Cached
 * per request via React `cache()`.
 */
export const getCurrentUser = cache(async (): Promise<{
  id: string
  roles: Role[]
} | null> => {
  const session = await auth()
  if (!session?.user?.id) return null
  const roles = await getUserRoles(session.user.id)
  return { id: session.user.id, roles }
})
