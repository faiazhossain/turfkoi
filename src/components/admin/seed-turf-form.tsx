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

import { seedTurfAction } from "@/features/turf-claims/actions"
import {
  seedTurfSchema,
  type SeedTurfValues,
} from "@/features/turf-claims/schemas"

function slugify(s: string) {
  return s
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, "")
    .replace(/[\s_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
}

const FORMAT_OPTIONS = [
  { value: "fives", label: "5-a-side" },
  { value: "sevens", label: "7-a-side" },
] as const

/**
 * Admin concierge seeding: capture just enough to identify the turf (name,
 * pin, area). The real owner completes the listing after claiming via the
 * invite link that appears right after seeding.
 */
export function SeedTurfForm() {
  const [serverError, setServerError] = useState<string | null>(null)
  const [seededId, setSeededId] = useState<string | null>(null)

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
          Turf seeded. Send the claim link to the owner.
        </StatusBadge>
        <InvitePanel turfId={seededId} defaultOpen />
      </div>
    )
  }

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
      <section className="space-y-3">
        <h3 className="font-heading text-sm font-semibold">Basics</h3>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Turf name" error={form.formState.errors.name?.message}>
            <Input
              {...form.register("name")}
              onChange={(e) => {
                form.setValue("name", e.target.value)
                form.setValue("slug", slugify(e.target.value))
              }}
            />
          </Field>
          <Field label="Slug" error={form.formState.errors.slug?.message}>
            <Input {...form.register("slug")} placeholder="my-turf" />
          </Field>
        </div>
        <Field label="Description (optional)">
          <Textarea {...form.register("description")} rows={3} />
        </Field>
        <Field label="Format">
          <Select
            value={form.watch("format")}
            onValueChange={(v) => form.setValue("format", v as "fives" | "sevens")}
          >
            <SelectTrigger className="w-full">
              <SelectValue />
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
      </section>

      <section className="space-y-3">
        <h3 className="font-heading text-sm font-semibold">Location</h3>
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Area" error={form.formState.errors.area?.message}>
            <Input {...form.register("area")} placeholder="Dhanmondi" />
          </Field>
          <Field label="City" error={form.formState.errors.city?.message}>
            <Input {...form.register("city")} placeholder="Dhaka" />
          </Field>
          <Field label="Address" error={form.formState.errors.address?.message}>
            <Input {...form.register("address")} placeholder="House, road" />
          </Field>
        </div>
        <Field label="Pin on map" error={form.formState.errors.coords?.message}>
          <LocationPicker
            value={form.watch("coords") ?? null}
            label="turf"
            onChange={(point, place) => {
              form.setValue("coords", point, { shouldDirty: true })
              if (place) {
                if (place.name && !form.getValues("area")) {
                  form.setValue("area", place.name, { shouldDirty: true })
                }
                if (place.city && !form.getValues("city")) {
                  form.setValue("city", place.city, { shouldDirty: true })
                }
              }
            }}
          />
        </Field>
      </section>

      {serverError ? (
        <StatusBadge status="danger">{serverError}</StatusBadge>
      ) : null}

      <Button type="submit" size="lg" loading={form.formState.isSubmitting}>
        {form.formState.isSubmitting ? "Seeding" : "Seed turf"}
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
      <Label className="text-xs font-medium text-muted-foreground">{label}</Label>
      {children}
      {error ? <p className="text-xs text-destructive">{error}</p> : null}
    </div>
  )
}
