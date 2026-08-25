import Link from "next/link"
import { notFound, redirect } from "next/navigation"

import { getCurrentUser } from "@/lib/auth"
import { can } from "@/lib/capabilities"
import { addDays, todayInDhaka } from "@/lib/slot-expansion"
import { findBdHoliday, isDuringRamadan, listBdHolidays } from "@/lib/bd-holidays"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs"
import { Button } from "@/components/ui/button"
import { StatusBadge } from "@/components/shared"
import {
  AddSlotForm,
  DayExceptionForm,
  GenerateSlotsForm,
  SavedSchedulesCard,
  ScheduleBuilderForm,
  SlotConflictsCard,
  SlotGrid,
  TurfDayCalendar,
  TurfForm,
  type DayMarker,
} from "@/components/turfs"
import { TurfPhotoGallery } from "@/components/turfs/turf-photo-gallery"
import { getTurfById, listTurfSlots, listTurfPhotos } from "@/features/turfs/queries"
import {
  getActiveSchedule,
  listDateExceptions,
  listSchedules,
  listSlotConflicts,
} from "@/features/turfs/materialize"
import type { TurfFormValues, SaveScheduleValues } from "@/features/turfs/schemas"

interface PageProps {
  params: Promise<{ id: string }>
  searchParams: Promise<{ date?: string; month?: string }>
}

/**
 * Sensible BD starting point for a turf with no schedule yet: two sections
 * per day (morning flat-rate, evening peak at 90 min with turnaround),
 * Friday opening after jummah. Owners adjust from here.
 */
function bdSchedulePreset(): SaveScheduleValues {
  const weekdays = [
    { day: 0, morning: ["07:00", "12:00"], evening: ["17:00", "23:00"] },
    { day: 1, morning: ["07:00", "12:00"], evening: ["17:00", "23:00"] },
    { day: 2, morning: ["07:00", "12:00"], evening: ["17:00", "23:00"] },
    { day: 3, morning: ["07:00", "12:00"], evening: ["17:00", "23:00"] },
    { day: 4, morning: ["07:00", "12:00"], evening: ["17:00", "23:00"] },
    // Friday: short morning, jummah midday, evening from 14:30.
    { day: 5, morning: ["08:00", "11:30"], evening: ["14:30", "23:00"] },
    { day: 6, morning: ["08:00", "12:00"], evening: ["16:00", "23:00"] },
  ]
  return {
    name: "Regular week",
    isActive: true,
    sections: weekdays.flatMap(({ day, morning, evening }) => [
      {
        dayOfWeek: day,
        label: "Morning",
        startTime: morning[0]!,
        endTime: morning[1]!,
        slotMinutes: 60,
        gapMinutes: 0,
        price: 800,
      },
      {
        dayOfWeek: day,
        label: "Evening",
        startTime: evening[0]!,
        endTime: evening[1]!,
        slotMinutes: 90,
        gapMinutes: 10,
        price: 1200,
      },
    ]),
  }
}

