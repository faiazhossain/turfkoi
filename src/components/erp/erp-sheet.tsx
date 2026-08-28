"use client"

import { useState, type ReactNode } from "react"

import { Button } from "@/components/ui/button"
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet"

/** Bottom-sheet wrapper for ERP quick-add forms (mobile-first UX spec §7). */
export function ErpSheet({
  triggerLabel,
  title,
  children,
  triggerVariant = "outline",
  triggerSize = "sm",
}: {
  triggerLabel: string
  title: string
  children: (onClose: () => void) => ReactNode
  triggerVariant?: "outline" | "default" | "secondary" | "ghost"
  triggerSize?: "sm" | "default" | "lg" | "xs"
}) {
  const [open, setOpen] = useState(false)
  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger
        render={
          <Button variant={triggerVariant} size={triggerSize}>
            {triggerLabel}
          </Button>
        }
      />
      <SheetContent side="bottom" className="mx-auto max-h-[90dvh] max-w-lg overflow-y-auto rounded-t-2xl px-5 pb-8 pt-4 sm:inset-x-4">
        <SheetHeader className="p-0">
          <SheetTitle className="font-heading text-base font-semibold">
            {title}
          </SheetTitle>
        </SheetHeader>
        {children(() => setOpen(false))}
      </SheetContent>
    </Sheet>
  )
}
