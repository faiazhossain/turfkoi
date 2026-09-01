"use client"

import { useState } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { CheckIcon, XIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { StatusBadge } from "@/components/shared"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { LocationPicker } from "@/components/map"
import type { GeoPoint } from "@/db/geo"
import { useI18n } from "@/i18n/client"

import { InvitePanel } from "./invite-panel"
import {
  approveTurfApplicationAction,
  rejectTurfApplicationAction,
} from "@/features/turf-applications/actions"
import { TURF_FORMATS, turfFormatLabel, type TurfFormat } from "@/features/turfs/formats"
import {
  approveApplicationSchema,
  type ApproveApplicationValues,
} from "@/features/turf-applications/schemas"

function slugify(s: string) {
  return s
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, "")
    .replace(/[\s_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
}

// Dhaka default, same as SeedTurfForm.
const DHAKA_CENTER = { lat: 23.8103, lng: 90.4125 }

const FORMAT_OPTIONS = TURF_FORMATS

export type PendingApplication = {
  id: string
  turfName: string
  phone: string
  email: string | null
  city: string | null
  area: string | null
  address: string | null
  coords: GeoPoint | null
}

/**
 * Approve an application: admin verifies the seed data (prefilled from the
 * application), the action seeds the unowned turf, and the InvitePanel that
 * appears mints the claim link for the owner.
 */
export function ApproveApplicationPanel({ application }: { application: PendingApplication }) {
  const { t } = useI18n()
  const [serverError, setServerError] = useState<string | null>(null)
  const [open, setOpen] = useState(false)
  const [turfId, setTurfId] = useState<string | null>(null)

  const form = useForm<ApproveApplicationValues>({
    resolver: zodResolver(approveApplicationSchema),
    defaultValues: {
      applicationId: application.id,
      name: application.turfName,
      slug: slugify(application.turfName),
      description: "",
      coords: application.coords ?? DHAKA_CENTER,
      format: "fives",
      city: application.city ?? "",
      area: application.area ?? "",
      address: application.address ?? "",
    },
  })

  async function onSubmit(values: ApproveApplicationValues) {
    setServerError(null)
    const res = await approveTurfApplicationAction(values)
    if (!res.ok) {
      setServerError(res.error)
      return
    }
    setTurfId(res.id ?? null)
  }

  if (turfId) {
    return (
      <InvitePanel
        turfId={turfId}
        defaultOpen
        defaultEmail={application.email ?? ""}
        defaultPhone={application.phone}
      />
    )
  }

  if (!open) {
    return (
      <div className="flex gap-2">
        <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
          <CheckIcon className="size-3.5" aria-hidden />
          {t("admin.applications.approve")}
        </Button>
        <RejectApplicationButton applicationId={application.id} />
      </div>
    )
  }

  return (
    <div className="w-full space-y-4 rounded-lg border border-dt-line bg-dt-card2/40 p-3">
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label={t("ownATurf.turfName")} error={form.formState.errors.name?.message}>
            <Input {...form.register("name")} />
          </Field>
          <Field label={t("team.form.slugLabel")} error={form.formState.errors.slug?.message}>
            <Input {...form.register("slug")} placeholder="my-turf" />
          </Field>
        </div>
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
        <Field label={t("admin.applications.verifyPin")} error={form.formState.errors.coords?.message}>
          <LocationPicker
            value={form.watch("coords") ?? null}
            label="turf"
            onChange={(point, place) => {
              form.setValue("coords", point, { shouldDirty: true })
              // Autofill location fields the admin hasn't typed in themselves
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
        {serverError ? <StatusBadge status="danger">{t(serverError)}</StatusBadge> : null}
        <div className="flex gap-2">
          <Button size="sm" type="submit" loading={form.formState.isSubmitting}>
            {form.formState.isSubmitting ? t("admin.applications.approving") : t("admin.applications.approveAndSeed")}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            type="button"
            onClick={() => setOpen(false)}
            disabled={form.formState.isSubmitting}
          >
            {t("common.cancel")}
          </Button>
        </div>
      </form>
    </div>
  )
}

function RejectApplicationButton({ applicationId }: { applicationId: string }) {
  const { t } = useI18n()
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function onReject() {
    setPending(true)
    setError(null)
    try {
      const res = await rejectTurfApplicationAction({ applicationId })
      if (!res.ok) setError(res.error)
    } finally {
      setPending(false)
    }
  }

  return (
    <div className="flex items-center gap-2">
      <Button
        size="sm"
        variant="ghost"
        onClick={onReject}
        loading={pending}
        aria-label={t("admin.applications.rejectAria")}
      >
        <XIcon className="size-3.5" aria-hidden />
        {t("common.reject")}
      </Button>
      {error ? (
        <StatusBadge status="danger">{t(error)}</StatusBadge>
      ) : null}
    </div>
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
