import Link from "next/link"
import { MapPinIcon } from "lucide-react"

import { Card, CardContent } from "@/components/ui/card"
import { StatusBadge } from "@/components/shared"

interface TurfCardProps {
  slug: string
  name: string
  area: string | null
  city: string | null
  format: "fives" | "sevens"
  photo: string | null
  distanceKm: number | null
}

export function TurfCard({
  slug,
  name,
  area,
  city,
  format,
  photo,
  distanceKm,
}: TurfCardProps) {
  return (
    <Link href={`/turfs/${slug}`} className="group block">
      <Card size="sm" className="overflow-hidden">
        <div className="aspect-video w-full overflow-hidden bg-muted">
          {photo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={photo}
              alt={name}
              className="size-full object-cover transition-transform group-hover:scale-105"
              loading="lazy"
            />
          ) : (
            <div className="flex size-full items-center justify-center text-xs text-muted-foreground">
              No photo
            </div>
          )}
        </div>
        <CardContent className="space-y-1.5 pt-3">
          <div className="flex items-start justify-between gap-2">
            <h3 className="font-heading text-sm font-semibold leading-tight">
              {name}
            </h3>
            <StatusBadge status="neutral" showIcon={false}>
              {format === "fives" ? "5v5" : "7v7"}
            </StatusBadge>
          </div>
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            <MapPinIcon className="size-3 shrink-0" aria-hidden />
            <span className="truncate">
              {[area, city].filter(Boolean).join(", ") || "Location TBD"}
            </span>
            {distanceKm != null && (
              <span className="ml-auto shrink-0">{distanceKm.toFixed(1)} km</span>
            )}
          </div>
        </CardContent>
      </Card>
    </Link>
  )
}
