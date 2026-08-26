import { Suspense } from "react"
import Link from "next/link"

import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { SignOutButton } from "@/components/auth/sign-out-button"
import { NotificationBell } from "@/features/notifications/components/notification-bell"
import { getCurrentUser, getSession } from "@/lib/auth"
import { getT } from "@/i18n/server"
import { LocaleToggle } from "@/i18n/toggle"
import { MainNav } from "./main-nav"
import { LinkPendingIndicator } from "./link-pending-indicator"

/**
 * Session-aware right-side header actions. Kept in its own Suspense boundary
 * so the root layout stays a static shell — awaiting session data directly in
 * the layout would block navigation and suppress `loading.tsx` fallbacks.
 */
async function SessionActions() {
  const t = await getT()
  const session = await getSession()

  if (!session?.user) {
    return (
      <Button
        variant="ghost"
        size="sm"
        className="hidden sm:inline-flex"
        render={<Link href="/login" />}
      >
        {t("nav.signIn")}
      </Button>
    )
  }

  // Pure admins aren't players — route them at their console, not /app.
  const user = await getCurrentUser()
  if (user?.roles.includes("admin")) {
    return (
      <>
        <NotificationBell />
        <Button variant="ghost" size="sm" render={<Link href="/admin" />}>
          {t("nav.adminConsole")}
        </Button>
        <SignOutButton />
      </>
    )
  }

  return (
    <>
      <NotificationBell />
      <Button variant="ghost" size="sm" render={<Link href="/app" />}>
        {t("nav.dashboard")}
      </Button>
      <SignOutButton />
    </>
  )
}

/**
 * Session-aware top nav (DESIGN_REFERENCE.md §2 row 1, Requirements §7/44).
 * Signed-out users see Sign in; players and owners see Dashboard + Sign out;
 * admins see Admin console + Sign out (their home is /admin, not the player
 * dashboard). Includes the BN | EN language toggle.
 */
export async function SiteHeader() {
  const t = await getT()
  return (
    <header className="sticky top-0 z-40 border-b border-border bg-background/80 backdrop-blur supports-backdrop-filter:bg-background/60">
      <div className="mx-auto flex h-14 max-w-6xl items-center gap-2 px-4">
        <Link
          href="/"
          className="flex items-center gap-2 font-heading text-lg font-semibold tracking-tight"
        >
          <span className="inline-block size-2.5 rounded-full bg-primary" aria-hidden />
          DeshiTurf
        </Link>
        <MainNav variant="desktop" />
        <div className="ml-auto flex items-center gap-2">
          <LocaleToggle />
          <Suspense fallback={<Skeleton className="h-7 w-24 rounded-md" aria-hidden />}>
            <SessionActions />
          </Suspense>
          <Button size="sm" render={<Link href="/turfs" />}>
            {t("nav.bookTurf")}
            <LinkPendingIndicator />
          </Button>
        </div>
      </div>
    </header>
  )
}
