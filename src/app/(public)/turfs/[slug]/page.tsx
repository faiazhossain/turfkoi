import Link from "next/link"
import { notFound } from "next/navigation"
import type { Metadata } from "next"
import { MapPinIcon, CalendarCheckIcon } from "lucide-react"

import { StatusBadge, EmptyState } from "@/components/shared"
import { BookSlotButton, type ClosedDay } from "@/components/bookings/book-slot-button"
import { getTurfBySlug, listTurfSlots, listTurfPhotos } from "@/features/turfs/queries"
import { TurfPhotoStrip } from "@/components/turfs/turf-photo-strip"
import { turfFormatLabel } from "@/features/turfs/formats"
import { getActiveSchedule, listDateExceptions } from "@/features/turfs/materialize"
import { sectionLabelForSlot } from "@/lib/slot-expansion"
import { getCurrentUser } from "@/lib/auth"

interface PageProps {
  params: Promise<{ slug: string }>
}

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { slug } = await params
  const turf = await getTurfBySlug(slug)
  // Seeded-but-unclaimed turfs are not public — don't leak them in metadata.
  if (!turf || turf.ownerId === null) return {}
  const title = `${turf.name} — Book in Bangladesh`
  const description =
    `${turfFormatLabel(turf.format)} turf in ` +
    `${[turf.area, turf.city].filter(Boolean).join(", ") || "Bangladesh"}. ` +
    `See live availability and book online with bKash.`
  return {
    title,
    description,
    openGraph: { title, description, type: "website" },
    alternates: { canonical: `/turfs/${turf.slug}` },
  }
}

const FACILITY_LABELS: Record<string, string> = {
  indoor: "Indoor",
  outdoor: "Outdoor",
  lighting: "Floodlights",
  parking: "Parking",
  changingRoom: "Changing room",
  shower: "Shower",
  washroom: "Washroom",
  equipment: "Equipment rental",
}

/** Player-facing cancellation copy (semantics mirror lib/cancellation.ts). */
const CANCELLATION_COPY: Record<string, string> = {
  flexible: "Free cancellation — full refund any time before kickoff.",
  moderate:
    "Full refund up to 24h before kickoff, 50% inside 24h, none at the last minute.",
  rebook_contingent:
    "Refunded only if the slot is re-booked by another player.",
  strict: "Non-refundable after booking.",
}

export default async function TurfDetailPage({ params }: PageProps) {
  const { slug } = await params
  const turf = await getTurfBySlug(slug)
  if (!turf) notFound()

  // Seeded-but-unclaimed turfs stay hidden; admins can still preview them
  // from the admin console.
  if (turf.ownerId === null) {
    const viewer = await getCurrentUser()
    if (!viewer?.roles.includes("admin")) notFound()
  }

  const today = new Date()
  const fromDate = today.toISOString().slice(0, 10)
  const toDate = new Date(today.getTime() + 7 * 86400000)
    .toISOString()
    .slice(0, 10)
  const slots = await listTurfSlots(turf.id, { from: fromDate, to: toDate })

  // Slot system P2: surface section labels (peak/off-peak) and closed dates
  // on the public page instead of letting closures render as silent gaps.
  const [schedule, windowExceptions] = await Promise.all([
    getActiveSchedule(turf.id),
    listDateExceptions(turf.id, { from: fromDate, to: toDate }),
  ])
  const labeledSlots = schedule
    ? slots.map((s) => ({
        ...s,
        label: sectionLabelForSlot(
          schedule.sections,
          s.date,
          s.startTime.slice(0, 5)
        ),
      }))
    : slots
  const closedDays: ClosedDay[] = windowExceptions
    .filter((e) => e.isClosed)
    .map((e) => ({ date: e.date, reason: e.reason }))

  const facilities = turf.facilities ?? {}
  const photos = await listTurfPhotos(turf.id)
  const facilityList = Object.entries(facilities).filter(
    ([k, v]) => k !== "grassType" && v === true
  )

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
        {photos.length > 0 ? (
          <TurfPhotoStrip name={turf.name} photos={photos} />
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
            {turfFormatLabel(turf.format)}
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
          <p className="text-sm text-muted-foreground">
            {CANCELLATION_COPY[turf.cancellationPolicy] ?? turf.cancellationPolicy}
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
        {slots.length === 0 && closedDays.length === 0 ? (
          <EmptyState
            icon={CalendarCheckIcon}
            title="No published slots yet"
            description="The turf owner hasn't published availability."
          />
        ) : (
          <BookSlotButton
            turfId={turf.id}
            slots={labeledSlots}
            closedDays={closedDays}
          />
        )}
      </section>
    </div>
  )
}
