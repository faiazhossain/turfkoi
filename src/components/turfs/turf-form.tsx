"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { StatusBadge } from "@/components/shared"
import { LocationPicker } from "@/components/map"

import { createTurfAction, updateTurfAction } from "@/features/turfs/actions"
import {
  turfFormSchema,
  type TurfFormValues,
} from "@/features/turfs/schemas"
import { PhotoUpload } from "./photo-upload"

interface TurfFormProps {
  mode: "create" | "edit"
  turfId?: string
  defaultValues?: Partial<TurfFormValues>
}

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

const CANCELLATION_OPTIONS = [
  { value: "flexible", label: "Flexible — full refund anytime up to cutoff" },
  { value: "moderate", label: "Moderate — tiered refund window" },
  { value: "rebook_contingent", label: "Re-book contingent — refund if re-booked" },
  { value: "strict", label: "Strict — no refunds" },
] as const

const FACILITY_TOGGLE_KEYS = [
  "indoor",
  "lighting",
  "parking",
  "changingRoom",
  "shower",
  "washroom",
  "equipment",
] as const

export function TurfForm({ mode, turfId, defaultValues }: TurfFormProps) {
  const router = useRouter()
  const [serverError, setServerError] = useState<string | null>(null)
  const [photos, setPhotos] = useState<string[]>(defaultValues?.photos ?? [])

  const form = useForm<TurfFormValues>({
    resolver: zodResolver(turfFormSchema),
    defaultValues: {
      name: "",
      slug: "",
      description: "",
      coords: { lat: 23.8103, lng: 90.4125 }, // Dhaka default
      format: "fives",
      city: "",
      area: "",
      address: "",
      cancellationPolicy: "flexible",
      cancellationPolicyConfig: undefined,
      facilities: {},
      photos: [],
      ...defaultValues,
    },
  })

  async function onSubmit(values: TurfFormValues) {
    setServerError(null)
    const payload = { ...values, photos }
    const res =
      mode === "create"
        ? await createTurfAction(payload)
        : await updateTurfAction(turfId!, payload)
    if (!res.ok) {
      setServerError(res.error)
      return
    }
    router.refresh()
    router.push("/turf-owner")
  }

  return (
    <form
      onSubmit={form.handleSubmit(onSubmit)}
      className="space-y-6"
    >
      <section className="space-y-3">
        <h3 className="font-heading text-sm font-semibold">Basics</h3>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Turf name" error={form.formState.errors.name?.message}>
            <Input
              {...form.register("name")}
              onChange={(e) => {
                form.setValue("name", e.target.value)
                if (mode === "create") {
                  form.setValue("slug", slugify(e.target.value))
                }
              }}
            />
          </Field>
          <Field label="Slug" error={form.formState.errors.slug?.message}>
            <Input {...form.register("slug")} placeholder="my-turf" />
          </Field>
        </div>
        <Field label="Description" error={form.formState.errors.description?.message}>
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
        <Field
          label="Pin on map"
          error={form.formState.errors.coords?.message}
        >
          <LocationPicker
            value={form.watch("coords") ?? null}
            label="turf"
            onChange={(point, place) => {
              form.setValue("coords", point, { shouldDirty: true })
              // Autofill blank location fields from the picked place.
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

      <section className="space-y-3">
        <h3 className="font-heading text-sm font-semibold">Facilities</h3>
        <div className="grid gap-2 sm:grid-cols-2 md:grid-cols-3">
          {FACILITY_TOGGLE_KEYS.map((key) => (
            <label
              key={key}
              className="flex items-center gap-2 text-sm"
            >
              <Checkbox
                checked={!!form.watch(`facilities.${key}`)}
                onCheckedChange={(v) =>
                  form.setValue(
                    `facilities.${key}`,
                    v === true ? true : undefined,
                    { shouldDirty: true }
                  )
                }
              />
              <span className="capitalize">
                {key.replace(/([A-Z])/g, " $1").toLowerCase()}
              </span>
            </label>
          ))}
        </div>
        <Field label="Grass type (optional)">
          <Input
            {...form.register("facilities.grassType")}
            placeholder="Artificial turf"
          />
        </Field>
      </section>

      <section className="space-y-3">
        <h3 className="font-heading text-sm font-semibold">Cancellation policy</h3>
        <Select
          value={form.watch("cancellationPolicy")}
          onValueChange={(v) =>
            form.setValue(
              "cancellationPolicy",
              v as TurfFormValues["cancellationPolicy"]
            )
          }
        >
          <SelectTrigger className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {CANCELLATION_OPTIONS.map((o) => (
              <SelectItem key={o.value} value={o.value}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </section>

      {mode === "edit" && turfId ? (
        <section className="space-y-2">
          <h3 className="font-heading text-sm font-semibold">Photos</h3>
          <PhotoUpload turfId={turfId} photos={photos} onChange={setPhotos} />
        </section>
      ) : null}

      {serverError ? (
        <StatusBadge status="danger">{serverError}</StatusBadge>
      ) : null}

      <div className="flex items-center gap-2">
        <Button
          type="submit"
          size="lg"
          loading={form.formState.isSubmitting}
        >
          {form.formState.isSubmitting
            ? "Saving"
            : mode === "create"
              ? "Create turf"
              : "Save changes"}
        </Button>
        <Button
          type="button"
          size="lg"
          variant="ghost"
          onClick={() => router.push("/turf-owner")}
        >
          Cancel
        </Button>
      </div>
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
