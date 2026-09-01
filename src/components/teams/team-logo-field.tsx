"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { ImageIcon } from "lucide-react"

import { Loader } from "@/components/ui/loader"
import { StatusBadge } from "@/components/shared"
import { useImageUpload } from "@/hooks/use-image-upload"
import { clientImageUrl } from "@/features/images/urls"
import { setTeamLogoAction } from "@/features/images/actions"
import { useI18n } from "@/i18n/client"

/**
 * Team logo picker (single image, immediate persist). Replacing the logo
 * retires the old Cloudinary asset server-side.
 */
export function TeamLogoField({
  teamId,
  logoPublicId,
}: {
  teamId: string
  logoPublicId: string | null
}) {
  const router = useRouter()
  const { t } = useI18n()
  const inputRef = React.useRef<HTMLInputElement>(null)
  const { upload, uploading, error: uploadError } = useImageUpload()

  async function handleFile(file: File | undefined) {
    if (!file) return
    const publicId = await upload("team", teamId, file)
    if (!publicId) return // hook error surfaced below
    const res = await setTeamLogoAction(teamId, publicId)
    if (!res.ok) {
      return // error via StatusBadge below is set by upload hook only; show toast-free inline
    }
    router.refresh()
  }

  return (
    <div className="space-y-2">
      <label className="block text-sm font-medium">{t("team.logoLabel")}</label>
      <div className="flex items-center gap-3">
        <div className="flex size-16 items-center justify-center overflow-hidden rounded-lg bg-dt-card2">
          {logoPublicId ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={clientImageUrl(logoPublicId, "thumb")}
              alt={t("team.logoAltText")}
              className="size-full object-cover"
            />
          ) : (
            <ImageIcon className="size-5 text-dt-dim" aria-hidden />
          )}
        </div>
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={uploading}
          className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-dt-line px-3 text-sm hover:bg-dt-card2/50 disabled:opacity-50"
        >
          {uploading ? (
            <Loader size={14} className="size-3.5" aria-hidden />
          ) : null}
          {uploading ? t("team.uploading") : logoPublicId ? t("team.changeLogo") : t("team.uploadLogo")}
        </button>
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/avif"
        className="hidden"
        onChange={(e) => {
          handleFile(e.target.files?.[0])
          if (inputRef.current) inputRef.current.value = ""
        }}
      />
      {uploadError ? <StatusBadge status="danger">{t(uploadError)}</StatusBadge> : null}
    </div>
  )
}
