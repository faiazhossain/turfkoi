import { redirect } from "next/navigation"
import { ConstructionIcon } from "lucide-react"

import { EmptyState } from "@/components/shared"
import { PayoutsPanel } from "@/components/bookings/payouts-panel"
import { getCurrentUser } from "@/lib/auth"
import { listAllPayouts } from "@/features/bookings/queries"

export default async function AdminDashboardPage() {
  const user = await getCurrentUser()
  if (!user) redirect("/login")
  if (!user.roles.includes("admin")) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-16">
        <EmptyState
          title="Not an admin"
          description="You need the admin role to view this page."
        />
      </div>
    )
  }

  // This week's payout window (Mon-Sun, UTC date strings).
  const now = new Date()
  const day = now.getUTCDay() // 0 = Sun
  const mondayOffset = day === 0 ? 6 : day - 1
  const periodEnd = now.toISOString().slice(0, 10)
  const periodStart = new Date(now.getTime() - mondayOffset * 86400000)
    .toISOString()
    .slice(0, 10)

  const payouts = await listAllPayouts(30)

  return (
    <div className="mx-auto max-w-6xl space-y-8 px-4 py-12">
      <header>
        <h1 className="font-heading text-2xl font-semibold">Admin</h1>
        <p className="text-sm text-muted-foreground">
          Payouts + money-flow oversight. Approvals, disputes, and dual-control
          refunds arrive in Phase 7.
        </p>
      </header>

      <PayoutsPanel
        payouts={payouts}
        periodStart={periodStart}
        periodEnd={periodEnd}
      />

      <EmptyState
        icon={ConstructionIcon}
        title="More admin tools coming in Phase 7"
        description="User/turf verification, dispute resolution, reports, and dual-control refunds > ৳5,000."
      />
    </div>
  )
}
