import { Suspense } from "react"
import Image from "next/image"
import Link from "next/link"
import { LayoutDashboardIcon, SettingsIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { SignOutButton } from "@/components/auth/sign-out-button"
import { NotificationBell } from "@/features/notifications/components/notification-bell"
import { getCurrentUser, getSession } from "@/lib/auth"
import { getT } from "@/i18n/server"
import { LocaleToggle } from "@/i18n/toggle"
import { MainNav } from "./main-nav"
import { LinkPendingIndicator } from "./link-pending-indicator"

/** Account settings entry point — a gear beside the session actions, the
 * standard "always reachable" pattern (icon-only below sm like Dashboard). */
function SettingsShortcut({ t }: { t: Awaited<ReturnType<typeof getT>> }) {
  return (
    <Button
      variant="ghost"
      size="sm"
      aria-label={t("nav.settings")}
      className="px-2 sm:px-2.5"
      render={<Link href="/app/settings" />}
    >
      <SettingsIcon />
      <span className="hidden sm:inline">{t("nav.settings")}</span>
    </Button>
  )
}

/**
 * Session-aware right-side header actions. Kept in its own Suspense boundary
 * so the root layout stays a static shell — awaiting session data directly in
 * the layout would block navigation and suppress `loading.tsx` fallbacks.
 */async function SessionActions() {
  const t = await getT()
  const session = await getSession()

  if (!session?.user) {
    return (
      <Button variant="ghost" size="sm" render={<Link href="/login" />}>
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
        {/* Icon-only below sm so the header fits narrow viewports. */}
        <Button
          variant="ghost"
          size="sm"
          aria-label={t("nav.adminConsole")}
          className="px-2 sm:px-2.5"
          render={<Link href="/admin" />}
        >
          <LayoutDashboardIcon />
          <span className="hidden sm:inline">{t("nav.adminConsole")}</span>
        </Button>
        <SettingsShortcut t={t} />
        <SignOutButton />
      </>
    )
  }

  // Turf owners land on their owner dashboard, not the player dashboard.
  const ownerHref = user?.roles.includes("turf_owner") ? "/turf-owner" : "/app"

  return (
    <>
      <NotificationBell />
      <Button
        variant="ghost"
        size="sm"
        aria-label={t("nav.dashboard")}
        className="px-2 sm:px-2.5"
        render={<Link href={ownerHref} />}
      >
        <LayoutDashboardIcon />
        <span className="hidden sm:inline">{t("nav.dashboard")}</span>
      </Button>
      <SettingsShortcut t={t} />
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
    <header className="sticky top-0 z-40 border-b border-dt-line bg-dt-bg/80 backdrop-blur supports-backdrop-filter:bg-dt-bg/60">
      <div className="mx-auto flex h-14 max-w-6xl items-center gap-1.5 px-3 sm:gap-2 sm:px-4">
        <Link href="/" aria-label="DeshiTurf" className="flex shrink-0 items-center">
          <Image
            src="/brand-logo-white.png"
            alt="DeshiTurf — Book • Play • Connect"
            width={2172}
            height={724}
            quality={85}
            priority
            className="h-7 w-auto object-contain sm:h-9"
          />
        </Link>
        <MainNav variant="desktop" />
        <div className="ml-auto flex items-center gap-2">
          <LocaleToggle />
          <Suspense fallback={<Skeleton className="h-7 w-24 rounded-md" aria-hidden />}>
            <SessionActions />
          </Suspense>
          {/* Redundant on mobile — the bottom nav's Turfs item covers /turfs. */}
          <Button size="sm" className="hidden sm:inline-flex" render={<Link href="/turfs" />}>
            {t("nav.bookTurf")}
            <LinkPendingIndicator />
          </Button>
        </div>
      </div>
    </header>
  )
}
