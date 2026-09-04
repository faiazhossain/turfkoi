import type { ReactNode } from "react"
import { redirect } from "next/navigation"

import { getSession } from "@/lib/auth"

/**
 * Route guard for the one protected area without a server-side check. The
 * proxy's custom callback bypasses the `authorized` callback entirely (it
 * returns undefined and continues), so unauthenticated visitors would render
 * this client-only page — every other protected area guards in its page or
 * layout via getCurrentUser/getSession + redirect("/login").
 */
export default async function OnboardingLayout({
  children,
}: {
  children: ReactNode
}) {
  const session = await getSession()
  if (!session?.user) redirect("/login")
  return children
}
