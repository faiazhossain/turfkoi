import { ConstructionIcon } from "lucide-react"

import { EmptyState } from "@/components/shared"

export default function AdminDashboardPage() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-16">
      <EmptyState
        icon={ConstructionIcon}
        title="Admin panel"
        description="Approvals, payouts, and dispute resolution arrive in Phase 7 (Admin)."
      />
    </div>
  )
}
