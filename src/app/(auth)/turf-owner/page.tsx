import Link from "next/link"
import { redirect } from "next/navigation"
import type { Metadata } from "next"
import { CalendarClockIcon, PlusIcon, MegaphoneIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { EmptyState } from "@/components/shared"
import { KpiTile, PromoteSlotButton, MyTurfCard } from "@/components/turfs"
import { getCurrentUser } from "@/lib/auth"
import {
  getOwnerKPIs,
  listMyTurfs,
  listOwnerFillableSlots,
} from "@/features/turfs/queries"
import { getT } from "@/i18n/server"
import { buildMetadata } from "@/i18n/metadata"

export async function generateMetadata(): Promise<Metadata> {
  return buildMetadata({ titleKey: "metadata.turfOwnerDashboardTitle" })
}

function fmtBdt(n: number) {
  return `৳${n.toLocaleString()}`
}

export default async function TurfOwnerDashboardPage() {
  const t = await getT()
  const user = await getCurrentUser()
  if (!user) redirect("/login")
  if (!user.roles.includes("turf_owner")) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-16">
        <EmptyState
          title={t("turfOwner.notOwnerTitle")}
          description={t("turfOwner.notOwnerDesc")}
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
            {t("turfOwner.title")}
          </h1>
          <p className="text-sm text-muted-foreground">
            {myTurfs.length === 1
              ? t("turfOwner.turfCountOne")
              : t("turfOwner.turfCountMany", { count: myTurfs.length })}
          </p>
        </div>
        <Button render={<Link href="/turf-owner/turfs/new" />}>
          <PlusIcon aria-hidden />
          {t("turfOwner.addTurf")}
        </Button>
      </header>

      <section className="grid gap-3 sm:grid-cols-2 md:grid-cols-4">
        <KpiTile
          label={t("turfOwner.kpis.todaysRevenue")}
          value={fmtBdt(kpis.todaysRevenue)}
          hint={
            kpis.todaysBookings === 1
              ? t("turfOwner.kpis.todaysBookingsOne")
              : t("turfOwner.kpis.todaysBookingsMany", {
                  count: kpis.todaysBookings,
                })
          }
        />
        <KpiTile
          label={t("turfOwner.kpis.upcoming7")}
          value={kpis.upcomingBookings}
          hint={t("turfOwner.kpis.confirmedBookings")}
        />
        <KpiTile
          label={t("turfOwner.kpis.openSlots7")}
          value={kpis.availableSlots}
          hint={t("turfOwner.kpis.availableToBook")}
        />
        <KpiTile
          label={t("turfOwner.kpis.occupancy7")}
          value={`${kpis.occupancyPct}%`}
          hint={t("turfOwner.kpis.occupancyHint")}
        />
      </section>

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-heading text-lg font-semibold">
            {t("turfOwner.myTurfs")}
          </h2>
        </div>
        {myTurfs.length === 0 ? (
          <EmptyState
            icon={PlusIcon}
            title={t("turfOwner.listFirstTurf")}
            description={t("turfOwner.listFirstDesc")}
            action={
              <Button render={<Link href="/turf-owner/turfs/new" />}>
                {t("turfOwner.addTurf")}
              </Button>
            }
          />
        ) : (
          <ul className="grid gap-4 sm:grid-cols-2">
            {myTurfs.map((turf) => (
              <li key={turf.id}>
                <MyTurfCard
                  id={turf.id}
                  name={turf.name}
                  area={turf.area}
                  city={turf.city}
                  format={turf.format}
                  isVerified={turf.isVerified}
                  photo={turf.photo}
                />
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="space-y-3">
        <div className="flex items-center gap-2">
          <MegaphoneIcon className="size-5 text-primary" aria-hidden />
          <h2 className="font-heading text-lg font-semibold">
            {t("turfOwner.fillThisSlot")}
          </h2>
        </div>
        <p className="text-sm text-muted-foreground">{t("turfOwner.fillDesc")}</p>
        {fillable.length === 0 ? (
          <EmptyState
            icon={CalendarClockIcon}
            title={t("turfOwner.noFillableTitle")}
            description={t("turfOwner.noFillableDesc")}
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
                    {t("turfOwner.potentialRevenue")}{" "}
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
