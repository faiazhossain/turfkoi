import Link from "next/link"
import { notFound } from "next/navigation"
import type { Metadata } from "next"
import { MapPinIcon, CalendarCheckIcon } from "lucide-react"

import { getT } from "@/i18n/server"
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
  const [turf, t] = await Promise.all([getTurfBySlug(slug), getT()])
  // Seeded-but-unclaimed turfs are not public — don't leak them in metadata.
  if (!turf || turf.ownerId === null) return {}
  const title = t("turfs.detailTitle", { name: turf.name })
  const description = t("turfs.detailDescription", {
    format: turfFormatLabel(turf.format),
    place: [turf.area, turf.city].filter(Boolean).join(", ") || "Bangladesh",
  })
  return {
    title,
    description,
    openGraph: { title, description, type: "website" },
    alternates: { canonical: `/turfs/${turf.slug}` },
  }
}

const FACILITY_KEYS: Record<string, string> = {
  indoor: "turfs.facility.indoor",
  outdoor: "turfs.facility.outdoor",
  lighting: "turfs.facility.lighting",
  parking: "turfs.facility.parking",
  changingRoom: "turfs.facility.changingRoom",
  shower: "turfs.facility.shower",
  washroom: "turfs.facility.washroom",
  equipment: "turfs.facility.equipment",
}

/** Player-facing cancellation copy (semantics mirror lib/cancellation.ts). */
const CANCELLATION_KEYS: Record<string, string> = {
  flexible: "turfs.cancellationFlexible",
  moderate: "turfs.cancellationModerate",
  rebook_contingent: "turfs.cancellationRebook",
  strict: "turfs.cancellationStrict",
}

export default async function TurfDetailPage({ params }: PageProps) {
  const { slug } = await params
  const [turf, t] = await Promise.all([getTurfBySlug(slug), getT()])
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
          {t("nav.turfs")}
        </Link>{" "}
        / <span className="text-foreground">{turf.name}</span>
      </nav>

      {/* Hero photo / gallery */}
      <section>
        {photos.length > 0 ? (
          <TurfPhotoStrip name={turf.name} photos={photos} />
        ) : (
          <div className="flex aspect-video w-full items-center justify-center rounded-xl border border-dashed border-border text-sm text-muted-foreground">
            {t("turfs.noPhotosYet")}
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
            <StatusBadge status="warning">{t("turfs.inactive")}</StatusBadge>
          )}
        </div>
        <div className="flex items-center gap-1 text-sm text-muted-foreground">
          <MapPinIcon className="size-4" aria-hidden />
          {[turf.area, turf.city].filter(Boolean).join(", ") || t("turfs.locationTbd")}
        </div>
        {turf.description ? (
          <p className="max-w-2xl text-sm text-foreground/90">
            {turf.description}
          </p>
        ) : null}
      </header>

      <section className="grid gap-6 md:grid-cols-2">
        <div className="space-y-2">
          <h2 className="font-heading text-sm font-semibold">{t("turfs.facilities")}</h2>
          {facilityList.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {t("turfs.noFacilities")}
            </p>
          ) : (
            <ul className="grid grid-cols-2 gap-1 text-sm">
              {facilityList.map(([k]) => (
                <li key={k}>{t(FACILITY_KEYS[k] ?? k)}</li>
              ))}
            </ul>
          )}
          {facilities.grassType ? (
            <p className="text-sm text-muted-foreground">
              {t("turfs.surface", { type: facilities.grassType })}
            </p>
          ) : null}
        </div>
        <div className="space-y-2">
          <h2 className="font-heading text-sm font-semibold">{t("turfs.cancellation")}</h2>
          <p className="text-sm text-muted-foreground">
            {t(CANCELLATION_KEYS[turf.cancellationPolicy] ?? turf.cancellationPolicy)}
          </p>
        </div>
      </section>

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-heading text-sm font-semibold">
            {t("turfs.next7Days")}
          </h2>
          <StatusBadge status="neutral" showIcon={false}>
            {t(slots.length === 1 ? "turfs.slotCountOne" : "turfs.slotCountMany", {
              count: slots.length,
            })}
          </StatusBadge>
        </div>
        {slots.length === 0 && closedDays.length === 0 ? (
          <EmptyState
            icon={CalendarCheckIcon}
            title={t("turfs.noSlotsTitle")}
            description={t("turfs.noSlotsDesc")}
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
