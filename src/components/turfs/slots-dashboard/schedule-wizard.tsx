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

import { saveScheduleAction } from "@/features/turfs/actions"

import { DAY_NAMES, expandSectionsForDay } from "@/lib/slot-expansion"
import { buildWizardSections, type WizardValues } from "@/lib/wizard-sections"

const DURATIONS = [30, 45, 60, 75, 90, 120, 180]
const GAPS = [0, 5, 10, 15, 20, 30]
const DAY_ABBR = ["S", "M", "T", "W", "T", "F", "S"]
const STEPS = ["Prices", "Hours", "Breaks", "Review"] as const

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
  gapMinutes: 10,
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

/** Validate one wizard step; returns an error message or null. */
function stepError(step: number, v: WizardValues): string | null {
  if (step === 1) {
    if (v.pricing === "flat" && !(v.flatPrice > 0)) {
      return "Enter a price per game."
    }
    if (v.pricing === "peak") {
      if (!(v.peakPrice > 0) || !(v.offPeakPrice > 0)) {
        return "Enter both peak and off-peak prices."
      }
      if (v.peakFrom === v.peakTo) {
        return "Peak start and end must differ."
      }
    }
  }
  if (step === 2) {
    if (v.openFrom === v.openTo) {
      return "Closing time must differ from opening time."
    }
  }
  if (step === 3 && v.breakEnabled) {
    if (v.breakFrom === v.breakTo) {
      return "Break start and end must differ."
    }
    if (v.breakDays.length === 0) {
      return "Pick at least one day for the break."
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
  triggerLabel = "Set up weekly hours",
  triggerVariant = "default",
  triggerSize = "default",
}: {
  turfId: string
  triggerLabel?: string
  triggerVariant?: "default" | "outline" | "secondary"
  triggerSize?: "default" | "sm" | "lg"
}) {
  const router = useRouter()
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
      ? "This setup creates no slots — check your hours and breaks."
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
          ? `Weekly hours saved — next 30 days: ${m.inserted} slots added, ${m.updated} updated.`
          : "Weekly hours saved."
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
    if (open.length === 0) return "0"
    const min = Math.min(...open)
    const max = Math.max(...open)
    return min === max ? String(min) : `${min}–${max}`
  }, [sections])

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
        {triggerLabel}
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] max-w-md overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Set up weekly hours</DialogTitle>
          <DialogDescription>
            A few quick questions — we&apos;ll build your week and fill the
            next 30 days of slots.
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center gap-2" aria-hidden>
          {STEPS.map((label, i) => (
            <div key={label} className="flex flex-1 flex-col items-center gap-1">
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
                {label}
              </span>
            </div>
          ))}
        </div>

        {step === 1 ? (
          <div className="space-y-4">
            <p className="text-sm font-medium">
              Do your prices change by time of day?
            </p>
            <div className="grid gap-2 sm:grid-cols-2">
              <ChoiceCard
                selected={values.pricing === "flat"}
                title="Same price all day"
                description="One rate for every slot"
                onClick={() => set("pricing", "flat")}
              />
              <ChoiceCard
                selected={values.pricing === "peak"}
                title="Peak & off-peak"
                description="Higher rate in the evening rush"
                onClick={() => set("pricing", "peak")}
              />
            </div>
            {values.pricing === "flat" ? (
              <Field label="Price per game (BDT)">
                <Input
                  type="number"
                  min={1}
                  step="any"
                  value={values.flatPrice}
                  onChange={(e) => set("flatPrice", Number(e.target.value))}
                />
              </Field>
            ) : (
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Peak starts">
                    <Input
                      type="time"
                      value={values.peakFrom}
                      onChange={(e) => set("peakFrom", e.target.value)}
                    />
                  </Field>
                  <Field label="Peak ends">
                    <Input
                      type="time"
                      value={values.peakTo}
                      onChange={(e) => set("peakTo", e.target.value)}
                    />
                  </Field>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Peak price (BDT)">
                    <Input
                      type="number"
                      min={1}
                      step="any"
                      value={values.peakPrice}
                      onChange={(e) => set("peakPrice", Number(e.target.value))}
                    />
                  </Field>
                  <Field label="Off-peak price (BDT)">
                    <Input
                      type="number"
                      min={1}
                      step="any"
                      value={values.offPeakPrice}
                      onChange={(e) =>
                        set("offPeakPrice", Number(e.target.value))
                      }
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
              <Field label="Open from">
                <Input
                  type="time"
                  value={values.openFrom}
                  onChange={(e) => set("openFrom", e.target.value)}
                />
              </Field>
              <Field label="Open to">
                <Input
                  type="time"
                  value={values.openTo}
                  onChange={(e) => set("openTo", e.target.value)}
                />
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Game length">
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
                        {d} min
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Gap between games">
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
                        {g === 0 ? "none" : `+${g} min`}
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
              Closed for a break on some days?
            </p>
            <div className="grid gap-2 sm:grid-cols-2">
              <ChoiceCard
                selected={!values.breakEnabled}
                title="No breaks"
                description="Open the whole time"
                onClick={() => set("breakEnabled", false)}
              />
              <ChoiceCard
                selected={values.breakEnabled}
                title="Yes, a break"
                description="Lunch, prayer, maintenance"
                onClick={() => set("breakEnabled", true)}
              />
            </div>
            {values.breakEnabled ? (
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Break from">
                    <Input
                      type="time"
                      value={values.breakFrom}
                      onChange={(e) => set("breakFrom", e.target.value)}
                    />
                  </Field>
                  <Field label="Break to">
                    <Input
                      type="time"
                      value={values.breakTo}
                      onChange={(e) => set("breakTo", e.target.value)}
                    />
                  </Field>
                </div>
                <Field label="Break days">
                  <div className="flex gap-1.5">
                    {DAY_ABBR.map((abbr, day) => {
                      const on = values.breakDays.includes(day)
                      return (
                        <button
                          key={day}
                          type="button"
                          aria-pressed={on}
                          aria-label={DAY_NAMES[day]}
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
            <p className="text-sm font-medium">Your week</p>
            <div className="max-h-64 space-y-2 overflow-y-auto rounded-lg border border-border p-3">
              {DAY_NAMES.map((name, day) => {
                const daySecs = sections.filter((s) => s.dayOfWeek === day)
                return (
                  <div key={name} className="text-xs">
                    <p className="font-medium">{name}</p>
                    {daySecs.length === 0 ? (
                      <p className="text-muted-foreground">Closed</p>
                    ) : (
                      <div className="mt-0.5 space-y-0.5">
                        {daySecs.map((s) => (
                          <p
                            key={`${s.startTime}-${s.endTime}`}
                            className="flex items-center justify-between text-muted-foreground"
                          >
                            <span className="font-mono">
                              {s.startTime}–{s.endTime}
                            </span>
                            <span>
                              {s.label ? `${s.label} · ` : ""}৳{s.price}
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
              ≈{slotsPerDay} slots per day · fills the next 30 days
            </StatusBadge>
          </div>
        ) : null}

        {error ? <StatusBadge status="danger">{error}</StatusBadge> : null}

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
              Back
            </Button>
          ) : null}
          {step < 4 ? (
            <Button onClick={next}>Next</Button>
          ) : (
            <Button onClick={() => void save()} loading={busy}>
              {busy ? "Saving" : "Save weekly hours"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
