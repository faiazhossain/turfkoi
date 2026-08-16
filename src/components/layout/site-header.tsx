import { Suspense } from "react"
import Link from "next/link"

import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { SignOutButton } from "@/components/auth/sign-out-button"
import { getSession } from "@/lib/auth"
import { MainNav } from "./main-nav"
import { LinkPendingIndicator } from "./link-pending-indicator"

/**
 * Session-aware right-side header actions. Kept in its own Suspense boundary
 * so the root layout stays a static shell — awaiting session data directly in
 * the layout would block navigation and suppress `loading.tsx` fallbacks.
 */
async function SessionActions() {
  const session = await getSession()

  if (!session?.user) {
    return (
      <Button
        variant="ghost"
        size="sm"
        className="hidden sm:inline-flex"
        render={<Link href="/login" />}
      >
        Sign in
      </Button>
    )
  }

  return (
    <>
      <Button variant="ghost" size="sm" render={<Link href="/app" />}>
        Dashboard
      </Button>
      <SignOutButton />
    </>
  )
}

/**
 * Session-aware top nav (DESIGN_REFERENCE.md §2 row 1, Requirements §7/44).
 * Deliberately role-agnostic: signed-in users see Dashboard + Sign out,
 * signed-out users see Sign in. Role-specific surfaces (Owner / Admin) live
 * on the player dashboard as a "switch hats" card instead — global chrome
 * stays identical for players, owners, and admins alike.
 */
export function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 border-b border-border bg-background/80 backdrop-blur supports-backdrop-filter:bg-background/60">
      <div className="mx-auto flex h-14 max-w-6xl items-center gap-2 px-4">
        <Link
          href="/"
          className="flex items-center gap-2 font-heading text-lg font-semibold tracking-tight"
        >
          <span className="inline-block size-2.5 rounded-full bg-primary" aria-hidden />
          Turfkoi
        </Link>
        <MainNav variant="desktop" />
        <div className="ml-auto flex items-center gap-2">
          <Suspense fallback={<Skeleton className="h-7 w-24 rounded-md" aria-hidden />}>
            <SessionActions />
          </Suspense>
          <Button size="sm" render={<Link href="/turfs" />}>
            Book a turf
            <LinkPendingIndicator />
          </Button>
        </div>
      </div>
    </header>
  )
}
