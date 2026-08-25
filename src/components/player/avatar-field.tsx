"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { UserRoundIcon } from "lucide-react"

import { Loader } from "@/components/ui/loader"
import { StatusBadge } from "@/components/shared"
import { useI18n } from "@/i18n/client"
import { useImageUpload } from "@/hooks/use-image-upload"
import { clientImageUrl } from "@/features/images/urls"
import { setPlayerAvatarAction } from "@/features/images/actions"

/** Player avatar picker (single image, immediate persist, square crop). */
export function AvatarField({
  userId,
  avatarPublicId,
}: {
  userId: string
  avatarPublicId: string | null
}) {
  const router = useRouter()
  const { t } = useI18n()
  const inputRef = React.useRef<HTMLInputElement>(null)
  const { upload, uploading, error: uploadError } = useImageUpload()

  async function handleFile(file: File | undefined) {
    if (!file) return
    const publicId = await upload("player", userId, file)
    if (!publicId) return
    const res = await setPlayerAvatarAction(publicId)
    if (!res.ok) return
    router.refresh()
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-4">
        <div className="flex size-16 items-center justify-center overflow-hidden rounded-full bg-muted">
          {avatarPublicId ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={clientImageUrl(avatarPublicId, "avatar")}
              alt={t("settings.avatarAlt")}
              className="size-full object-cover"
            />
          ) : (
            <UserRoundIcon className="size-6 text-muted-foreground" aria-hidden />
          )}
        </div>
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={uploading}
          className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-border px-3 text-sm hover:bg-muted/50 disabled:opacity-50"
        >
          {uploading ? (
            <Loader size={14} className="size-3.5" aria-hidden />
          ) : null}
          {uploading
            ? t("settings.uploading")
            : avatarPublicId
              ? t("settings.changePhoto")
              : t("settings.uploadPhoto")}
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
      {uploadError ? (
        <StatusBadge status="danger">{t(uploadError)}</StatusBadge>
      ) : null}
    </div>
  )
}
