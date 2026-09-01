import { getT } from "@/i18n/server"
import { getHomeStats } from "@/features/home/queries"

/** Hero stats row — real platform counters straight from the database. */
export async function StatsStrip() {
  const [t, stats] = await Promise.all([getT(), getHomeStats()])
  const statsRow = [
    { value: stats.turfs, label: t("home.statTurfs") },
    { value: stats.cities, label: t("home.statCities") },
    { value: stats.matchesPlayed, label: t("home.statMatches") },
  ]

  return (
    <dl className="mt-10 grid max-w-md grid-cols-3 gap-4">
      {statsRow.map((s) => (
        <div key={s.label}>
          <dt className="sr-only">{s.label}</dt>
          <dd className="text-2xl font-bold tabular-nums text-dt-txt sm:text-3xl">
            {s.value.toLocaleString("en-US")}
          </dd>
          <dd className="mt-0.5 text-xs text-dt-dim sm:text-sm">
            {s.label}
          </dd>
        </div>
      ))}
    </dl>
  )
}
