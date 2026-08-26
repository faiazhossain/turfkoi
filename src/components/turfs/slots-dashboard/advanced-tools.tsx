"use client"

import { useState } from "react"
import { ChevronDownIcon, WrenchIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

/**
 * Collapsible home for the less-used slot tools (schedule library, legacy
 * bulk generation). Collapsed by default so the dashboard stays focused on
 * the calendar; children are passed from the server page.
 */
export function AdvancedTools({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false)

  return (
    <section className="space-y-4">
      <Button
        variant="ghost"
        size="sm"
        className="text-muted-foreground"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <WrenchIcon aria-hidden />
        Advanced tools
        <ChevronDownIcon
          aria-hidden
          className={cn(
            "transition-transform duration-200",
            open ? "rotate-180" : "rotate-0"
          )}
        />
      </Button>
      {open ? <div className="space-y-6">{children}</div> : null}
    </section>
  )
}
