"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { PlusIcon, XIcon } from "lucide-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { StatusBadge } from "@/components/shared";
import { LocationPicker } from "@/components/map";

import { createTurfAction, updateTurfAction } from "@/features/turfs/actions";
import { turfFormSchema, type TurfFormValues } from "@/features/turfs/schemas";
import {
  TURF_FORMATS,
  turfFormatLabel,
  type TurfFormat,
} from "@/features/turfs/formats";

interface TurfFormProps {
  mode: "create" | "edit";
  turfId?: string;
  defaultValues?: Partial<TurfFormValues>;
}

function slugify(s: string) {
  return s
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, "")
    .replace(/[\s_-]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

const FORMAT_OPTIONS = TURF_FORMATS;

/**
 * Owner-facing cancellation policy copy (plain language; semantics mirror
 * lib/cancellation.ts). Hints explain the money flow — refunds come out of
 * the owner's share, so the choice matters to them.
 */
const CANCELLATION_OPTIONS = [
  {
    value: "flexible",
    label: "Flexible",
    hint: "Player gets a full refund any time before kickoff. Easiest to book, most refunds.",
  },
  {
    value: "moderate",
    label: "Balanced",
    hint: "Full refund up to 24h before kickoff, 50% inside 24h, nothing at the last minute.",
  },
  {
    value: "rebook_contingent",
    label: "Refund only if re-booked",
    hint: "Player is refunded only when someone else books the empty slot. You keep the payment otherwise.",
  },
  {
    value: "strict",
    label: "No refunds",
    hint: "No refund after booking. Fewest cancellations, hardest on players.",
  },
] as const;

const CANCELLATION_LABELS: Record<string, string> = Object.fromEntries(
  CANCELLATION_OPTIONS.map((o) => [o.value, o.label]),
);

const FACILITY_TOGGLE_KEYS = [
  "indoor",
  "outdoor",
  "lighting",
  "parking",
  "changingRoom",
  "shower",
  "washroom",
  "equipment",
] as const

const PRESET_FACILITY_KEYS = [...FACILITY_TOGGLE_KEYS, "grassType"] as const
const MAX_CUSTOM_FACILITIES = 12

/** Custom (non-preset) facility names saved on an edit-mode load. */
function initialCustomFacilities(
  facilities: TurfFormValues["facilities"],
): string[] {
  return Object.entries(facilities ?? {}).map(([k, v]) => [k, v] as const)
    .filter(([k, v]) => !PRESET_FACILITY_KEYS.includes(k as never) && v === true)
    .map(([k]) => k)
};

export function TurfForm({ mode, turfId, defaultValues }: TurfFormProps) {
  const router = useRouter();
  const [serverError, setServerError] = useState<string | null>(null);
  // Owner-added custom facilities live outside RHF (arbitrary keys would
  // fight the typed form paths); merged into the payload at submit.
  const [customFacilities, setCustomFacilities] = useState<string[]>(() =>
    initialCustomFacilities(defaultValues?.facilities),
  );
  const [customInput, setCustomInput] = useState("");
  const [customError, setCustomError] = useState<string | null>(null);

  function addCustomFacility() {
    const name = customInput.trim().replace(/[.[\]]/g, "");
    if (!name) return;
    if (name.length > 30) {
      setCustomError("Keep it under 30 letters.");
      return;
    }
    const taken =
      customFacilities.some((c) => c.toLowerCase() === name.toLowerCase()) ||
      PRESET_FACILITY_KEYS.includes(name.toLowerCase() as never);
    if (taken) {
      setCustomError("That one is already in the list.");
      return;
    }
    if (customFacilities.length >= MAX_CUSTOM_FACILITIES) {
      setCustomError("You can add up to 12 of your own.");
      return;
    }
    setCustomError(null);
    setCustomFacilities((prev) => [...prev, name]);
    setCustomInput("");
  }

  function removeCustomFacility(name: string) {
    setCustomFacilities((prev) => prev.filter((c) => c !== name));
  }

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
      ...defaultValues,
    },
  });

  async function onSubmit(values: TurfFormValues) {
    setServerError(null);
    // Preset toggles from the form + custom entries merged into one jsonb
    // payload (stale custom keys from defaults are dropped here).
    const presetFacilities = Object.fromEntries(
      Object.entries(values.facilities ?? {}).filter(([k]) =>
        PRESET_FACILITY_KEYS.includes(k as never),
      ),
    );
    const payload = {
      ...values,
      facilities: {
        ...presetFacilities,
        ...Object.fromEntries(customFacilities.map((name) => [name, true])),
      },
    };
    if (mode === "create") {
      // Owners never see the slug — it's derived from the name, and a
      // collision auto-retries with a short suffix (max 3 tries).
      for (let attempt = 0; attempt < 3; attempt++) {
        const res = await createTurfAction(payload);
        if (res.ok) {
          router.refresh();
          router.push("/turf-owner");
          return;
        }
        if (res.error === "That slug is already taken.") {
          payload.slug = `${slugify(values.name)}-${Math.random()
            .toString(36)
            .slice(2, 5)}`;
          continue;
        }
        setServerError(res.error);
        return;
      }
      setServerError(
        "Couldn't create the turf. Try a slightly different name.",
      );
      return;
    }
    const res = await updateTurfAction(turfId!, payload);
    if (!res.ok) {
      setServerError(res.error);
      return;
    }
    router.refresh();
    router.push("/turf-owner");
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
                form.setValue("name", e.target.value);
                if (mode === "create") {
                  // Slug is invisible to owners — derived from the name.
                  form.setValue("slug", slugify(e.target.value));
                }
              }}
            />
          </Field>
          {mode === "edit" && defaultValues?.slug ? (
            <Field label="Your Turfkoi link (automatic)">
              <Input readOnly value={`/turfs/${defaultValues.slug}`} />
            </Field>
          ) : null}
        </div>
        <Field
          label="Description"
          error={form.formState.errors.description?.message}
        >
          <Textarea
            {...form.register("description")}
            rows={4}
            placeholder={
              "e.g. " +
              "We have two courts, book both for a big group.\n" +
              "A referee can be arranged for 500 taka per match."
            }
          />
        </Field>
        <Field label="Format">
          <Select
            value={form.watch("format")}
            onValueChange={(v) => form.setValue("format", v as TurfFormat)}
          >
            <SelectTrigger className="w-full">
              <SelectValue>{(v) => turfFormatLabel(String(v))}</SelectValue>
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
        <Field label="Pin on map" error={form.formState.errors.coords?.message}>
          <LocationPicker
            value={form.watch("coords") ?? null}
            label="turf"
            onChange={(point, place) => {
              form.setValue("coords", point, { shouldDirty: true });
              // Autofill location fields the user hasn't typed in themselves
              // (autofill writes without shouldDirty, so it never counts as
              // a manual edit and re-picking refreshes it).
              if (place) {
                if (place.name && !form.getFieldState("area").isDirty) {
                  form.setValue("area", place.name);
                }
                if (place.city && !form.getFieldState("city").isDirty) {
                  form.setValue("city", place.city);
                }
                if (place.address && !form.getFieldState("address").isDirty) {
                  form.setValue("address", place.address);
                }
              }
            }}
          />
        </Field>
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
      </section>

      <section className="space-y-3">
        <h3 className="font-heading text-sm font-semibold">Facilities</h3>
        <div className="grid gap-2 sm:grid-cols-2 md:grid-cols-3">
          {FACILITY_TOGGLE_KEYS.map((key) => (
            <label key={key} className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={!!form.watch(`facilities.${key}`)}
                onCheckedChange={(v) =>
                  form.setValue(
                    `facilities.${key}`,
                    v === true ? true : undefined,
                    { shouldDirty: true },
                  )
                }
              />
              <span className="capitalize">
                {key.replace(/([A-Z])/g, " $1").toLowerCase()}
              </span>
            </label>
          ))}
        </div>
        <div className="space-y-2">
          <Label className="text-xs font-medium text-muted-foreground">
            Anything else you offer?
          </Label>
          <div className="flex items-center gap-2">
            <Input
              value={customInput}
              onChange={(e) => {
                setCustomInput(e.target.value);
                setCustomError(null);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addCustomFacility();
                }
              }}
              placeholder="e.g. Cafe, Wi-Fi, First aid"
              aria-label="Add your own facility"
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={addCustomFacility}
            >
              <PlusIcon className="size-4" aria-hidden />
              Add
            </Button>
          </div>
          {customError ? (
            <p className="text-xs text-destructive">{customError}</p>
          ) : null}
          {customFacilities.length > 0 ? (
            <ul className="flex flex-wrap gap-2">
              {customFacilities.map((name) => (
                <li
                  key={name}
                  className="inline-flex items-center gap-1 rounded-full border border-border bg-muted/40 px-2.5 py-1 text-sm"
                >
                  {name}
                  <button
                    type="button"
                    onClick={() => removeCustomFacility(name)}
                    className="text-muted-foreground hover:text-foreground"
                    aria-label={`Remove ${name}`}
                  >
                    <XIcon className="size-3.5" aria-hidden />
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
        <Field label="Grass type (optional)">
          <Input
            {...form.register("facilities.grassType")}
            placeholder="Artificial turf"
          />
        </Field>
      </section>

      <section className="space-y-3">
        <h3 className="font-heading text-sm font-semibold">
          Cancellations &amp; refunds
        </h3>
        <Select
          value={form.watch("cancellationPolicy")}
          onValueChange={(v) =>
            form.setValue(
              "cancellationPolicy",
              v as TurfFormValues["cancellationPolicy"],
            )
          }
        >
          <SelectTrigger className="w-full">
            <SelectValue>
              {(v) => CANCELLATION_LABELS[String(v)] ?? String(v)}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            {CANCELLATION_OPTIONS.map((o) => (
              <SelectItem key={o.value} value={o.value}>
                <span>
                  <span className="font-medium">{o.label}</span>
                  <span className="block text-xs font-normal text-muted-foreground">
                    {o.hint}
                  </span>
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground">
          When a player cancels a booking, the refund comes out of your earnings
          — this choice sets how much they get back.
        </p>
      </section>

      {serverError ? (
        <StatusBadge status="danger">{serverError}</StatusBadge>
      ) : null}

      <div className="flex items-center gap-2">
        <Button type="submit" size="lg" loading={form.formState.isSubmitting}>
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
  );
}

function Field({
  label,
  error,
  children,
}: {
  label: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs font-medium text-muted-foreground">
        {label}
      </Label>
      {children}
      {error ? <p className="text-xs text-destructive">{error}</p> : null}
    </div>
  );
}
