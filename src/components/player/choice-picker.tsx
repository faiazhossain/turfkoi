"use client"

import { useId } from "react"

import { useI18n } from "@/i18n/client"
import { cn } from "@/lib/utils"
import { POSITION_LABEL, SKILL_LABEL } from "@/i18n/labels"
import { POSITION_IDS, SKILL_IDS } from "@/features/player/positions"

export interface ChoiceOption {
  value: string
  label: string
}

/**
 * Single-select chip picker built on native radios (sr-only input + styled
 * label) so keyboard arrow navigation, aria-checked, and form registration
 * come for free. Controlled: `value` is "" when nothing is chosen.
 */
export function ChoicePicker({
  name,
  ariaLabel,
  options,
  value,
  onChange,
  className,
}: {
  name: string
  ariaLabel: string
  options: ChoiceOption[]
  value: string
  onChange: (value: string) => void
  className?: string
}) {
  const groupId = useId()
  return (
    <fieldset className={cn("min-w-0", className)} id={groupId}>
      <legend className="sr-only">{ariaLabel}</legend>
      <div className="flex flex-wrap gap-2">
        {options.map((opt) => {
          const checked = value === opt.value
          return (
            <label
              key={opt.value || "none"}
              className="relative cursor-pointer"
            >
              <input
                type="radio"
                name={name}
                value={opt.value}
                checked={checked}
                onChange={() => onChange(opt.value)}
                className="peer sr-only"
              />
              <span
                className={cn(
                  "inline-flex items-center rounded-full border px-3.5 py-2 text-sm transition-colors",
                  "peer-focus-visible:ring-[3px] peer-focus-visible:ring-ring/50 peer-focus-visible:outline-1 peer-focus-visible:outline-ring",
                  checked
                    ? "border-primary bg-primary/10 font-medium text-primary"
                    : "border-border text-foreground/80 hover:border-primary/50 hover:text-foreground"
                )}
              >
                {opt.label}
              </span>
            </label>
          )
        })}
      </div>
    </fieldset>
  )
}

/** Canonical football positions (primary position: no "none" option). */
export function PositionPicker(props: {
  name: string
  value: string
  onChange: (value: string) => void
  allowNone?: boolean
  className?: string
}) {
  const { t } = useI18n()
  const options: ChoiceOption[] = POSITION_IDS.map((id) => ({
    value: id,
    label: t(POSITION_LABEL[id]),
  }))
  if (props.allowNone) {
    options.unshift({ value: "", label: t("player.positionNone") })
  }
  return (
    <ChoicePicker
      {...props}
      options={options}
      ariaLabel={t("profile.positionLabel")}
    />
  )
}

/** Canonical self-rated skill levels. */
export function SkillPicker(props: {
  name: string
  value: string
  onChange: (value: string) => void
  className?: string
}) {
  const { t } = useI18n()
  const options: ChoiceOption[] = SKILL_IDS.map((id) => ({
    value: id,
    label: t(SKILL_LABEL[id]),
  }))
  return (
    <ChoicePicker
      {...props}
      options={options}
      ariaLabel={t("profile.skillLabel")}
    />
  )
}
