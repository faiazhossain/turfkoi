import { MainNav } from "./main-nav"

/**
 * Fixed mobile bottom navigation (SS16). Hidden on >= md where the desktop
 * header nav takes over. Role-aware items come with auth (Phase 1).
 */
export function MobileNav() {
  return (
    <div className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur supports-backdrop-filter:bg-background/80 md:hidden">
      <div className="mx-auto flex max-w-6xl items-stretch px-2">
        <MainNav variant="mobile" />
      </div>
    </div>
  )
}
