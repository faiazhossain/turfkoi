import { MainNav } from "./main-nav"
import { NotificationBell } from "@/features/notifications/components/notification-bell"

/**
 * Fixed mobile bottom navigation (SS16). Hidden on >= md where the desktop
 * header nav takes over. Role-aware items come with auth (Phase 1). The
 * notification bell links to the full-screen center (it hides itself when
 * signed out, keeping this layout static).
 */
export function MobileNav() {
  return (
    <div className="fixed inset-x-0 bottom-0 z-40 border-t border-dt-line bg-dt-bg/95 pb-[env(safe-area-inset-bottom)] backdrop-blur supports-backdrop-filter:bg-dt-bg/80 md:hidden">
      <div className="mx-auto flex max-w-6xl items-stretch px-2">
        <MainNav variant="mobile" />
        <NotificationBell variant="link" />
      </div>
    </div>
  )
}
