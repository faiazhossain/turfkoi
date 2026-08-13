import { ConstructionIcon } from "lucide-react"

import { EmptyState } from "@/components/shared"

export default function PlayerDashboardPage() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-16">
      <EmptyState
        icon={ConstructionIcon}
        title="Player dashboard"
        description="Your matches, nearby games, and 'play tonight' feed arrive in Phase 1 (Auth) and Phase 6 (Player matchmaking)."
      />
    </div>
  )
}
