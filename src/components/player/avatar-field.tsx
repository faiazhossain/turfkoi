"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"

import { Loader } from "@/components/ui/loader"
import { PlayerAvatar } from "@/components/player/player-avatar"
import { StatusBadge } from "@/components/shared"
import { useI18n } from "@/i18n/client"
import { useImageUpload } from "@/hooks/use-image-upload"
import { setPlayerAvatarAction } from "@/features/images/actions"
import {
  resolveAvatarDisplay,
  type AvatarDisplay,
} from "@/features/player/avatar"

/**
 * Player photo upload (single image, immediate persist, square crop).
 * The preview renders whichever mode is active (photo / preset / initials);
 * uploading always switches the account to photo mode.
 */
export function AvatarField({
  userId,
  avatarType,
  avatarPublicId,
  avatarPresetId,
  userName,
  onUploaded,
}: {
  userId: string
  avatarType?: string | null
  avatarPublicId?: string | null
  avatarPresetId?: string | null
  userName?: string | null
  /** Called after a successful upload + persist (e.g. to sync form state). */
  onUploaded?: () => void
}) {
  const router = useRouter()
  const { t } = useI18n()
  const inputRef = React.useRef<HTMLInputElement>(null)
  const { upload, uploading, error: uploadError } = useImageUpload()

  const display: AvatarDisplay = resolveAvatarDisplay({
    avatarType,
    avatarPublicId,
    avatarPresetId,
    name: userName,
  })
  const previewAlt =
    display.kind === "preset"
      ? t(display.labelKey)
      : display.kind === "photo"
        ? t(display.altKey)
        : undefined

  async function handleFile(file: File | undefined) {
    if (!file) return
    const publicId = await upload("player", userId, file)
    if (!publicId) return
    const res = await setPlayerAvatarAction(publicId)
    if (!res.ok) {
      toast.error(t(res.error ?? "errors.generic"))
      return
    }
    onUploaded?.()
    router.refresh()
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-4">
        <PlayerAvatar
          display={display}
          size="lg"
          alt={previewAlt}
        />
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
