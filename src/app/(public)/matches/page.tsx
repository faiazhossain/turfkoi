import { ConstructionIcon } from "lucide-react"

import { EmptyState } from "@/components/shared"

export default function MatchesPage() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-16">
      <EmptyState
        icon={ConstructionIcon}
        title="Find a match"
        description="Match discovery and team-vs-team matchmaking arrive in Phase 5."
      />
    </div>
  )
}
