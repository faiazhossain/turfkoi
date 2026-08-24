"use client"

import { useState } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"

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
      setServerError(res.error)
      return
    }
    setSubmitted(true)
  }

  if (submitted) {
    return (
      <div className="space-y-3">
        <StatusBadge status="success">
          Application received — we&apos;ll review it shortly.
        </StatusBadge>
        <p className="text-sm text-muted-foreground">
          The Turfkoi team checks every listing by hand. We&apos;ll reach out
          on WhatsApp ({form.getValues("phone")}) with a claim link to set up
          your turf.
        </p>
      </div>
    )
  }

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="turfName">Turf name</Label>
        <Input id="turfName" placeholder="e.g. Dhanmondi Arena" {...form.register("turfName")} />
        {form.formState.errors.turfName && (
          <p className="text-sm text-destructive">{form.formState.errors.turfName.message}</p>
        )}
      </div>
      <div className="space-y-2">
        <Label htmlFor="contactName">Your name</Label>
        <Input id="contactName" autoComplete="name" placeholder="Owner or manager" {...form.register("contactName")} />
        {form.formState.errors.contactName && (
          <p className="text-sm text-destructive">{form.formState.errors.contactName.message}</p>
        )}
      </div>
      <div className="space-y-2">
        <Label htmlFor="phone">WhatsApp phone</Label>
        <Input
          id="phone"
          inputMode="tel"
          autoComplete="tel"
          placeholder="01XXXXXXXXX"
          {...form.register("phone")}
        />
        {form.formState.errors.phone && (
          <p className="text-sm text-destructive">{form.formState.errors.phone.message}</p>
        )}
      </div>
      <div className="space-y-2">
        <Label htmlFor="email">Email (optional)</Label>
        <Input id="email" type="email" autoComplete="email" placeholder="you@email.com" {...form.register("email")} />
        {form.formState.errors.email && (
          <p className="text-sm text-destructive">{form.formState.errors.email.message}</p>
        )}
      </div>
      <div className="space-y-1.5">
        <Label className="text-xs font-medium text-muted-foreground">
          Pin your turf on the map
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
          <Label htmlFor="area">Area</Label>
          <Input id="area" placeholder="Dhanmondi" {...form.register("area")} />
          {form.formState.errors.area && (
            <p className="text-sm text-destructive">{form.formState.errors.area.message}</p>
          )}
        </div>
        <div className="space-y-2">
          <Label htmlFor="city">City</Label>
          <Input id="city" placeholder="Dhaka" {...form.register("city")} />
          {form.formState.errors.city && (
            <p className="text-sm text-destructive">{form.formState.errors.city.message}</p>
          )}
        </div>
      </div>
      <div className="space-y-2">
        <Label htmlFor="address">Address (optional)</Label>
        <Input id="address" autoComplete="street-address" placeholder="House, road" {...form.register("address")} />
        {form.formState.errors.address && (
          <p className="text-sm text-destructive">{form.formState.errors.address.message}</p>
        )}
      </div>
      <div className="space-y-2">
        <Label htmlFor="notes">How players can reach your turf</Label>
        <Textarea
          id="notes"
          rows={3}
          placeholder="e.g. From Mirpur 11 metro station, head to Abbas Uddin School, then a 30 taka rickshaw drop"
          {...form.register("notes")}
        />
        <p className="text-xs text-muted-foreground">
          The easiest route from the nearest metro/bus stop — landmarks, transport, fare.
          We show this to players and teams booking your turf.
        </p>
        {form.formState.errors.notes && (
          <p className="text-sm text-destructive">{form.formState.errors.notes.message}</p>
        )}
      </div>

      {serverError ? <StatusBadge status="danger">{serverError}</StatusBadge> : null}

      <Button type="submit" size="lg" className="w-full" loading={form.formState.isSubmitting}>
        {form.formState.isSubmitting ? "Sending..." : "Apply to list your turf"}
      </Button>
    </form>
  )
}
