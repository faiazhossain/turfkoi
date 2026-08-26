import { getT } from "@/i18n/server"

/** Hero stats row. Marketing placeholders — edit in the dictionaries. */
export async function StatsStrip() {
  const t = await getT()
  const stats = [
    { value: t("home.statTurfsValue"), label: t("home.statTurfs") },
    { value: t("home.statCitiesValue"), label: t("home.statCities") },
    { value: t("home.statSlotsValue"), label: t("home.statSlots") },
  ]

  return (
    <dl className="mt-10 grid max-w-md grid-cols-3 gap-4">
      {stats.map((s) => (
        <div key={s.label}>
          <dt className="sr-only">{s.label}</dt>
          <dd className="text-2xl font-bold tabular-nums text-foreground sm:text-3xl">
            {s.value}
          </dd>
          <dd className="mt-0.5 text-xs text-muted-foreground sm:text-sm">
            {s.label}
          </dd>
        </div>
      ))}
    </dl>
  )
}
