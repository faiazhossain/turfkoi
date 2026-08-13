import Link from "next/link"
import { MapPinIcon, SearchIcon } from "lucide-react"

import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { EmptyState, StatusBadge } from "@/components/shared"
import { TurfCard } from "@/components/turfs"
import { listTurfs, type ListTurfsFilter } from "@/features/turfs/queries"

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
  if (sp.format === "fives" || sp.format === "sevens") filter.format = sp.format
  return filter
}

export default async function TurfsPage({ searchParams }: PageProps) {
  const sp = await searchParams
  const filter = parseFilter(sp)
  const turfs = await listTurfs(filter)
  const hasFilter = Boolean(sp.area || sp.lat || sp.format)

  return (
    <div className="mx-auto max-w-6xl space-y-6 px-4 py-12">
      <header className="space-y-2">
        <h1 className="font-heading text-3xl font-semibold tracking-tight">
          Find a turf
        </h1>
        <p className="text-sm text-muted-foreground">
          Browse verified turfs across Bangladesh. Map-based discovery arrives
          in Phase 3 — for now, filter by area and distance.
        </p>
      </header>

      <form className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-48 flex-1">
          <SearchIcon
            className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <Input
            name="area"
            defaultValue={sp.area ?? ""}
            placeholder="Area, e.g. Dhanmondi"
            className="pl-8"
          />
        </div>
        <Input
          name="lat"
          type="hidden"
          defaultValue={sp.lat ?? ""}
        />
        <Input
          name="lng"
          type="hidden"
          defaultValue={sp.lng ?? ""}
        />
        <Input
          name="radius"
          type="hidden"
          defaultValue={sp.radius ?? "10"}
        />
        <Button type="submit" variant="outline">
          Search
        </Button>
        {hasFilter ? (
          <Button type="button" variant="ghost" render={<Link href="/turfs" />}>
            Clear
          </Button>
        ) : null}
      </form>

      {turfs.length === 0 ? (
        <EmptyState
          icon={MapPinIcon}
          title="No turfs match your search"
          description={
            hasFilter
              ? "Try a wider area or clear the filters."
              : "Verified turfs will appear here once turf owners list them."
          }
        />
      ) : (
        <>
          <div className="flex items-center gap-2">
            <StatusBadge status="neutral" showIcon={false}>
              {turfs.length} turf{turfs.length === 1 ? "" : "s"}
            </StatusBadge>
          </div>
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
