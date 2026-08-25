import type { ComponentType } from "react"
import { HomeIcon, CompassIcon, SwordsIcon, UserIcon } from "lucide-react"

export interface NavItem {
  /** Dictionary key (nav.* namespace) resolved at render time. */
  labelKey: string
  href: string
  icon: ComponentType<{ className?: string }>
}

/**
 * Phase 0 primary nav. Role-aware filtering (player / team / turf-owner /
 * admin) lands with auth in Phase 1.
 */
export const primaryNav: NavItem[] = [
  { labelKey: "nav.home", href: "/", icon: HomeIcon },
  { labelKey: "nav.turfs", href: "/turfs", icon: CompassIcon },
  { labelKey: "nav.matches", href: "/matches", icon: SwordsIcon },
  { labelKey: "nav.profile", href: "/app", icon: UserIcon },
]
