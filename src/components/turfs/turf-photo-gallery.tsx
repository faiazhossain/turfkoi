"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  PlusIcon,
  StarIcon,
  XIcon,
} from "lucide-react"

import { Loader } from "@/components/ui/loader"
import { StatusBadge } from "@/components/shared"
import { useImageUpload } from "@/hooks/use-image-upload"
import { clientImageUrl } from "@/features/images/urls"
import {
  addTurfPhotoAction,
  deleteTurfPhotoAction,
  moveTurfPhotoAction,
  setCoverTurfPhotoAction,
} from "@/features/images/actions"
import { MAX_TURF_PHOTOS } from "@/features/images/constants"
import type { TurfPhoto } from "@/features/turfs/queries"
import { useI18n } from "@/i18n/client"

/**
 * Owner's turf gallery. Every operation persists immediately (server
 * actions) — uploads go compress → signed Cloudinary upload → confirm →
 * insert row. Cover, reorder, and delete act on the confirmed rows.
 */
export function TurfPhotoGallery({
  turfId,
  photos,
}: {
  turfId: string
  photos: TurfPhoto[]
}) {
  const router = useRouter()
  const { t } = useI18n()
  const inputRef = React.useRef<HTMLInputElement>(null)
  const { upload, uploading, error: uploadError } = useImageUpload()
  const [error, setError] = React.useState<string | null>(null)
  const [busyId, setBusyId] = React.useState<string | null>(null)

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return
    setError(null)
    for (const file of Array.from(files)) {
      const publicId = await upload("turf", turfId, file)
      if (!publicId) break // hook error shown below
      const res = await addTurfPhotoAction(turfId, publicId)
      if (!res.ok) {
        setError(t(res.error))
        break
      }
    }
    router.refresh()
    if (inputRef.current) inputRef.current.value = ""
  }

  async function run(photoId: string, op: () => Promise<{ ok: boolean; error?: string }>) {
    setBusyId(photoId)
    setError(null)
    try {
      const res = await op()
      if (!res.ok && res.error) setError(t(res.error))
      router.refresh()
    } finally {
      setBusyId(null)
    }
  }

  const full = photos.length >= MAX_TURF_PHOTOS

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        {photos.map((photo, i) => (
          <div
            key={photo.id}
            className="relative size-24 overflow-hidden rounded-md bg-dt-card2"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={clientImageUrl(photo.publicId, "thumb")}
              alt={
                photo.isCover
                  ? t("turfOwner.photosUi.coverAlt")
                  : t("turfOwner.photosUi.photoAlt")
              }
              className="size-full object-cover"
            />
            {photo.isCover ? (
              <span className="absolute left-0.5 top-0.5 inline-flex items-center gap-0.5 rounded-full bg-dt-bg/80 px-1.5 py-0.5 text-[10px] font-medium">
                <StarIcon className="size-3" aria-hidden />
                {t("turfOwner.photosUi.coverBadge")}
              </span>
            ) : null}
            {busyId === photo.id ? (
              <span className="absolute inset-0 flex items-center justify-center bg-dt-bg/60">
                <Loader size={14} className="size-4" aria-hidden />
              </span>
            ) : null}
            <div className="absolute bottom-0.5 right-0.5 flex items-center gap-0.5">
              <GalleryButton
                label={t("turfOwner.photosUi.moveEarlier")}
                disabled={i === 0 || busyId === photo.id}
                onClick={() =>
                  run(photo.id, () => moveTurfPhotoAction(photo.id, "earlier"))
                }
              >
                <ChevronLeftIcon className="size-3" aria-hidden />
              </GalleryButton>
              <GalleryButton
                label={t("turfOwner.photosUi.moveLater")}
                disabled={i === photos.length - 1 || busyId === photo.id}
                onClick={() =>
                  run(photo.id, () => moveTurfPhotoAction(photo.id, "later"))
                }
              >
                <ChevronRightIcon className="size-3" aria-hidden />
              </GalleryButton>
              <GalleryButton
                label={t("turfOwner.photosUi.setCover")}
                disabled={photo.isCover || busyId === photo.id}
                onClick={() =>
                  run(photo.id, () => setCoverTurfPhotoAction(photo.id))
                }
              >
                <StarIcon className="size-3" aria-hidden />
              </GalleryButton>
              <GalleryButton
                label={t("turfOwner.photosUi.deletePhoto")}
                disabled={busyId === photo.id}
                danger
                onClick={() => run(photo.id, () => deleteTurfPhotoAction(photo.id))}
              >
                <XIcon className="size-3" aria-hidden />
              </GalleryButton>
            </div>
          </div>
        ))}
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={uploading || full}
          className={`flex flex-col items-center justify-center gap-1 rounded-md border border-dashed border-dt-line text-xs text-dt-dim hover:bg-dt-card2 disabled:cursor-not-allowed disabled:opacity-50 ${
            photos.length === 0 ? "size-16" : "size-24"
          }`}
        >
          {uploading ? (
            <Loader size={14} className="size-3.5" aria-hidden />
          ) : (
            <PlusIcon className="size-4" aria-hidden />
          )}
          {uploading
            ? t("turfOwner.photosUi.uploading")
            : full
              ? t("turfOwner.photosUi.maxPhotos")
              : t("common.add")}
        </button>
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/avif"
        multiple
        className="hidden"
        onChange={(e) => handleFiles(e.target.files)}
      />
      <p className="text-xs text-dt-dim">
        {t("turfOwner.photosUi.help")}
      </p>
      {uploadError ? (
        <StatusBadge status="danger">{t(uploadError)}</StatusBadge>
      ) : null}
      {error ? <StatusBadge status="danger">{error}</StatusBadge> : null}
    </div>
  )
}

function GalleryButton({
  children,
  label,
  onClick,
  disabled,
  danger,
}: {
  children: React.ReactNode
  label: string
  onClick: () => void
  disabled?: boolean
  danger?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className={
        "inline-flex size-5 items-center justify-center rounded-full bg-dt-bg/85 disabled:opacity-40 " +
        (danger ? "text-destructive hover:text-destructive" : "text-dt-txt hover:text-dt-txt")
      }
    >
      {children}
    </button>
  )
}
