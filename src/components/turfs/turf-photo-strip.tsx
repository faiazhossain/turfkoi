"use client"

import * as React from "react"

import { clientImageUrl } from "@/features/images/urls"
import type { TurfPhoto } from "@/features/turfs/queries"

/**
 * Public turf gallery: hero (large, 1600px variant) + thumbnail strip that
 * switches the hero on click. No carousel lib needed; thumbnails load the
 * 400px variant so the strip itself stays light.
 */
export function TurfPhotoStrip({
  name,
  photos,
}: {
  name: string
  photos: TurfPhoto[]
}) {
  const [activeId, setActiveId] = React.useState(photos[0]?.id ?? null)
  const active = photos.find((p) => p.id === activeId) ?? photos[0]

  if (!active) return null

  return (
    <div className="space-y-2">
      <div className="aspect-video w-full overflow-hidden rounded-xl bg-dt-card2">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={clientImageUrl(active.publicId, "hero")}
          alt={name}
          className="size-full object-cover"
        />
      </div>
      {photos.length > 1 ? (
        <div className="flex gap-2 overflow-x-auto pb-1">
          {photos.map((photo) => (
            <button
              key={photo.id}
              type="button"
              onClick={() => setActiveId(photo.id)}
              aria-label={`Show photo ${photo.publicId.slice(-6)}`}
              aria-current={photo.id === active.id}
              className={
                "size-16 shrink-0 overflow-hidden rounded-md border-2 transition-colors " +
                (photo.id === active.id
                  ? "border-dt-green"
                  : "border-transparent hover:border-dt-line")
              }
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={clientImageUrl(photo.publicId, "thumb")}
                alt=""
                loading="lazy"
                className="size-full object-cover"
              />
            </button>
          ))}
        </div>
      ) : null}
    </div>
  )
}