export default async function EditTurfPage({
  params,
  searchParams,
}: PageProps) {
  const { id } = await params
  const { date: dateParam, month: monthParam } = await searchParams
  const user = await getCurrentUser()
  if (!user) redirect("/login")

  const turf = await getTurfById(id)
  if (!turf) notFound()
  if (!can(user, "turf.update", { ownerId: turf.ownerId })) {
    notFound()
  }

  const today = new Date()
  const fromDate = today.toISOString().slice(0, 10)
  const toDate = new Date(today.getTime() + 14 * 86400000)
    .toISOString()
    .slice(0, 10)
  const slots = await listTurfSlots(turf.id, { from: fromDate, to: toDate })
  const photos = await listTurfPhotos(turf.id)
  const activeSchedule = await getActiveSchedule(turf.id)
  const slotConflicts = await listSlotConflicts(turf.id)
  const savedSchedules = await listSchedules(turf.id)

  // Calendar state is server-driven: ?month= decides markers, ?date= the
  // day panel. Defaults: current month, no selection.
  const todayIso = todayInDhaka()
  const selectedDate =
    dateParam && /^\d{4}-\d{2}-\d{2}$/.test(dateParam) ? dateParam : null
  const month =
    monthParam && /^\d{4}-\d{2}$/.test(monthParam)
      ? monthParam
      : (selectedDate ?? todayIso).slice(0, 7)
  const [year, monthNo] = month.split("-").map(Number)
  const monthStart = `${month}-01`
  const monthEnd = addDays(
    `${month}-01`,
    new Date(Date.UTC(year!, monthNo!, 0)).getUTCDate() - 1
  )

  const monthExceptions = await listDateExceptions(turf.id, {
    from: monthStart,
    to: monthEnd,
  })
  const markers: Record<string, DayMarker> = {}
  for (const ex of monthExceptions) {
    markers[ex.date] = {
      closed: ex.isClosed,
      priceRule: ex.priceMode != null,
    }
  }
  for (const h of listBdHolidays(year!)) {
    if (h.date >= monthStart && h.date <= monthEnd) {
      markers[h.date] = { ...markers[h.date], holiday: true }
    }
  }

  const daySlots = selectedDate
    ? await listTurfSlots(turf.id, { from: selectedDate, to: selectedDate })
    : []
  const selectedException =
    monthExceptions.find((e) => e.date === selectedDate) ??
    (selectedDate
      ? (
          await listDateExceptions(turf.id, {
            from: selectedDate,
            to: selectedDate,
          })
        )[0]
      : undefined)
  const selectedHoliday = selectedDate ? findBdHoliday(selectedDate) : null

  const formDefaults: Partial<TurfFormValues> = {
    name: turf.name,
    slug: turf.slug,
    description: turf.description ?? "",
    coords: turf.coords ?? { lat: 23.8103, lng: 90.4125 },
    format: turf.format,
    city: turf.city ?? "",
    area: turf.area ?? "",
    address: turf.address ?? "",
    cancellationPolicy: turf.cancellationPolicy,
    cancellationPolicyConfig: (turf.cancellationPolicyConfig ?? undefined) as
      | TurfFormValues["cancellationPolicyConfig"]
      | undefined,
    facilities: (turf.facilities ?? {}) as TurfFormValues["facilities"],
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6 px-4 py-12">
      <nav className="flex items-center justify-between text-sm">
        <Link
          href="/turf-owner"
          className="text-muted-foreground hover:text-foreground"
        >
          ← Back to dashboard
        </Link>
        <div className="flex items-center gap-2">
          <Link
            href={`/turfs/${turf.slug}`}
            className="text-primary hover:underline"
          >
            Public view
          </Link>
          {turf.isVerified ? (
            <StatusBadge status="success" showIcon={false}>
              Verified
            </StatusBadge>
          ) : (
            <StatusBadge status="warning" showIcon={false}>
              Pending verification
            </StatusBadge>
          )}
        </div>
      </nav>

      <h1 className="font-heading text-2xl font-semibold">{turf.name}</h1>

      <Tabs defaultValue="edit">
        <TabsList>
          <TabsTrigger value="edit">Details</TabsTrigger>
          <TabsTrigger value="slots">Slots ({slots.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="edit" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="font-heading text-lg">
                Turf details
              </CardTitle>
              <CardDescription>
                Changes appear on the public page after saving.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <TurfForm mode="edit" turfId={turf.id} defaultValues={formDefaults} />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="font-heading text-lg">Photos</CardTitle>
              <CardDescription>
                Added photos appear immediately — no save needed.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <TurfPhotoGallery turfId={turf.id} photos={photos} />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="slots" className="space-y-6">
          <SlotConflictsCard conflicts={slotConflicts} />
          <Card>
            <CardHeader>
              <CardTitle className="font-heading text-lg">
                Weekly schedule
              </CardTitle>
              <CardDescription>
                {activeSchedule
                  ? `Editing "${activeSchedule.name}" - the active schedule. Sections set each day's slots, length, turnaround gap, and price. Saving rematerializes the next 30 days; booked slots and hand-edited slots are never touched.`
                  : "No schedule yet - a typical Dhaka week is prefilled below. Sections set each day's slots, length, turnaround gap, and price. Saving materializes the next 30 days."}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ScheduleBuilderForm
                turfId={turf.id}
                defaultValues={
                  activeSchedule
                    ? {
                        scheduleId: activeSchedule.id,
                        name: activeSchedule.name,
                        isActive: true,
                        sections: activeSchedule.sections.map((s) => ({
                          dayOfWeek: s.dayOfWeek,
                          label: s.label ?? undefined,
                          startTime: s.startTime,
                          endTime: s.endTime,
                          slotMinutes: s.slotMinutes,
                          gapMinutes: s.gapMinutes,
                          price: s.price,
                        })),
                      }
                    : bdSchedulePreset()
                }
              />
            </CardContent>
          </Card>

          <SavedSchedulesCard
            turfId={turf.id}
            schedules={savedSchedules}
            today={todayIso}
          />

          <Card>
            <CardHeader>
              <CardTitle className="font-heading text-lg">
                Day calendar
              </CardTitle>
              <CardDescription>
                Click a day to see and edit its slots. Ringed days are public
                holidays ({`we seed the BD calendar - lunar dates are
                estimates, always double-check Eid`}).
              </CardDescription>
            </CardHeader>
            <CardContent>
              <TurfDayCalendar
                turfId={turf.id}
                month={month}
                selectedDate={selectedDate}
                markers={markers}
              />
            </CardContent>
          </Card>

          {selectedDate ? (
            <Card id="day-panel">
              <CardHeader>
                <CardTitle className="font-heading text-lg">
                  {new Date(
                    `${selectedDate}T00:00:00`
                  ).toLocaleDateString("en-GB", {
                    weekday: "long",
                    day: "numeric",
                    month: "long",
                    year: "numeric",
                  })}
                </CardTitle>
                <CardDescription className="space-x-2">
                  {selectedHoliday ? (
                    <StatusBadge status="warning" showIcon={false}>
                      {selectedHoliday.name}
                      {selectedHoliday.approximate ? " (est.)" : ""}
                    </StatusBadge>
                  ) : null}
                  {selectedException?.isClosed ? (
                    <StatusBadge status="danger" showIcon={false}>
                      Closed{selectedException.reason ? ` - ${selectedException.reason}` : ""}
                    </StatusBadge>
                  ) : null}
                  {selectedException?.priceMode ? (
                    <StatusBadge status="success" showIcon={false}>
                      {selectedException.priceMode === "multiplier"
                        ? `x${selectedException.priceValue} holiday rate`
                        : `Flat ${selectedException.priceValue} BDT`}
                    </StatusBadge>
                  ) : null}
                  {isDuringRamadan(selectedDate) ? (
                    <StatusBadge status="neutral" showIcon={false}>
                      Ramadan - night hours? Wrap a section past midnight in
                      the weekly schedule.
                    </StatusBadge>
                  ) : null}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <DayExceptionForm
                  turfId={turf.id}
                  date={selectedDate}
                  existing={
                    selectedException
                      ? {
                          isClosed: selectedException.isClosed,
                          reason: selectedException.reason,
                          priceMode: selectedException.priceMode,
                          priceValue: selectedException.priceValue,
                        }
                      : null
                  }
                  holidayName={selectedHoliday?.name ?? null}
                />
                <div className="space-y-2">
                  <h4 className="text-sm font-semibold">Slots this day</h4>
                  {daySlots.length > 0 ? (
                    <SlotGrid turfId={turf.id} slots={daySlots} />
                  ) : (
                    <p className="rounded-lg border border-dashed border-border p-4 text-center text-sm text-muted-foreground">
                      No slots on this date - the weekly schedule has nothing
                      for this weekday, or the day is closed.
                    </p>
                  )}
                </div>
              </CardContent>
            </Card>
          ) : null}

          <Card>
            <CardHeader>
              <CardTitle className="font-heading text-lg">
                Generate availability
              </CardTitle>
              <CardDescription>
                Bulk-create slots across a date range. You can override
                individual slots below.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <GenerateSlotsForm turfId={turf.id} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="font-heading text-lg">
                Add a custom slot
              </CardTitle>
              <CardDescription>
                Hand-place a single slot on one date — a late-night Ramadan
                game, a one-off morning session. Overlapping slots are
                rejected. Custom slots stay put even when you regenerate.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <AddSlotForm turfId={turf.id} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="font-heading text-lg">
                Slots · next 14 days
              </CardTitle>
              <CardDescription>
                Edit price or set maintenance / blocked. Booked slots are
                immutable here — the booking flow owns them (Phase 3).
              </CardDescription>
            </CardHeader>
            <CardContent>
              <SlotGrid turfId={turf.id} slots={slots} />
              <Button
                variant="ghost"
                size="sm"
                className="mt-4"
                render={<Link href="/turf-owner">Done</Link>}
              >
                Done
              </Button>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
