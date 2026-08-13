import { ConstructionIcon } from "lucide-react"

import { EmptyState } from "@/components/shared"

export default function TeamDashboardPage() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-16">
      <EmptyState
        icon={ConstructionIcon}
        title="Team dashboard"
        description="Team management and match creation arrive in Phase 4 (Teams) and Phase 5 (Matchmaking)."
      />
    </div>
  )
}
