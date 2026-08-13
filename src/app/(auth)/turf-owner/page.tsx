import { ConstructionIcon } from "lucide-react"

import { EmptyState } from "@/components/shared"

export default function TurfOwnerDashboardPage() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-16">
      <EmptyState
        icon={ConstructionIcon}
        title="Turf owner dashboard"
        description="Turf management, slots, and the 'Fill This Slot' feature arrive in Phase 2 (Turf management)."
      />
    </div>
  )
}
