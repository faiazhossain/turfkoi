"use client"

import { useState } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"

import { useI18n, fieldError } from "@/i18n/client"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { StatusBadge } from "@/components/shared"
import { LocationPicker } from "@/components/map"

import { submitTurfApplicationAction } from "@/features/turf-applications/actions"
import {
  turfApplicationSchema,
  type TurfApplicationValues,
} from "@/features/turf-applications/schemas"

/**
 * Public "list your turf" application. No account required — WhatsApp phone
 * is the contact channel; the admin reviews and sends a claim link back.
 */
export function TurfApplicationForm() {
  const { t } = useI18n()
  const [serverError, setServerError] = useState<string | null>(null)
  const [submitted, setSubmitted] = useState(false)

  const form = useForm<TurfApplicationValues>({
    resolver: zodResolver(turfApplicationSchema),
    defaultValues: {
      turfName: "",
      contactName: "",
      phone: "",
      email: "",
      city: "",
      area: "",
      address: "",
      notes: "",
    },
  })

  async function onSubmit(values: TurfApplicationValues) {
    setServerError(null)
    const res = await submitTurfApplicationAction(values)
    if (!res.ok) {
      setServerError(t(res.error ?? "errors.generic"))
      return
    }
    setSubmitted(true)
  }

  if (submitted) {
    return (
      <div className="space-y-3">
        <StatusBadge status="success">{t("ownATurf.successBadge")}</StatusBadge>
        <p className="text-sm text-muted-foreground">
          {t("ownATurf.successBody", { phone: form.getValues("phone") })}
        </p>
      </div>
    )
  }

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="turfName">{t("ownATurf.turfName")}</Label>
        <Input id="turfName" placeholder={t("ownATurf.turfNamePlaceholder")} {...form.register("turfName")} />
        {form.formState.errors.turfName && (
          <p className="text-sm text-destructive">{fieldError(form.formState.errors.turfName.message, t)}</p>
        )}
      </div>
      <div className="space-y-2">
        <Label htmlFor="contactName">{t("ownATurf.contactName")}</Label>
        <Input id="contactName" autoComplete="name" placeholder={t("ownATurf.contactNamePlaceholder")} {...form.register("contactName")} />
        {form.formState.errors.contactName && (
          <p className="text-sm text-destructive">{fieldError(form.formState.errors.contactName.message, t)}</p>
        )}
      </div>
      <div className="space-y-2">
        <Label htmlFor="phone">{t("ownATurf.phone")}</Label>
        <Input
          id="phone"
          inputMode="tel"
          autoComplete="tel"
          placeholder="01XXXXXXXXX"
          {...form.register("phone")}
        />
        {form.formState.errors.phone && (
          <p className="text-sm text-destructive">{fieldError(form.formState.errors.phone.message, t)}</p>
        )}
      </div>
      <div className="space-y-2">
        <Label htmlFor="email">{t("ownATurf.emailOptional")}</Label>
        <Input id="email" type="email" autoComplete="email" placeholder="you@email.com" {...form.register("email")} />
        {form.formState.errors.email && (
          <p className="text-sm text-destructive">{fieldError(form.formState.errors.email.message, t)}</p>
        )}
      </div>
      <div className="space-y-1.5">
        <Label className="text-xs font-medium text-muted-foreground">
          {t("ownATurf.pinMap")}
        </Label>
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
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="area">{t("ownATurf.area")}</Label>
          <Input id="area" placeholder="Dhanmondi" {...form.register("area")} />
          {form.formState.errors.area && (
            <p className="text-sm text-destructive">{fieldError(form.formState.errors.area.message, t)}</p>
          )}
        </div>
        <div className="space-y-2">
          <Label htmlFor="city">{t("ownATurf.city")}</Label>
          <Input id="city" placeholder="Dhaka" {...form.register("city")} />
          {form.formState.errors.city && (
            <p className="text-sm text-destructive">{fieldError(form.formState.errors.city.message, t)}</p>
          )}
        </div>
      </div>
      <div className="space-y-2">
        <Label htmlFor="address">{t("ownATurf.addressOptional")}</Label>
        <Input id="address" autoComplete="street-address" placeholder="House, road" {...form.register("address")} />
        {form.formState.errors.address && (
          <p className="text-sm text-destructive">{fieldError(form.formState.errors.address.message, t)}</p>
        )}
      </div>
      <div className="space-y-2">
        <Label htmlFor="notes">{t("ownATurf.notesLabel")}</Label>
        <Textarea
          id="notes"
          rows={3}
          placeholder={t("ownATurf.notesPlaceholder")}
          {...form.register("notes")}
        />
        <p className="text-xs text-muted-foreground">{t("ownATurf.notesHelp")}</p>
        {form.formState.errors.notes && (
          <p className="text-sm text-destructive">{fieldError(form.formState.errors.notes.message, t)}</p>
        )}
      </div>

      {serverError ? <StatusBadge status="danger">{serverError}</StatusBadge> : null}

      <Button type="submit" size="lg" className="w-full" loading={form.formState.isSubmitting}>
        {form.formState.isSubmitting ? t("ownATurf.sending") : t("ownATurf.submit")}
      </Button>
    </form>
  )
}
