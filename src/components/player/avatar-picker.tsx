"use client"

import * as React from "react"
import { CheckIcon } from "lucide-react"

import { AvatarField } from "@/components/player/avatar-field"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { useI18n } from "@/i18n/client"
import { cn } from "@/lib/utils"
import { AVATAR_SERIES_LABEL } from "@/i18n/labels"
import {
  AVATARS_BY_SERIES,
  AVATAR_CATALOG_VERSION,
  AVATAR_SERIES,
  getPresetAvatar,
  type AvatarSeries,
} from "@/features/player/avatar-catalog"

/**
 * Player identity picker: preset badge grid (inanimate football imagery
 * only — see avatar-catalog.ts) or the existing Cloudinary photo upload.
 * Selection is form state; presets persist on Save, photos persist on
 * upload (existing immediate-persist behavior).
 */
export function AvatarPicker({
  userId,
  avatarType,
  avatarPublicId,
  avatarPresetId,
  userName,
  onPresetSelect,
  onPhotoAdopted,
}: {
  userId: string
  avatarType?: string | null
  avatarPublicId?: string | null
  avatarPresetId?: string | null
  userName?: string | null
  onPresetSelect: (presetId: string) => void
  onPhotoAdopted: () => void
}) {
  const { t } = useI18n()
  const [mode, setMode] = React.useState<"preset" | "photo">(() =>
    avatarType === "preset" ? "preset" : "photo"
  )
  const [series, setSeries] = React.useState<AvatarSeries>(() => {
    const current = avatarPresetId ? getPresetAvatar(avatarPresetId) : null
    return current?.series ?? "football"
  })

  return (
    <div className="space-y-3">
      <div>
        <h3 className="font-heading text-lg font-semibold">
          {t("profile.avatar.pickerHeading")}
        </h3>
        <p className="text-sm text-dt-dim">
          {t("profile.avatar.pickerDesc")}
        </p>
      </div>

      <Tabs
        value={mode}
        onValueChange={(v) => setMode(v as "preset" | "photo")}
        className="gap-3"
      >
        <TabsList className="w-full max-w-xs">
          <TabsTrigger value="preset" className="flex-1">
            {t("profile.avatar.usePreset")}
          </TabsTrigger>
          <TabsTrigger value="photo" className="flex-1">
            {t("profile.avatar.usePhoto")}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="preset" className="space-y-3">
          <div className="overflow-x-auto pb-1">
            <Tabs
              value={series}
              onValueChange={(v) => setSeries(v as AvatarSeries)}
            >
              <TabsList variant="line" className="min-w-max">
                {AVATAR_SERIES.map((s) => (
                  <TabsTrigger key={s} value={s}>
                    {t(AVATAR_SERIES_LABEL[s])}
                  </TabsTrigger>
                ))}
              </TabsList>
              {AVATAR_SERIES.map((s) => (
                <TabsContent key={s} value={s}>
                  <PresetGrid
                    series={s}
                    selectedId={avatarType === "preset" ? avatarPresetId : null}
                    onSelect={onPresetSelect}
                  />
                </TabsContent>
              ))}
            </Tabs>
          </div>
        </TabsContent>

        <TabsContent value="photo" className="space-y-3">
          <AvatarField
            userId={userId}
            avatarType={avatarType}
            avatarPublicId={avatarPublicId}
            avatarPresetId={avatarPresetId}
            userName={userName}
            onUploaded={onPhotoAdopted}
          />
          <p className="text-xs text-dt-dim">
            {t("profile.avatar.photoHint")}
          </p>
        </TabsContent>
      </Tabs>
    </div>
  )
}

function PresetGrid({
  series,
  selectedId,
  onSelect,
}: {
  series: AvatarSeries
  selectedId: string | null | undefined
  onSelect: (presetId: string) => void
}) {
  const { t } = useI18n()
  return (
    <fieldset>
      <legend className="sr-only">{t("profile.avatar.gridAria")}</legend>
      <div className="grid grid-cols-4 gap-2 sm:grid-cols-6">
        {AVATARS_BY_SERIES[series].map((preset) => {
          const selected = selectedId === preset.id
          return (
            <label key={preset.id} className="relative cursor-pointer">
              <input
                type="radio"
                name="avatar-preset"
                value={preset.id}
                checked={selected}
                onChange={() => onSelect(preset.id)}
                aria-label={t(preset.labelKey)}
                className="peer sr-only"
              />
              <span
                aria-hidden
                className={cn(
                  "block aspect-square overflow-hidden rounded-xl border transition-all",
                  "peer-focus-visible:ring-[3px] peer-focus-visible:ring-ring/50 peer-focus-visible:outline-1 peer-focus-visible:outline-ring",
                  selected
                    ? "border-dt-green shadow-[0_0_0_4px] shadow-dt-green/20"
                    : "border-dt-line hover:border-dt-green/40"
                )}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={`${preset.file}?v=${AVATAR_CATALOG_VERSION}`}
                  alt={t(preset.labelKey)}
                  className="size-full object-cover"
                  loading="lazy"
                  decoding="async"
                />
              </span>
              {selected ? (
                <span className="absolute right-1 bottom-1 grid size-5 place-items-center rounded-full bg-dt-green text-dt-ink shadow-med">
                  <CheckIcon className="size-3" aria-hidden />
                </span>
              ) : null}
            </label>
          )
        })}
      </div>
    </fieldset>
  )
}
