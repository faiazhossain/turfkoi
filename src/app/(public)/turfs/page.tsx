import { ConstructionIcon } from "lucide-react"

import { EmptyState } from "@/components/shared"

export default function TurfsPage() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-16">
      <EmptyState
        icon={ConstructionIcon}
        title="Turf discovery"
        description="Map-based turf search and slot booking arrive in Phase 3 (Booking & payments)."
      />
    </div>
  )
}
