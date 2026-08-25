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
import { StatusBadge } from "@/components/shared"
import {
  AdvancedTools,
  BookingHorizonSelect,
  DayAdjustments,
  DayPanel,
  EmptyDayState,
  GenerateSlotsForm,
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

      <Tabs defaultValue={dateParam || monthParam ? "slots" : "edit"}>
        <TabsList>
          <TabsTrigger value="edit">Details</TabsTrigger>
          <TabsTrigger value="slots">Slots</TabsTrigger>
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
          <HowSlotsWork />
          {slotConflicts.length > 0 ? (
            <SlotConflictsCard conflicts={slotConflicts} />
          ) : null}

          {activeSchedule ? (
            <Card>
              <CardHeader>
                <CardTitle className="flex flex-wrap items-center gap-2 font-heading text-lg">
                  Weekly hours
                  <span className="text-xs font-normal text-muted-foreground">
                    Active: {activeSchedule.name}
                  </span>
                </CardTitle>
                <CardDescription>
                  <span className="block">
                    Set once — it repeats every week forever. Nothing expires
                    unless you edit it.
                  </span>
                  <span lang="bn" className="block">
                    একবার সেট করুন — এটি সাবার সাপ্তাহ চলতে থাকবে। আপনি না
                    বদলালে কিছুই পরিবর্তন হয় না।
                  </span>
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
            <Card className="border-primary/40">
              <CardHeader>
                <CardTitle className="font-heading text-lg">
                  Set up weekly hours
                </CardTitle>
                <CardDescription>
                  <span className="block">
                    Your turf doesn&apos;t have a weekly schedule yet, so there
                    are no booking slots available. Answer a few quick
                    questions about your prices, opening hours, and breaks, and
                    we&apos;ll set up the whole week for you.
                  </span>
                  <span
                    lang="bn"
                    className="block pt-1 font-medium text-foreground"
                  >
                    সাপ্তাহিক সময়সূচি সেট করুন
                  </span>
                  <span lang="bn" className="block">
                    আপনার টার্ফের সাপ্তাহিক সময়সূচি এখনো সেট করা হয়নি, তাই
                    বুকিংয়ের জন্য কোনো স্লট নেই। দাম, খোলার সময় এবং বিরতি
                    সম্পর্কে কয়েকটি সহজ প্রশ্নের উত্তর দিন—আমরা আপনার জন্য
                    পুরো সপ্তাহের সময়সূচি তৈরি করে দেব।
                  </span>
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
                    Availability calendar
                  </CardTitle>
                  <CardDescription>
                    Tap a day to see and edit its slots. Ringed days are public
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

          <AdvancedTools>
            <SavedSchedulesCard
              turfId={turf.id}
              schedules={savedSchedules}
              today={todayIso}
            />
            <Card>
              <CardHeader>
                <CardTitle className="font-heading text-lg">
                  Bulk generate (legacy)
                </CardTitle>
                <CardDescription>
                  Only for turfs without weekly hours. Prefer weekly hours —
                  it auto-fills the next 30 days.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <GenerateSlotsForm turfId={turf.id} />
              </CardContent>
            </Card>
          </AdvancedTools>
        </TabsContent>
      </Tabs>
    </div>
  )
}
