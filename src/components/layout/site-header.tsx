import Link from "next/link"

import { Button } from "@/components/ui/button"
import { SignOutButton } from "@/components/auth/sign-out-button"
import { getCurrentUser } from "@/lib/auth"
import { MainNav } from "./main-nav"

/**
 * Session-aware top nav (DESIGN_REFERENCE.md §2 row 1: "role-aware top nav",
 * Requirements Section 7/44). The original Phase 0 header was a static
 * placeholder that always showed "Sign in"; it now reads the current user
 * and exposes role-gated entry points (Owner / Admin) plus sign-out.
 */
export async function SiteHeader() {
  const user = await getCurrentUser()

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
          {user ? (
            <>
              {user.roles.includes("turf_owner") && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="hidden md:inline-flex"
                  render={<Link href="/turf-owner" />}
                >
                  Owner
                </Button>
              )}
              {user.roles.includes("admin") && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="hidden md:inline-flex"
                  render={<Link href="/admin" />}
                >
                  Admin
                </Button>
              )}
              <Button variant="ghost" size="sm" render={<Link href="/app" />}>
                Dashboard
              </Button>
              <SignOutButton />
            </>
          ) : (
            <Button
              variant="ghost"
              size="sm"
              className="hidden sm:inline-flex"
              render={<Link href="/login" />}
            >
              Sign in
            </Button>
          )}
          <Button size="sm" render={<Link href="/turfs" />}>
            Book a turf
          </Button>
        </div>
      </div>
    </header>
  )
}
