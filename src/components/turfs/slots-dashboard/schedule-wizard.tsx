"use client"

import { useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { StatusBadge } from "@/components/shared"
import { useI18n } from "@/i18n/client"
import { formatBdt } from "@/lib/pricing"
import { formatSlotTimeRange, toBnDigits } from "@/lib/format-time"

import { saveScheduleAction } from "@/features/turfs/actions"

import { expandSectionsForDay } from "@/lib/slot-expansion"
import { buildWizardSections, type WizardValues } from "@/lib/wizard-sections"

const DURATIONS = [30, 45, 60, 75, 90, 120, 180]
const GAPS = [0, 5, 10, 15, 20, 30]
const DAY_ABBR = ["S", "M", "T", "W", "T", "F", "S"]
const STEP_KEYS = [
  "turfOwner.wizard.stepPrices",
  "turfOwner.wizard.stepHours",
  "turfOwner.wizard.stepBreaks",
  "turfOwner.wizard.stepReview",
] as const

const DEFAULTS: WizardValues = {
  pricing: "flat",
  flatPrice: 800,
  peakFrom: "17:00",
  peakTo: "23:00",
  peakPrice: 1200,
  offPeakPrice: 800,
  openFrom: "07:00",
  openTo: "23:00",
  slotMinutes: 90,
  gapMinutes: 0,
  breakEnabled: false,
  breakFrom: "12:00",
  breakTo: "14:30",
  breakDays: [0, 1, 2, 3, 4, 5, 6],
}

function ChoiceCard({
  selected,
  title,
  description,
  onClick,
}: {
  selected: boolean
  title: string
  description: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onClick}
      className={
        "rounded-xl border p-3 text-left transition-colors " +
        (selected
          ? "border-primary bg-primary/10"
          : "border-border bg-card hover:bg-muted/50")
      }
    >
      <span className="block text-sm font-medium">{title}</span>
      <span className="block text-xs text-muted-foreground">{description}</span>
    </button>
  )
}

function Field({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs font-medium text-muted-foreground">{label}</Label>
      {children}
    </div>
  )
}

/**
 * Price input that stays editable: keeps a string draft so the field can be
 * cleared or retyped (no stuck leading "0" from Number coercion) and uses a
 * text input so mouse-wheel scrolling over it never changes the value.
 */
function PriceInput({
  value,
  onChange,
}: {
  value: number
  onChange: (n: number) => void
}) {
  const [draft, setDraft] = useState(String(value))
  const shown = Number(draft) === value ? draft : String(value)
  return (
    <Input
      type="text"
      inputMode="numeric"
      value={shown}
      onChange={(e) => {
        const next = e.target.value.replace(/\D/g, "").replace(/^0+(?=\d)/, "")
        setDraft(next)
        onChange(next === "" ? 0 : Number(next))
      }}
    />
  )
}

/** Validate one wizard step; returns a dictionary key or null. */
function stepError(step: number, v: WizardValues): string | null {
  if (step === 1) {
    if (v.pricing === "flat" && !(v.flatPrice > 0)) {
      return "turfOwner.wizard.errFlatPrice"
    }
    if (v.pricing === "peak") {
      if (!(v.peakPrice > 0) || !(v.offPeakPrice > 0)) {
        return "turfOwner.wizard.errPeakPrices"
      }
      if (v.peakFrom === v.peakTo) {
        return "turfOwner.wizard.errPeakTimes"
      }
    }
  }
  if (step === 2) {
    if (v.openFrom === v.openTo) {
      return "turfOwner.wizard.errOpenTimes"
    }
  }
  if (step === 3 && v.breakEnabled) {
    if (v.breakFrom === v.breakTo) {
      return "turfOwner.wizard.errBreakTimes"
    }
    if (v.breakDays.length === 0) {
      return "turfOwner.wizard.errBreakDays"
    }
  }
  return null
}

/**
 * First-time schedule setup. Asks owner-sized questions — prices (flat vs
 * peak), open hours, and one optional break — and compiles them into a full
 * weekly schedule via buildWizardSections, saved through saveScheduleAction
 * (fills the next 30 days). Only shown while the turf has no active
 * schedule; afterwards the Weekly hours sheet is the edit path.
 */
