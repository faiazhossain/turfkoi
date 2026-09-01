"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { useForm, type Resolver } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"

import { AvatarPicker } from "@/components/player/avatar-picker"
import { PositionPicker, SkillPicker } from "@/components/player/choice-picker"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { StatusBadge } from "@/components/shared"
import { LocationPicker } from "@/components/map"
import { useI18n } from "@/i18n/client"
import { updateProfileAction } from "@/features/player/actions"
import { profileEditFormSchema } from "@/features/player/schemas"
import type { GeoPoint } from "@/db/geo"
import type { PlayerPositionId, PlayerSkillId } from "@/features/player/positions"
import { POSITION_IDS, SKILL_IDS } from "@/features/player/positions"

/** Form-field shape (strings, "" = unchosen) — the server action's schema
 * normalizes and re-validates everything; this is the client mirror. */
interface ProfileEditFormValues {
  name: string
  username: string
  position: string
  secondaryPosition: string
  skill: string
  area: string
  bio: string
  coords: GeoPoint | null
  avatarType?: "photo" | "preset"
  avatarPresetId?: string
}

export interface ProfileEditData {
  name: string | null
  playerId: string | null
  username: string | null
  position: string | null
  secondaryPosition: string | null
  skill: string | null
  area: string | null
  bio: string | null
  coords: GeoPoint | null
  avatarType: string | null
  avatarPublicId: string | null
  avatarPresetId: string | null
}

/** Legacy free text ("MID") is not a chip option — omit it on save so the
 * stored value survives until the player picks a canonical one. */
function canonicalPosition(value: string): PlayerPositionId | undefined {
  return (POSITION_IDS as readonly string[]).includes(value)
    ? (value as PlayerPositionId)
    : undefined
}
function canonicalSkill(value: string): PlayerSkillId | undefined {
  return (SKILL_IDS as readonly string[]).includes(value)
    ? (value as PlayerSkillId)
    : undefined
}

