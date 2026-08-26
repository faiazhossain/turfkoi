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
import { useI18n, fieldError } from "@/i18n/client";
import { cn } from "@/lib/utils";

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
    labelKey: "turfOwner.form.policyFlexible",
    hintKey: "turfOwner.form.policyFlexibleHint",
  },
  {
    value: "moderate",
    labelKey: "turfOwner.form.policyBalanced",
    hintKey: "turfOwner.form.policyBalancedHint",
  },
  {
    value: "rebook_contingent",
    labelKey: "turfOwner.form.policyRebook",
    hintKey: "turfOwner.form.policyRebookHint",
  },
  {
    value: "strict",
    labelKey: "turfOwner.form.policyStrict",
    hintKey: "turfOwner.form.policyStrictHint",
  },
] as const;

const CANCELLATION_LABEL_KEYS: Record<string, string> = Object.fromEntries(
  CANCELLATION_OPTIONS.map((o) => [o.value, o.labelKey]),
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
  const { t } = useI18n();
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
      setCustomError("turfOwner.form.customTooLong");
      return;
    }
    const taken =
      customFacilities.some((c) => c.toLowerCase() === name.toLowerCase()) ||
      PRESET_FACILITY_KEYS.includes(name.toLowerCase() as never);
    if (taken) {
      setCustomError("turfOwner.form.customDuplicate");
      return;
    }
    if (customFacilities.length >= MAX_CUSTOM_FACILITIES) {
      setCustomError("turfOwner.form.customMax");
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
        if (res.error === "turfs.errors.slugTaken") {
          payload.slug = `${slugify(values.name)}-${Math.random()
            .toString(36)
            .slice(2, 5)}`;
          continue;
        }
        setServerError(res.error);
        return;
      }
      setServerError("turfOwner.form.createFailed");
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
        <h3 className="font-heading text-sm font-semibold">{t("turfOwner.form.basics")}</h3>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label={t("ownATurf.turfName")} error={form.formState.errors.name?.message}>
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
            <Field label={t("turfOwner.form.autoLink")}>
              <Input readOnly value={`/turfs/${defaultValues.slug}`} />
            </Field>
          ) : null}
        </div>
        <Field
          label={t("turfOwner.form.description")}
          error={form.formState.errors.description?.message}
        >
          <Textarea
            {...form.register("description")}
            rows={4}
            placeholder={t("turfOwner.form.descriptionPlaceholder")}
          />
        </Field>
        <Field label={t("turfOwner.form.format")}>
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
        <h3 className="font-heading text-sm font-semibold">{t("map.location")}</h3>
        <Field label={t("ownATurf.pinMap")} error={form.formState.errors.coords?.message}>
          <LocationPicker
            value={form.watch("coords") ?? null}
            label={t("map.turfLabel")}
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
          <Field label={t("ownATurf.area")} error={form.formState.errors.area?.message}>
            <Input {...form.register("area")} placeholder={t("ownATurf.areaPlaceholder")} />
          </Field>
          <Field label={t("ownATurf.city")} error={form.formState.errors.city?.message}>
            <Input {...form.register("city")} placeholder={t("ownATurf.cityPlaceholder")} />
          </Field>
          <Field label={t("turfOwner.form.address")} error={form.formState.errors.address?.message}>
            <Input {...form.register("address")} placeholder={t("ownATurf.addressPlaceholder")} />
          </Field>
        </div>
      </section>

      <section className="space-y-3">
        <h3 className="font-heading text-sm font-semibold">{t("turfs.facilities")}</h3>
        <p className="text-xs text-muted-foreground">
          {t("turfOwner.form.facilitiesHint")}
        </p>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">
          {FACILITY_TOGGLE_KEYS.map((key) => {
            const checked = !!form.watch(`facilities.${key}`);
            return (
              <label
                key={key}
                className={cn(
                  "flex cursor-pointer items-center gap-3 rounded-lg border px-3 py-3 text-sm font-medium transition-colors",
                  checked
                    ? "border-primary bg-primary/5 text-foreground"
                    : "border-border bg-card text-muted-foreground hover:border-input hover:bg-muted/50 hover:text-foreground",
                )}
              >
                <Checkbox
                  className="size-5"
                  checked={checked}
                  onCheckedChange={(v) =>
                    form.setValue(
                      `facilities.${key}`,
                      v === true ? true : undefined,
                      { shouldDirty: true },
                    )
                  }
                />
                <span className="min-w-0 leading-snug">
                  {t(`turfs.facility.${key}`)}
                </span>
              </label>
            );
          })}
        </div>
        <div className="space-y-2">
          <Label className="text-xs font-medium text-muted-foreground">
            {t("turfOwner.form.anythingElse")}
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
              placeholder={t("turfOwner.form.customPlaceholder")}
              aria-label={t("turfOwner.form.customAria")}
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={addCustomFacility}
            >
              <PlusIcon className="size-4" aria-hidden />
              {t("common.add")}
            </Button>
          </div>
          {customError ? (
            <p className="text-xs text-destructive">{t(customError)}</p>
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
                    aria-label={t("turfOwner.form.removeAria", { name })}
                  >
                    <XIcon className="size-3.5" aria-hidden />
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
        <Field label={t("turfOwner.form.grassType")}>
          <Input
            {...form.register("facilities.grassType")}
            placeholder={t("turfOwner.form.grassPlaceholder")}
          />
        </Field>
      </section>

      <section className="space-y-3">
        <h3 className="font-heading text-sm font-semibold">
          {t("turfOwner.form.cancellations")}
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
              {(v) => t(CANCELLATION_LABEL_KEYS[String(v)] ?? String(v))}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            {CANCELLATION_OPTIONS.map((o) => (
              <SelectItem key={o.value} value={o.value}>
                <span>
                  <span className="font-medium">{t(o.labelKey)}</span>
                  <span className="block text-xs font-normal text-muted-foreground">
                    {t(o.hintKey)}
                  </span>
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground">
          {t("turfOwner.form.policyNote")}
        </p>
      </section>

      {serverError ? (
        <StatusBadge status="danger">{t(serverError)}</StatusBadge>
      ) : null}

      <div className="flex items-center gap-2">
        <Button type="submit" size="lg" loading={form.formState.isSubmitting}>
          {form.formState.isSubmitting
            ? t("turfOwner.form.saving")
            : mode === "create"
              ? t("turfOwner.form.createTurf")
              : t("common.saveChanges")}
        </Button>
        <Button
          type="button"
          size="lg"
          variant="ghost"
          onClick={() => router.push("/turf-owner")}
        >
          {t("common.cancel")}
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
  const { t } = useI18n();
  return (
    <div className="space-y-1.5">
      <Label className="text-xs font-medium text-muted-foreground">
        {label}
      </Label>
      {children}
      {error ? (
        <p className="text-xs text-destructive">{fieldError(error, t)}</p>
      ) : null}
    </div>
  );
}
