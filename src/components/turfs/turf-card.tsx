import Link from "next/link"
import { MapPinIcon } from "lucide-react"

import { getT } from "@/i18n/server"
import { Card, CardContent } from "@/components/ui/card"
import { StatusBadge } from "@/components/shared"
import { turfFormatShort, type TurfFormat } from "@/features/turfs/formats"
import { clientImageUrl } from "@/features/images/urls"

interface TurfCardProps {
  slug: string
  name: string
  area: string | null
  city: string | null
  format: TurfFormat
  /** Cloudinary public id of the cover photo. */
  photo: string | null
  distanceKm: number | null
}

export async function TurfCard({
  slug,
  name,
  area,
  city,
  format,
  photo,
  distanceKm,
}: TurfCardProps) {
  const t = await getT()
  return (
    <Link href={`/turfs/${slug}`} className="group block">
      <Card size="sm" className="overflow-hidden">
        <div className="aspect-video w-full overflow-hidden bg-muted">
          {photo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={clientImageUrl(photo, "card")}
              alt={name}
              className="size-full object-cover transition-transform group-hover:scale-105"
              loading="lazy"
            />
          ) : (
            <div className="flex size-full items-center justify-center text-xs text-muted-foreground">
              {t("turfs.noPhoto")}
            </div>
          )}
        </div>
        <CardContent className="space-y-1.5 pt-3">
          <div className="flex items-start justify-between gap-2">
            <h3 className="font-heading text-sm font-semibold leading-tight">
              {name}
            </h3>
            <StatusBadge status="neutral" showIcon={false}>
              {turfFormatShort(format)}
            </StatusBadge>
          </div>
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            <MapPinIcon className="size-3 shrink-0" aria-hidden />
            <span className="truncate">
              {[area, city].filter(Boolean).join(", ") || t("turfs.locationTbd")}
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
