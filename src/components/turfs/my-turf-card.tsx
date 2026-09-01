import Link from "next/link"
import { ChevronRightIcon, MapPinIcon } from "lucide-react"

import { getT } from "@/i18n/server"
import { StatusBadge } from "@/components/shared"
import { turfFormatShort, type TurfFormat } from "@/features/turfs/formats"
import { clientImageUrl } from "@/features/images/urls"

interface MyTurfCardProps {
  id: string
  name: string
  area: string | null
  city: string | null
  format: TurfFormat
  isVerified: boolean
  /** Cloudinary public id of the cover photo. */
  photo: string | null
}

/**
 * Owner dashboard "My turfs" card. Richer than the public TurfCard — the
 * owner is scanning his own inventory, so each turf gets its cover photo,
 * verification state, and a direct manage affordance. The whole card links
 * to the manage page.
 */
export async function MyTurfCard({
  id,
  name,
  area,
  city,
  format,
  isVerified,
  photo,
}: MyTurfCardProps) {
  const t = await getT()
  return (
    <Link
      href={`/turf-owner/turfs/${id}`}
      className="group block overflow-hidden rounded-xl border border-dt-line bg-dt-card transition-all duration-200 hover:-translate-y-1 hover:border-dt-green/50 hover:shadow-high"
    >
      <div className="relative aspect-video w-full overflow-hidden bg-dt-card2">
        {photo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={clientImageUrl(photo, "card")}
            alt={name}
            className="size-full object-cover transition-transform duration-300 group-hover:scale-105"
            loading="lazy"
          />
        ) : (
          <div className="flex size-full items-center justify-center bg-gradient-to-br from-dt-green/15 to-transparent text-xs text-dt-dim">
            {t("turfs.noPhoto")}
          </div>
        )}
        {/* Fade behind the badges keeps them legible on any photo. */}
        <div className="pointer-events-none absolute inset-x-0 top-0 h-14 bg-gradient-to-b from-black/60 to-transparent" />
        <div className="absolute left-2.5 top-2.5">
          {isVerified ? (
            <StatusBadge
              status="success"
              showIcon={false}
              className="shadow-low"
            >
              {t("turfOwner.verified")}
            </StatusBadge>
          ) : (
            <StatusBadge
              status="warning"
              showIcon={false}
              className="shadow-low"
            >
              {t("turfOwner.pendingVerification")}
            </StatusBadge>
          )}
        </div>
        <div className="absolute bottom-2.5 right-2.5">
          <StatusBadge status="neutral" showIcon={false}>
            {turfFormatShort(format)}
          </StatusBadge>
        </div>
      </div>
      <div className="flex items-center justify-between gap-3 p-4 pt-3">
        <div className="min-w-0">
          <h3 className="truncate font-heading text-base font-semibold leading-tight transition-colors group-hover:text-dt-green">
            {name}
          </h3>
          <div className="mt-1 flex items-center gap-1 text-xs text-dt-dim">
            <MapPinIcon className="size-3 shrink-0" aria-hidden />
            <span className="truncate">
              {[area, city].filter(Boolean).join(", ") ||
                t("turfs.locationTbd")}
            </span>
          </div>
        </div>
        <span className="flex shrink-0 items-center gap-1 rounded-md border border-dt-line px-2.5 py-1.5 text-xs font-medium text-dt-green transition-colors group-hover:border-dt-green/50 group-hover:bg-dt-green/10">
          {t("turfOwner.manage")}
          <ChevronRightIcon
            className="size-3.5 transition-transform group-hover:translate-x-0.5"
            aria-hidden
          />
        </span>
      </div>
    </Link>
  )
}