export function ScheduleWizardDialog({
  turfId,
  triggerVariant = "default",
  triggerSize = "default",
}: {
  turfId: string
  triggerVariant?: "default" | "outline" | "secondary"
  triggerSize?: "default" | "sm" | "lg"
}) {
  const router = useRouter()
  const { t, locale } = useI18n()
  const [open, setOpen] = useState(false)
  const [step, setStep] = useState(1)
  const [values, setValues] = useState<WizardValues>(DEFAULTS)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const set = <K extends keyof WizardValues>(key: K, value: WizardValues[K]) =>
    setValues((v) => ({ ...v, [key]: value }))

  const sections = useMemo(() => buildWizardSections(values), [values])

  const next = () => {
    const err = stepError(step, values)
    setError(err)
    if (!err) setStep((s) => Math.min(4, s + 1))
  }

  async function save() {
    const err = stepError(4, values) ?? (sections.length === 0
      ? "turfOwner.wizard.errNoSlots"
      : null)
    setError(err)
    if (err) return
    setBusy(true)
    try {
      const res = await saveScheduleAction(turfId, {
        name: "Regular week",
        isActive: true,
        sections,
      })
      if (!res.ok) {
        setError(res.error)
        return
      }
      setOpen(false)
      const m = res.materialized
      toast.success(
        m
          ? t("turfOwner.wizard.savedWithSlots", {
              added: m.inserted,
              updated: m.updated,
            })
          : t("turfOwner.wizard.saved")
      )
      router.refresh()
    } finally {
      setBusy(false)
    }
  }

  // Slots per day differs when the break applies to only some days — show
  // the honest range instead of one number.
  const slotsPerDay = useMemo(() => {
    const counts = [0, 1, 2, 3, 4, 5, 6].map((d) =>
      expandSectionsForDay(sections, d).length
    )
    const open = counts.filter((c) => c > 0)
    if (open.length === 0) return locale === "bn" ? "০" : "0"
    const min = Math.min(...open)
    const max = Math.max(...open)
    const range = min === max ? String(min) : `${min}–${max}`
    return locale === "bn" ? toBnDigits(range) : range
  }, [sections, locale])

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (busy) return
        setOpen(next)
        if (!next) {
          setStep(1)
          setError(null)
        }
      }}
    >
      <DialogTrigger
        render={
          <Button variant={triggerVariant} size={triggerSize} />
        }
      >
        {t("turfOwner.schedule.setupTitle")}
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] max-w-md overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t("turfOwner.schedule.setupTitle")}</DialogTitle>
          <DialogDescription>
            {t("turfOwner.wizard.desc")}
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center gap-2" aria-hidden>
          {STEP_KEYS.map((key, i) => (
            <div key={key} className="flex flex-1 flex-col items-center gap-1">
              <span
                className={
                  "h-1.5 w-full rounded-full " +
                  (i + 1 <= step ? "bg-primary" : "bg-border")
                }
              />
              <span
                className={
                  "text-[10px] " +
                  (i + 1 === step ? "text-foreground" : "text-muted-foreground")
                }
              >
                {t(key)}
              </span>
            </div>
          ))}
        </div>

        {step === 1 ? (
          <div className="space-y-4">
            <p className="text-sm font-medium">
              {t("turfOwner.wizard.pricingQuestion")}
            </p>
            <div className="grid gap-2 sm:grid-cols-2">
              <ChoiceCard
                selected={values.pricing === "flat"}
                title={t("turfOwner.wizard.flatTitle")}
                description={t("turfOwner.wizard.flatDesc")}
                onClick={() => set("pricing", "flat")}
              />
              <ChoiceCard
                selected={values.pricing === "peak"}
                title={t("turfOwner.wizard.peakTitle")}
                description={t("turfOwner.wizard.peakDesc")}
                onClick={() => set("pricing", "peak")}
              />
            </div>
            {values.pricing === "flat" ? (
              <Field label={t("turfOwner.wizard.pricePerGame")}>
                <PriceInput
                  value={values.flatPrice}
                  onChange={(n) => set("flatPrice", n)}
                />
              </Field>
            ) : (
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <Field label={t("turfOwner.wizard.peakStarts")}>
                    <Input
                      type="time"
                      value={values.peakFrom}
                      onChange={(e) => set("peakFrom", e.target.value)}
                    />
                  </Field>
                  <Field label={t("turfOwner.wizard.peakEnds")}>
                    <Input
                      type="time"
                      value={values.peakTo}
                      onChange={(e) => set("peakTo", e.target.value)}
                    />
                  </Field>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <Field label={t("turfOwner.wizard.peakPrice")}>
                    <PriceInput
                      value={values.peakPrice}
                      onChange={(n) => set("peakPrice", n)}
                    />
                  </Field>
                  <Field label={t("turfOwner.wizard.offPeakPrice")}>
                    <PriceInput
                      value={values.offPeakPrice}
                      onChange={(n) => set("offPeakPrice", n)}
                    />
                  </Field>
                </div>
              </div>
            )}
          </div>
        ) : null}

        {step === 2 ? (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <Field label={t("turfOwner.wizard.openFrom")}>
                <Input
                  type="time"
                  value={values.openFrom}
                  onChange={(e) => set("openFrom", e.target.value)}
                />
              </Field>
              <Field label={t("turfOwner.wizard.openTo")}>
                <Input
                  type="time"
                  value={values.openTo}
                  onChange={(e) => set("openTo", e.target.value)}
                />
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label={t("turfOwner.wizard.gameLength")}>
                <Select
                  value={String(values.slotMinutes)}
                  onValueChange={(v) => set("slotMinutes", Number(v))}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {DURATIONS.map((d) => (
                      <SelectItem key={d} value={String(d)}>
                        {t("turfOwner.generate.minutes", { count: d })}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field label={t("turfOwner.wizard.gapBetweenGames")}>
                <Select
                  value={String(values.gapMinutes)}
                  onValueChange={(v) => set("gapMinutes", Number(v))}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {GAPS.map((g) => (
                      <SelectItem key={g} value={String(g)}>
                        {g === 0
                          ? t("turfOwner.wizard.gapNone")
                          : t("turfOwner.wizard.gapMinutes", { count: g })}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            </div>
          </div>
        ) : null}

        {step === 3 ? (
          <div className="space-y-4">
            <p className="text-sm font-medium">
              {t("turfOwner.wizard.breakQuestion")}
            </p>
            <div className="grid gap-2 sm:grid-cols-2">
              <ChoiceCard
                selected={!values.breakEnabled}
                title={t("turfOwner.wizard.noBreaksTitle")}
                description={t("turfOwner.wizard.noBreaksDesc")}
                onClick={() => set("breakEnabled", false)}
              />
              <ChoiceCard
                selected={values.breakEnabled}
                title={t("turfOwner.wizard.breakTitle")}
                description={t("turfOwner.wizard.breakDesc")}
                onClick={() => set("breakEnabled", true)}
              />
            </div>
            {values.breakEnabled ? (
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <Field label={t("turfOwner.wizard.breakFrom")}>
                    <Input
                      type="time"
                      value={values.breakFrom}
                      onChange={(e) => set("breakFrom", e.target.value)}
                    />
                  </Field>
                  <Field label={t("turfOwner.wizard.breakTo")}>
                    <Input
                      type="time"
                      value={values.breakTo}
                      onChange={(e) => set("breakTo", e.target.value)}
                    />
                  </Field>
                </div>
                <Field label={t("turfOwner.wizard.breakDays")}>
                  <div className="flex gap-1.5">
                    {DAY_ABBR.map((abbr, day) => {
                      const on = values.breakDays.includes(day)
                      return (
                        <button
                          key={day}
                          type="button"
                          aria-pressed={on}
                          aria-label={t(`turfOwner.generate.day${day}`)}
                          onClick={() =>
                            set(
                              "breakDays",
                              on
                                ? values.breakDays.filter((d) => d !== day)
                                : [...values.breakDays, day]
                            )
                          }
                          className={
                            "h-9 w-9 rounded-lg border text-sm transition-colors " +
                            (on
                              ? "border-primary bg-primary text-primary-foreground"
                              : "border-border bg-card text-muted-foreground hover:bg-muted")
                          }
                        >
                          {abbr}
                        </button>
                      )
                    })}
                  </div>
                </Field>
              </div>
            ) : null}
          </div>
        ) : null}

        {step === 4 ? (
          <div className="space-y-3">
            <p className="text-sm font-medium">{t("turfOwner.wizard.yourWeek")}</p>
            <div className="max-h-64 space-y-2 overflow-y-auto rounded-lg border border-border p-3">
              {[0, 1, 2, 3, 4, 5, 6].map((day) => {
                const daySecs = sections.filter((s) => s.dayOfWeek === day)
                return (
                  <div key={day} className="text-xs">
                    <p className="font-medium">{t(`turfOwner.generate.day${day}`)}</p>
                    {daySecs.length === 0 ? (
                      <p className="text-muted-foreground">
                        {t("turfOwner.wizard.closedDay")}
                      </p>
                    ) : (
                      <div className="mt-0.5 space-y-0.5">
                        {daySecs.map((s) => (
                          <p
                            key={`${s.startTime}-${s.endTime}`}
                            className="flex items-center justify-between text-muted-foreground"
                          >
                            <span className="font-mono">
                              {formatSlotTimeRange(s.startTime, s.endTime, locale)}
                            </span>
                            <span>
                              {s.label ? `${s.label} · ` : ""}{formatBdt(s.price)}
                            </span>
                          </p>
                        ))}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
            <StatusBadge status="neutral" showIcon={false}>
              {t("turfOwner.wizard.slotsPerDay", { count: slotsPerDay })}
            </StatusBadge>
          </div>
        ) : null}

        {error ? <StatusBadge status="danger">{t(error)}</StatusBadge> : null}

        <DialogFooter>
          {step > 1 ? (
            <Button
              variant="ghost"
              disabled={busy}
              onClick={() => {
                setError(null)
                setStep((s) => Math.max(1, s - 1))
              }}
            >
              {t("turfOwner.wizard.back")}
            </Button>
          ) : null}
          {step < 4 ? (
            <Button onClick={next}>{t("turfOwner.wizard.next")}</Button>
          ) : (
            <Button onClick={() => void save()} loading={busy}>
              {busy ? t("turfOwner.wizard.saving") : t("turfOwner.wizard.save")}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
