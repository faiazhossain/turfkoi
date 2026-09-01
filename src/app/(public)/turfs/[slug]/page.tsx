import Link from "next/link"
import { notFound } from "next/navigation"
import type { Metadata } from "next"
import { MapPinIcon, CalendarCheckIcon, ImageOffIcon } from "lucide-react"

import { getT } from "@/i18n/server"
import { StatusBadge, EmptyState } from "@/components/shared"
import { TurfBookingCalendar } from "@/components/turfs/turf-booking-calendar"
import { getTurfBySlug, listTurfSlots, listTurfPhotos } from "@/features/turfs/queries"
import { TurfPhotoStrip } from "@/components/turfs/turf-photo-strip"
import { turfFormatLabel } from "@/features/turfs/formats"
import {
  getActiveSchedule,
  getBookingHorizon,
  listDateExceptions,
} from "@/features/turfs/materialize"
import {
  classifyBookingDays,
  slotEndTime,
  type PublicSlot,
} from "@/features/turfs/booking-calendar"
import { addDays, sectionLabelForSlot, todayInDhaka } from "@/lib/slot-expansion"
import { getCurrentUser } from "@/lib/auth"

interface PageProps {
  params: Promise<{ slug: string }>
  searchParams: Promise<{ month?: string }>
}

const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/

function monthStartEnd(month: string): { start: string; end: string } {
  const [y, m] = month.split("-").map(Number)
  const lastDay = new Date(y!, m!, 0).getDate()
  return { start: `${month}-01`, end: `${month}-${String(lastDay).padStart(2, "0")}` }
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

export default async function TurfDetailPage({ params, searchParams }: PageProps) {
  const { slug } = await params
  const { month: monthParam } = await searchParams
  const [turf, t, viewer] = await Promise.all([
    getTurfBySlug(slug),
    getT(),
    getCurrentUser(),
  ])
  if (!turf) notFound()

  // Seeded-but-unclaimed turfs stay hidden; admins can still preview them
  // from the admin console.
  if (turf.ownerId === null && !viewer?.roles.includes("admin")) notFound()

  // Owners never book their own turf — the calendar swaps Book buttons for
  // block/unblock controls (server also rejects self-holds).
  const viewerIsOwner = !!viewer && viewer.id === turf.ownerId

  // Displayed month: ?month=YYYY-MM clamped to [current month, horizon end].
  // Invalid or out-of-range values silently fall back to the current month
  // (single render pass, no redirect round-trip).
  const today = todayInDhaka()
  const currentMonth = today.slice(0, 7)
  const horizonEnd = addDays(today, await getBookingHorizon(turf.id))
  const horizonMonth = horizonEnd.slice(0, 7)
  const month =
    monthParam && MONTH_RE.test(monthParam) &&
    monthParam >= currentMonth && monthParam <= horizonMonth
      ? monthParam
      : currentMonth
  const { start: monthStart, end: monthEnd } = monthStartEnd(month)
  const fromDate = monthStart > today ? monthStart : today
  const toDate = monthEnd < horizonEnd ? monthEnd : horizonEnd

  const slots = await listTurfSlots(turf.id, { from: fromDate, to: toDate })

  // Slot system P2: surface section labels (peak/off-peak) and closed dates
  // on the public page instead of letting closures render as silent gaps.
  const [schedule, windowExceptions] = await Promise.all([
    getActiveSchedule(turf.id),
    listDateExceptions(turf.id, { from: fromDate, to: toDate }),
  ])
  const publicSlots: PublicSlot[] = slots.map((s) => {
    const startTime = s.startTime.slice(0, 5)
    return {
      date: s.date,
      startTime,
      endTime: slotEndTime(startTime, s.durationMinutes),
      durationMinutes: s.durationMinutes,
      price: Number(s.price),
      status: s.status,
      label: schedule
        ? sectionLabelForSlot(schedule.sections, s.date, startTime)
        : null,
    }
  })
  const closedDays = windowExceptions
    .filter((e) => e.isClosed)
    .map((e) => ({ date: e.date, reason: e.reason }))
  const days = classifyBookingDays(publicSlots, closedDays, {
    monthStart,
    monthEnd,
    today,
    horizonEnd,
  })
  const availableInMonth = publicSlots.filter((s) => s.status === "available").length

  const facilities = turf.facilities ?? {}
  const photos = await listTurfPhotos(turf.id)
  const facilityList = Object.entries(facilities).filter(
    ([k, v]) => k !== "grassType" && v === true
  )

  return (
    <div className="mx-auto max-w-4xl space-y-8 px-4 py-12">
      <nav className="text-sm text-dt-dim">
        <Link href="/turfs" className="hover:text-dt-txt">
          {t("nav.turfs")}
        </Link>{" "}
        / <span className="text-dt-txt">{turf.name}</span>
      </nav>

      {/* Hero photo / gallery */}
      <section>
        {photos.length > 0 ? (
          <TurfPhotoStrip name={turf.name} photos={photos} />
        ) : (
          <div className="flex w-fit items-center gap-2 rounded-full border border-dashed border-dt-line px-4 py-1.5 text-xs text-dt-dim">
            <ImageOffIcon className="size-3.5" aria-hidden />
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
        <div className="flex items-center gap-1 text-sm text-dt-dim">
          <MapPinIcon className="size-4" aria-hidden />
          {[turf.area, turf.city].filter(Boolean).join(", ") || t("turfs.locationTbd")}
        </div>
        {turf.description ? (
          <p className="max-w-2xl text-sm text-dt-txt/90">
            {turf.description}
          </p>
        ) : null}
      </header>

      <section className="grid gap-6 md:grid-cols-2">
        <div className="space-y-2">
          <h2 className="font-heading text-sm font-semibold">{t("turfs.facilities")}</h2>
          {facilityList.length === 0 ? (
            <p className="text-sm text-dt-dim">
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
            <p className="text-sm text-dt-dim">
              {t("turfs.surface", { type: facilities.grassType })}
            </p>
          ) : null}
        </div>
        <div className="space-y-2">
          <h2 className="font-heading text-sm font-semibold">{t("turfs.cancellation")}</h2>
          <p className="text-sm text-dt-dim">
            {t(CANCELLATION_KEYS[turf.cancellationPolicy] ?? turf.cancellationPolicy)}
          </p>
        </div>
      </section>

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-heading text-sm font-semibold">
            {t("turfs.bookingCalendar")}
          </h2>
          <StatusBadge status="neutral" showIcon={false}>
            {t(availableInMonth === 1 ? "turfs.slotCountOne" : "turfs.slotCountMany", {
              count: availableInMonth,
            })}
          </StatusBadge>
        </div>
        {publicSlots.length === 0 && closedDays.length === 0 ? (
          <EmptyState
            icon={CalendarCheckIcon}
            title={t("turfs.noSlotsTitle")}
            description={t("turfs.noSlotsDesc")}
          />
        ) : (
          <TurfBookingCalendar
            turfId={turf.id}
            slug={turf.slug}
            month={month}
            today={today}
            horizonEnd={horizonEnd}
            days={days}
            isOwner={viewerIsOwner}
          />
        )}
      </section>
    </div>
  )
}
