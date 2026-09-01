"use client"

import * as React from "react"

import { cn } from "@/lib/utils"

export interface FilterBarItem {
  label: React.ReactNode
  value: string
}

export interface FilterBarProps
  extends Omit<React.ComponentProps<"div">, "onChange"> {
  items: FilterBarItem[]
  value?: string
  onChange?: (value: string) => void
}

/**
 * Horizontally scrollable filter chip bar (SS16). Hides its scrollbar on
 * mobile while staying keyboard-accessible (role=tablist).
 */
export function FilterBar({
  items,
  value,
  onChange,
  className,
  ...props
}: FilterBarProps) {
  return (
    <div
      role="tablist"
      aria-orientation="horizontal"
      className={cn(
        "flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
        className
      )}
      {...props}
    >
      {items.map((item) => {
        const selected = item.value === value
        return (
          <button
            key={item.value}
            type="button"
            role="tab"
            aria-selected={selected}
            onClick={() => onChange?.(item.value)}
            className={cn(
              "inline-flex h-9 shrink-0 items-center rounded-full border px-3 text-sm transition-colors",
              selected
                ? "border-dt-green bg-dt-green text-dt-ink"
                : "border-dt-line bg-dt-card2 text-dt-dim hover:bg-dt-card2 hover:text-dt-txt"
            )}
          >
            {item.label}
          </button>
        )
      })}
    </div>
  )
}