export function ProfileEditForm({
  userId,
  profile,
}: {
  userId: string
  profile: ProfileEditData
}) {
  const router = useRouter()
  const { t } = useI18n()
  const [error, setError] = useState<string | null>(null)
  const [coordsTouched, setCoordsTouched] = useState(false)

  const form = useForm<ProfileEditFormValues>({
    resolver: zodResolver(profileEditFormSchema) as unknown as Resolver<ProfileEditFormValues>,
    defaultValues: {
      name: profile.name ?? "",
      username: profile.username ?? "",
      position: profile.position ?? "",
      secondaryPosition: profile.secondaryPosition ?? "",
      skill: profile.skill ?? "",
      area: profile.area ?? "",
      bio: profile.bio ?? "",
      coords: profile.coords ?? null,
    },
  })

  const bioValue = form.watch("bio") ?? ""

  async function onSubmit(values: ProfileEditFormValues) {
    setError(null)
    const result = await updateProfileAction({
      name: values.name.trim(),
      // "" = untouched (keeps the stored handle); only changes are sent.
      username:
        values.username.trim().replace(/^@/, "") === (profile.username ?? "")
          ? ""
          : values.username.trim(),
      position: canonicalPosition(values.position),
      secondaryPosition:
        values.secondaryPosition === ""
          ? null
          : canonicalPosition(values.secondaryPosition),
      skill: canonicalSkill(values.skill),
      area: values.area.trim(),
      bio: values.bio,
      // Untouched pin -> omit (undefined keeps the stored coords).
      coords: coordsTouched ? (values.coords ?? null) : undefined,
      avatarType: values.avatarType,
      avatarPresetId:
        values.avatarType === "preset" ? values.avatarPresetId : undefined,
    })
    if (!result.ok) {
      setError(t(result.error ?? "errors.generic"))
      return
    }
    router.push("/app/profile")
    router.refresh()
  }

  return (
    <form
      onSubmit={form.handleSubmit(onSubmit)}
      className="space-y-8"
      noValidate
    >
      <section className="rounded-lg border border-border bg-card p-4">
        <AvatarPicker
          userId={userId}
          avatarType={form.watch("avatarType") ?? profile.avatarType}
          avatarPublicId={profile.avatarPublicId}
          avatarPresetId={form.watch("avatarPresetId") ?? profile.avatarPresetId}
          userName={watchedName(form)}
          onPresetSelect={(presetId) => {
            form.setValue("avatarType", "preset", { shouldDirty: true })
            form.setValue("avatarPresetId", presetId, { shouldDirty: true })
          }}
          onPhotoAdopted={() => {
            form.setValue("avatarType", "photo", { shouldDirty: true })
          }}
        />
      </section>

      <section className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="name">{t("profile.edit.nameLabel")}</Label>
          <Input id="name" autoComplete="name" {...form.register("name")} />
          {form.formState.errors.name && (
            <p className="text-sm text-destructive">
              {t(form.formState.errors.name.message ?? "")}
            </p>
          )}
        </div>

        {profile.playerId && (
          <div className="space-y-2">
            <Label htmlFor="playerId">{t("players.playerIdLabel")}</Label>
            <div className="flex items-center gap-2">
              <Input id="playerId" value={profile.playerId} readOnly disabled className="font-mono" />
            </div>
            <p className="text-xs text-muted-foreground">
              {t("players.playerIdPermanent")}
            </p>
          </div>
        )}

        <div className="space-y-2">
          <Label htmlFor="username">{t("players.usernameLabel")}</Label>
          <Input
            id="username"
            autoComplete="off"
            placeholder="@rahim_10"
            {...form.register("username")}
          />
          {form.formState.errors.username && (
            <p className="text-sm text-destructive">
              {t(form.formState.errors.username.message ?? "")}
            </p>
          )}
          <p className="text-xs text-muted-foreground">{t("players.usernameHint")}</p>
        </div>

        <div className="space-y-2">
          <Label>{t("profile.positionLabel")}</Label>
          <PositionPicker
            name="position"
            value={form.watch("position") ?? ""}
            onChange={(v) =>
              form.setValue("position", v, { shouldDirty: true })
            }
          />
        </div>

        <div className="space-y-2">
          <Label>{t("profile.secondaryPositionLabel")}</Label>
          <p className="text-xs text-muted-foreground">
            {t("profile.edit.secondaryHint")}
          </p>
          <PositionPicker
            name="secondaryPosition"
            allowNone
            value={form.watch("secondaryPosition") ?? ""}
            onChange={(v) =>
              form.setValue("secondaryPosition", v, { shouldDirty: true })
            }
          />
        </div>

        <div className="space-y-2">
          <Label>{t("profile.skillLabel")}</Label>
          <SkillPicker
            name="skill"
            value={form.watch("skill") ?? ""}
            onChange={(v) => form.setValue("skill", v, { shouldDirty: true })}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="bio">{t("profile.edit.bioLabel")}</Label>
          <Textarea
            id="bio"
            rows={4}
            maxLength={280}
            placeholder={t("profile.edit.bioPlaceholder")}
            {...form.register("bio")}
          />
          <p className="text-right text-xs tabular-nums text-muted-foreground">
            {t("profile.edit.bioCounter", { count: bioValue.length })}
          </p>
        </div>

        <div className="space-y-2">
          <Label>{t("profile.edit.locationLabel")}</Label>
          <p className="text-xs text-muted-foreground">
            {t("profile.edit.locationHelp")}
          </p>
          <LocationPicker
            value={form.watch("coords") ?? null}
            onChange={(point, place) => {
              setCoordsTouched(true)
              form.setValue("coords", point, { shouldDirty: true })
              // A pick resolves the area — overwrite whatever was there.
              if (place?.name) {
                form.setValue("area", place.name, { shouldDirty: true })
              }
            }}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="area">{t("profile.areaLabel")}</Label>
          <Input id="area" maxLength={80} {...form.register("area")} />
        </div>
      </section>

      {error && <StatusBadge status="danger">{error}</StatusBadge>}

      <Button
        type="submit"
        size="lg"
        className="w-full"
        loading={form.formState.isSubmitting}
      >
        {form.formState.isSubmitting
          ? t("profile.edit.saving")
          : t("common.save")}
      </Button>
    </form>
  )
}

/** Name lives in the form; AvatarPicker wants it for the initials fallback. */
function watchedName(
  form: ReturnType<typeof useForm<ProfileEditFormValues>>
): string | null {
  return form.watch("name") || null
}
