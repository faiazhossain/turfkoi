import { MapPinIcon } from "lucide-react"

import { getT } from "@/i18n/server"
import { buildMetadata } from "@/i18n/metadata"
import { EmptyState, StatusBadge } from "@/components/shared"
import { MapView } from "@/components/map"
import { AreaSearch, TurfCard } from "@/components/turfs"
import { listTurfs, listTurfAreas, type ListTurfsFilter } from "@/features/turfs/queries"
import { isTurfFormat } from "@/features/turfs/formats"

export async function generateMetadata() {
  return buildMetadata({
    titleKey: "metadata.turfsTitle",
    descriptionKey: "metadata.turfsDescription",
  })
}

interface PageProps {
  searchParams: Promise<{
    area?: string
    lat?: string
    lng?: string
    radius?: string
    format?: string
  }>
}

function parseFilter(
  sp: Awaited<PageProps["searchParams"]>
): ListTurfsFilter {
  const filter: ListTurfsFilter = {}
  if (sp.area) filter.area = sp.area
  const lat = sp.lat ? Number(sp.lat) : NaN
  const lng = sp.lng ? Number(sp.lng) : NaN
  if (Number.isFinite(lat) && Number.isFinite(lng)) {
    filter.coords = { lat, lng }
  }
  if (sp.radius) filter.radiusKm = Number(sp.radius)
  if (sp.format && isTurfFormat(sp.format)) filter.format = sp.format
  return filter
}

export default async function TurfsPage({ searchParams }: PageProps) {
  const sp = await searchParams
  const filter = parseFilter(sp)
  const [turfs, areas, t] = await Promise.all([
    listTurfs(filter),
    listTurfAreas(),
    getT(),
  ])
  const hasFilter = Boolean(sp.area || sp.lat || sp.format)

  return (
    <div className="mx-auto max-w-6xl space-y-6 px-4 py-12">
      <header className="space-y-2">
        <h1 className="font-heading text-3xl font-semibold tracking-tight">
          {t("turfs.title")}
        </h1>
        <p className="text-sm text-dt-dim">{t("turfs.subtitle")}</p>
      </header>

      <AreaSearch
        areas={areas}
        defaultValue={sp.area ?? ""}
        hasFilter={hasFilter}
      />

      {turfs.length === 0 ? (
        <EmptyState
          icon={MapPinIcon}
          title={t("turfs.emptyTitle")}
          description={
            hasFilter ? t("turfs.emptyFiltered") : t("turfs.emptyDefault")
          }
        />
      ) : (
        <>
          <div className="flex items-center gap-2">
            <StatusBadge status="neutral" showIcon={false}>
              {t(turfs.length === 1 ? "turfs.countOne" : "turfs.countMany", {
                count: turfs.length,
              })}
            </StatusBadge>
          </div>
          <MapView
            ariaLabel={t("turfs.mapAria")}
            className="h-80"
            markers={turfs.map((t) => ({
              id: t.id,
              lat: t.lat,
              lng: t.lng,
              label: t.name,
              href: `/turfs/${t.slug}`,
              kind: "turf" as const,
            }))}
          />
          <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-3">
            {turfs.map((t) => (
              <TurfCard key={t.id} {...t} />
            ))}
          </div>
        </>
      )}
    </div>
  )
}
