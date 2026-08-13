import type { ComponentType } from "react"
import { HomeIcon, CompassIcon, SwordsIcon, UserIcon } from "lucide-react"

export interface NavItem {
  label: string
  href: string
  icon: ComponentType<{ className?: string }>
}

/**
 * Phase 0 primary nav. Role-aware filtering (player / team / turf-owner /
 * admin) lands with auth in Phase 1.
 */
export const primaryNav: NavItem[] = [
  { label: "Home", href: "/", icon: HomeIcon },
  { label: "Discover", href: "/turfs", icon: CompassIcon },
  { label: "Matches", href: "/matches", icon: SwordsIcon },
  { label: "Profile", href: "/app", icon: UserIcon },
]
