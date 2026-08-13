import Link from "next/link"

import { Button } from "@/components/ui/button"
import { MainNav } from "./main-nav"

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
          <Button variant="ghost" size="sm" className="hidden sm:inline-flex">
            Sign in
          </Button>
          <Button size="sm" render={<Link href="/turfs" />}>
            Book a turf
          </Button>
        </div>
      </div>
    </header>
  )
}
