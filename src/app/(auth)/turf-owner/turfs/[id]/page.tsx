import Link from "next/link"
import { notFound, redirect } from "next/navigation"
import type { Metadata } from "next"
import { CalendarClockIcon, InfoIcon } from "lucide-react"

import { getCurrentUser } from "@/lib/auth"
import { getT } from "@/i18n/server"
import { buildMetadata } from "@/i18n/metadata"
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
import { StatusBadge } from "@/components/shared"
import {
  BookingHorizonSelect,
  DayAdjustments,
  DayPanel,
  EmptyDayState,
  HowSlotsWork,
  SavedSchedulesCard,
  ScheduleBuilderForm,
  ScheduleWizardDialog,
  SlotConflictsCard,
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

export async function generateMetadata(): Promise<Metadata> {
  return buildMetadata({ titleKey: "metadata.turfOwnerEditTitle" })
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
  const t = await getT()
  const user = await getCurrentUser()
  if (!user) redirect("/login")

  const turf = await getTurfById(id)
  if (!turf) notFound()
  if (!can(user, "turf.update", { ownerId: turf.ownerId })) {
    notFound()
  }

  const today = new Date()
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

  // Weekly-hours form defaults: the active schedule, or the BD preset for
  // turfs without one. Shared by the "Weekly hours" sheet and the setup CTA.
  const scheduleDefaults: SaveScheduleValues = activeSchedule
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

  // Whether the active weekly hours generate anything on the selected weekday
  // (drives the day panel's "no slots" explanation).
  const weekdayHasSections = selectedDate
    ? (activeSchedule?.sections.some(
        (s) =>
          s.dayOfWeek === new Date(`${selectedDate}T00:00:00`).getDay()
      ) ?? false)
    : false

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
    <div className="mx-auto max-w-5xl space-y-6 px-4 py-12">
      <nav className="flex items-center justify-between text-sm">
        <Link
          href="/turf-owner"
          className="text-dt-dim hover:text-dt-txt"
        >
          ← {t("turfOwner.backToDashboard")}
        </Link>
        <div className="flex items-center gap-2">
          <Link
            href={`/turfs/${turf.slug}`}
            className="text-dt-green hover:underline"
          >
            {t("turfOwner.publicView")}
          </Link>
          {turf.isVerified ? (
            <StatusBadge status="success" showIcon={false}>
              {t("turfOwner.verified")}
            </StatusBadge>
          ) : (
            <StatusBadge status="warning" showIcon={false}>
              {t("turfOwner.pendingVerification")}
            </StatusBadge>
          )}
        </div>
      </nav>

      <h1 className="font-heading text-2xl font-semibold">{turf.name}</h1>

      <Tabs defaultValue={dateParam || monthParam ? "slots" : "edit"}>
        <TabsList className="h-auto w-full rounded-xl p-1 group-data-horizontal/tabs:h-auto sm:w-auto">
          <TabsTrigger value="edit" className="h-10 gap-2 px-4">
            <InfoIcon aria-hidden />
            {t("turfOwner.tabDetails")}
          </TabsTrigger>
          <TabsTrigger value="slots" className="h-10 gap-2 px-4">
            <CalendarClockIcon aria-hidden />
            {t("turfOwner.tabSlots")}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="edit" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="font-heading text-lg">
                {t("turfOwner.turfDetails")}
              </CardTitle>
              <CardDescription>
                {t("turfOwner.detailsDesc")}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <TurfForm mode="edit" turfId={turf.id} defaultValues={formDefaults} />
            </CardContent>
          </Card>
          <Card>
            <CardHeader className={photos.length === 0 ? "gap-0.5 pb-3" : undefined}>
              <CardTitle
                className={`font-heading ${photos.length === 0 ? "text-sm" : "text-lg"}`}
              >
                {t("turfOwner.photos")}
              </CardTitle>
              <CardDescription
                className={photos.length === 0 ? "text-xs" : undefined}
              >
                {t("turfOwner.photosDesc")}
              </CardDescription>
            </CardHeader>
            <CardContent className={photos.length === 0 ? "pb-3" : undefined}>
              <TurfPhotoGallery turfId={turf.id} photos={photos} />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="slots" className="space-y-6">
          <HowSlotsWork />
          {slotConflicts.length > 0 ? (
            <SlotConflictsCard conflicts={slotConflicts} />
          ) : null}

          {activeSchedule ? (
            <Card>
              <CardHeader>
                <CardTitle className="flex flex-wrap items-center gap-2 font-heading text-lg">
                  {t("turfOwner.schedule.weeklyHours")}
                  <span className="text-xs font-normal text-dt-dim">
                    {t("turfOwner.schedule.activeName", { name: activeSchedule.name })}
                  </span>
                </CardTitle>
                <CardDescription>
                  {t("turfOwner.schedule.weeklyHoursDesc")}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <BookingHorizonSelect
                  turfId={turf.id}
                  defaultDays={turf.bookingHorizonDays}
                />
                <ScheduleBuilderForm
                  turfId={turf.id}
                  defaultValues={scheduleDefaults}
                />
              </CardContent>
            </Card>
          ) : (
            <Card className="border-dt-green/40">
              <CardHeader>
                <CardTitle className="font-heading text-lg">
                  {t("turfOwner.schedule.setupTitle")}
                </CardTitle>
                <CardDescription>
                  {t("turfOwner.schedule.setupDesc")}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ScheduleWizardDialog turfId={turf.id} />
              </CardContent>
            </Card>
          )}

          <DayAdjustments>
            <div className="grid gap-6 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)] lg:items-start">
              <Card>
                <CardHeader>
                  <CardTitle className="font-heading text-lg">
                    {t("turfOwner.schedule.calendarTitle")}
                  </CardTitle>
                  <CardDescription>
                    {t("turfOwner.schedule.calendarDesc")}
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
                <DayPanel
                  turfId={turf.id}
                  month={month}
                  selectedDate={selectedDate}
                  holiday={
                    selectedHoliday
                      ? {
                          name: selectedHoliday.name,
                          approximate: selectedHoliday.approximate,
                        }
                      : null
                  }
                  exception={
                    selectedException
                      ? {
                          isClosed: selectedException.isClosed,
                          reason: selectedException.reason,
                          priceMode: selectedException.priceMode,
                          priceValue: selectedException.priceValue,
                        }
                      : null
                  }
                  isRamadan={isDuringRamadan(selectedDate)}
                  weekdayHasSections={weekdayHasSections}
                  daySlots={daySlots}
                />
              ) : (
                <EmptyDayState />
              )}
            </div>
          </DayAdjustments>

          <SavedSchedulesCard
            turfId={turf.id}
            schedules={savedSchedules}
            today={todayIso}
          />
        </TabsContent>
      </Tabs>
    </div>
  )
}
