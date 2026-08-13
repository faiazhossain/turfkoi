import Link from "next/link"
import { notFound } from "next/navigation"
import { MapPinIcon, CalendarCheckIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { StatusBadge, EmptyState } from "@/components/shared"
import { getTurfBySlug, listTurfSlots } from "@/features/turfs/queries"

interface PageProps {
  params: Promise<{ slug: string }>
}

const FACILITY_LABELS: Record<string, string> = {
  indoor: "Indoor",
  lighting: "Floodlights",
  parking: "Parking",
  changingRoom: "Changing room",
  shower: "Shower",
  washroom: "Washroom",
  equipment: "Equipment rental",
}

export default async function TurfDetailPage({ params }: PageProps) {
  const { slug } = await params
  const turf = await getTurfBySlug(slug)
  if (!turf) notFound()

  const today = new Date()
  const fromDate = today.toISOString().slice(0, 10)
  const toDate = new Date(today.getTime() + 7 * 86400000)
    .toISOString()
    .slice(0, 10)
  const slots = await listTurfSlots(turf.id, { from: fromDate, to: toDate })

  const facilities = turf.facilities ?? {}
  const facilityList = Object.entries(facilities).filter(
    ([k, v]) => k !== "grassType" && v === true
  )
  const fmt = (t: string) => t.slice(0, 5)

  return (
    <div className="mx-auto max-w-4xl space-y-8 px-4 py-12">
      <nav className="text-sm text-muted-foreground">
        <Link href="/turfs" className="hover:text-foreground">
          Turfs
        </Link>{" "}
        / <span className="text-foreground">{turf.name}</span>
      </nav>

      {/* Hero photo / gallery */}
      <section>
        {turf.photos.length > 0 ? (
          <div className="aspect-video w-full overflow-hidden rounded-xl bg-muted">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={turf.photos[0]}
              alt={turf.name}
              className="size-full object-cover"
            />
          </div>
        ) : (
          <div className="flex aspect-video w-full items-center justify-center rounded-xl border border-dashed border-border text-sm text-muted-foreground">
            No photos yet
          </div>
        )}
      </section>

      <header className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="font-heading text-3xl font-semibold tracking-tight">
            {turf.name}
          </h1>
          <StatusBadge status="primary" showIcon={false}>
            {turf.format === "fives" ? "5-a-side" : "7-a-side"}
          </StatusBadge>
          {turf.isActive ? null : (
            <StatusBadge status="warning">Inactive</StatusBadge>
          )}
        </div>
        <div className="flex items-center gap-1 text-sm text-muted-foreground">
          <MapPinIcon className="size-4" aria-hidden />
          {[turf.area, turf.city].filter(Boolean).join(", ") || "Location TBD"}
        </div>
        {turf.description ? (
          <p className="max-w-2xl text-sm text-foreground/90">
            {turf.description}
          </p>
        ) : null}
      </header>

      <section className="grid gap-6 md:grid-cols-2">
        <div className="space-y-2">
          <h2 className="font-heading text-sm font-semibold">Facilities</h2>
          {facilityList.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No facility details provided.
            </p>
          ) : (
            <ul className="grid grid-cols-2 gap-1 text-sm">
              {facilityList.map(([k]) => (
                <li key={k}>{FACILITY_LABELS[k] ?? k}</li>
              ))}
            </ul>
          )}
          {facilities.grassType ? (
            <p className="text-sm text-muted-foreground">
              Surface: {facilities.grassType}
            </p>
          ) : null}
        </div>
        <div className="space-y-2">
          <h2 className="font-heading text-sm font-semibold">Cancellation</h2>
          <p className="text-sm capitalize text-muted-foreground">
            {turf.cancellationPolicy.replace(/_/g, " ")}
          </p>
        </div>
      </section>

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-heading text-sm font-semibold">
            Next 7 days
          </h2>
          <StatusBadge status="neutral" showIcon={false}>
            {slots.length} slot{slots.length === 1 ? "" : "s"}
          </StatusBadge>
        </div>
        {slots.length === 0 ? (
          <EmptyState
            icon={CalendarCheckIcon}
            title="No published slots yet"
            description="The turf owner hasn't published availability. Booking arrives in Phase 3."
          />
        ) : (
          <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border">
            {slots.slice(0, 30).map((s) => (
              <li
                key={`${s.date}-${s.startTime}`}
                className="flex items-center justify-between gap-2 bg-card p-3 text-sm"
              >
                <span className="font-mono text-xs">
                  {s.date} · {fmt(s.startTime)} ({s.durationMinutes}m)
                </span>
                <div className="flex items-center gap-2">
                  <span className="tabular-nums">
                    ৳{Number(s.price).toLocaleString()}
                  </span>
                  <StatusBadge
                    status={s.status === "available" ? "success" : "neutral"}
                    showIcon={false}
                  >
                    {s.status}
                  </StatusBadge>
                </div>
              </li>
            ))}
          </ul>
        )}
        <Button variant="outline" disabled>
          Book this turf — Phase 3
        </Button>
      </section>
    </div>
  )
}
