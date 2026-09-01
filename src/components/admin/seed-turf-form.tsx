"use client"

import { useState } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { StatusBadge } from "@/components/shared"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { LocationPicker } from "@/components/map"
import { InvitePanel } from "./invite-panel"
import { isValidPhone } from "@/features/auth/phone"
import { useI18n } from "@/i18n/client"

import { seedTurfAction } from "@/features/turf-claims/actions"
import {
  seedTurfSchema,
  type SeedTurfValues,
} from "@/features/turf-claims/schemas"
import { TURF_FORMATS, turfFormatLabel, type TurfFormat } from "@/features/turfs/formats"

function slugify(s: string) {
  return s
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, "")
    .replace(/[\s_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
}

const FORMAT_OPTIONS = TURF_FORMATS

/**
 * Admin concierge seeding: capture just enough to identify the turf (name,
 * pin, area). The real owner completes the listing after claiming via the
 * invite link that appears right after seeding.
 */
export function SeedTurfForm() {
  const { t } = useI18n()
  const [serverError, setServerError] = useState<string | null>(null)
  const [seededId, setSeededId] = useState<string | null>(null)
  // Owner phone is required so every invite gets the OTP login flow — the
  // claim link is always delivered to a known WhatsApp number.
  const [ownerPhone, setOwnerPhone] = useState("")
  const [phoneError, setPhoneError] = useState<string | null>(null)

  const form = useForm<SeedTurfValues>({
    resolver: zodResolver(seedTurfSchema),
    defaultValues: {
      name: "",
      slug: "",
      description: "",
      coords: { lat: 23.8103, lng: 90.4125 }, // Dhaka default
      format: "fives",
      city: "",
      area: "",
      address: "",
    },
  })

  async function onSubmit(values: SeedTurfValues) {
    setServerError(null)
    const trimmed = ownerPhone.trim()
    if (!trimmed) {
      setPhoneError(t("admin.invite.phoneRequired"))
      return
    }
    if (!isValidPhone(trimmed)) {
      setPhoneError(t("auth.errors.phone_invalid"))
      return
    }
    setPhoneError(null)
    const res = await seedTurfAction(values)
    if (!res.ok) {
      setServerError(res.error)
      return
    }
    setSeededId(res.id ?? null)
  }

  if (seededId) {
    return (
      <div className="space-y-4">
        <StatusBadge status="success">
          {t("admin.seed.seededBadge")}
        </StatusBadge>
        <InvitePanel turfId={seededId} defaultOpen defaultPhone={ownerPhone.trim()} />
      </div>
    )
  }

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
      <section className="space-y-3">
        <h3 className="font-heading text-sm font-semibold">{t("admin.seed.basics")}</h3>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label={t("ownATurf.turfName")} error={form.formState.errors.name?.message}>
            <Input
              {...form.register("name")}
              onChange={(e) => {
                form.setValue("name", e.target.value)
                form.setValue("slug", slugify(e.target.value))
              }}
            />
          </Field>
          <Field label={t("team.form.slugLabel")} error={form.formState.errors.slug?.message}>
            <Input {...form.register("slug")} placeholder="my-turf" />
          </Field>
        </div>
        <Field label={t("admin.seed.descriptionOptional")}>
          <Textarea
            {...form.register("description")}
            rows={3}
            placeholder={t("admin.seed.descriptionPlaceholder")}
          />
        </Field>
        <Field label={t("claim.format")}>
          <Select
            value={form.watch("format")}
            onValueChange={(v) => form.setValue("format", v as TurfFormat)}
          >
            <SelectTrigger className="w-full">
              <SelectValue>
                {(v) => turfFormatLabel(String(v))}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {FORMAT_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field label={t("admin.seed.ownerPhone")} error={phoneError ?? undefined}>
          <Input
            inputMode="tel"
            value={ownerPhone}
            onChange={(e) => setOwnerPhone(e.target.value)}
            placeholder="01XXXXXXXXX"
            aria-invalid={!!phoneError}
            required
          />
        </Field>
      </section>

      <section className="space-y-3">
        <h3 className="font-heading text-sm font-semibold">{t("admin.seed.location")}</h3>
        <Field label={t("admin.seed.pinOnMap")} error={form.formState.errors.coords?.message}>
          <LocationPicker
            value={form.watch("coords") ?? null}
            label="turf"
            onChange={(point, place) => {
              form.setValue("coords", point, { shouldDirty: true })
              // Autofill location fields the user hasn't typed in themselves
              // (autofill writes without shouldDirty, so it never counts as
              // a manual edit and re-picking refreshes it).
              if (place) {
                if (place.name && !form.getFieldState("area").isDirty) {
                  form.setValue("area", place.name)
                }
                if (place.city && !form.getFieldState("city").isDirty) {
                  form.setValue("city", place.city)
                }
                if (place.address && !form.getFieldState("address").isDirty) {
                  form.setValue("address", place.address)
                }
              }
            }}
          />
        </Field>
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label={t("ownATurf.area")} error={form.formState.errors.area?.message}>
            <Input {...form.register("area")} placeholder={t("ownATurf.areaPlaceholder")} />
          </Field>
          <Field label={t("ownATurf.city")} error={form.formState.errors.city?.message}>
            <Input {...form.register("city")} placeholder={t("ownATurf.cityPlaceholder")} />
          </Field>
          <Field label={t("admin.seed.address")} error={form.formState.errors.address?.message}>
            <Input {...form.register("address")} placeholder={t("ownATurf.addressPlaceholder")} />
          </Field>
        </div>
      </section>

      {serverError ? (
        <StatusBadge status="danger">{t(serverError)}</StatusBadge>
      ) : null}

      <Button type="submit" size="lg" loading={form.formState.isSubmitting}>
        {form.formState.isSubmitting ? t("admin.seed.seeding") : t("admin.seed.submit")}
      </Button>
    </form>
  )
}

function Field({
  label,
  error,
  children,
}: {
  label: string
  error?: string
  children: React.ReactNode
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs font-medium text-dt-dim">{label}</Label>
      {children}
      {error ? <p className="text-xs text-destructive">{error}</p> : null}
    </div>
  )
}
