import Link from "next/link"
import { redirect } from "next/navigation"
import { CalendarClockIcon, PlusIcon, MegaphoneIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { StatusBadge, EmptyState } from "@/components/shared"
import { KpiTile, PromoteSlotButton } from "@/components/turfs"
import { getCurrentUser } from "@/lib/auth"
import {
  getOwnerKPIs,
  listMyTurfs,
  listOwnerFillableSlots,
} from "@/features/turfs/queries"
import { turfFormatLabel } from "@/features/turfs/formats"

function fmtBdt(n: number) {
  return `৳${n.toLocaleString()}`
}

export default async function TurfOwnerDashboardPage() {
  const user = await getCurrentUser()
  if (!user) redirect("/login")
  if (!user.roles.includes("turf_owner")) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-16">
        <EmptyState
          title="You don't have a turf-owner account"
          description="Contact an admin to be granted the turf_owner role, then refresh this page."
        />
      </div>
    )
  }

  const [kpis, myTurfs, fillable] = await Promise.all([
    getOwnerKPIs(user.id),
    listMyTurfs(user.id),
    listOwnerFillableSlots(user.id, 7),
  ])

  return (
    <div className="mx-auto max-w-6xl space-y-8 px-4 py-12">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-heading text-2xl font-semibold">
            Turf owner dashboard
          </h1>
          <p className="text-sm text-muted-foreground">
            {myTurfs.length} turf{myTurfs.length === 1 ? "" : "s"} under
            management
          </p>
        </div>
        <Button render={<Link href="/turf-owner/turfs/new" />}>
          <PlusIcon aria-hidden />
          Add turf
        </Button>
      </header>

      <section className="grid gap-3 sm:grid-cols-2 md:grid-cols-4">
        <KpiTile
          label="Today's revenue"
          value={fmtBdt(kpis.todaysRevenue)}
          hint={`${kpis.todaysBookings} confirmed booking${
            kpis.todaysBookings === 1 ? "" : "s"
          }`}
        />
        <KpiTile
          label="Upcoming (7d)"
          value={kpis.upcomingBookings}
          hint="Confirmed bookings"
        />
        <KpiTile
          label="Open slots (7d)"
          value={kpis.availableSlots}
          hint="Available to book"
        />
        <KpiTile
          label="Occupancy (7d)"
          value={`${kpis.occupancyPct}%`}
          hint="Booked / (booked + open)"
        />
      </section>

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-heading text-lg font-semibold">My turfs</h2>
        </div>
        {myTurfs.length === 0 ? (
          <EmptyState
            icon={PlusIcon}
            title="List your first turf"
            description="Add a turf to start generating slots."
            action={
              <Button render={<Link href="/turf-owner/turfs/new" />}>
                Add turf
              </Button>
            }
          />
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2">
            {myTurfs.map((t) => (
              <li
                key={t.id}
                className="flex items-center justify-between gap-3 rounded-lg border border-border bg-card p-4"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <Link
                      href={`/turf-owner/turfs/${t.id}`}
                      className="truncate font-heading text-sm font-semibold hover:underline"
                    >
                      {t.name}
                    </Link>
                    {t.isVerified ? (
                      <StatusBadge status="success" showIcon={false}>
                        Verified
                      </StatusBadge>
                    ) : (
                      <StatusBadge status="warning" showIcon={false}>
                        Pending verification
                      </StatusBadge>
                    )}
                  </div>
                  <p className="truncate text-xs text-muted-foreground">
                    {[t.area, t.city].filter(Boolean).join(", ") || "Location TBD"}
                    {" · "}
                    {turfFormatLabel(t.format)}
                  </p>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  render={<Link href={`/turf-owner/turfs/${t.id}`} />}
                >
                  Manage
                </Button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="space-y-3">
        <div className="flex items-center gap-2">
          <MegaphoneIcon className="size-5 text-primary" aria-hidden />
          <h2 className="font-heading text-lg font-semibold">Fill this slot</h2>
        </div>
        <p className="text-sm text-muted-foreground">
          Unsold inventory in the next 7 days. Promote it to nearby teams once
          matchmaking launches.
        </p>
        {fillable.length === 0 ? (
          <EmptyState
            icon={CalendarClockIcon}
            title="No fillable slots"
            description="Generate availability for one of your turfs to see opportunities here."
          />
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2">
            {fillable.map((s) => (
              <li
                key={`${s.turfId}-${s.date}-${s.startTime}`}
                className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-card p-4"
              >
                <div>
                  <p className="font-heading text-sm font-semibold">
                    {s.turfName}
                  </p>
                  <p className="font-mono text-xs text-muted-foreground">
                    {s.date} · {s.startTime.slice(0, 5)} ({s.durationMinutes}m)
                  </p>
                  <p className="mt-1 text-sm">
                    Potential revenue:{" "}
                    <span className="font-semibold tabular-nums">
                      {fmtBdt(Number(s.price))}
                    </span>
                  </p>
                </div>
                <PromoteSlotButton
                  slotLabel={`${s.turfName} · ${s.date} ${s.startTime.slice(0, 5)}`}
                />
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
