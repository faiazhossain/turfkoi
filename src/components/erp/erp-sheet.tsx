"use client"

import { useState, type ReactNode } from "react"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"

/**
 * ERP quick-add modal: centered dialog on desktop, bottom sheet on mobile
 * (max-sm overrides on the centered DialogContent — variant classes win the
 * cascade over the base utilities).
 */
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
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button variant={triggerVariant} size={triggerSize}>
            {triggerLabel}
          </Button>
        }
      />
      <DialogContent className="max-h-[90dvh] gap-4 overflow-y-auto rounded-t-2xl rounded-b-none px-5 pb-8 pt-4 max-sm:inset-x-0 max-sm:top-auto max-sm:translate-x-0 max-sm:translate-y-0 sm:inset-x-auto sm:max-w-lg sm:rounded-2xl sm:px-6">
        <DialogHeader className="p-0">
          <DialogTitle className="font-heading text-base font-semibold">
            {title}
          </DialogTitle>
        </DialogHeader>
        {children(() => setOpen(false))}
      </DialogContent>
    </Dialog>
  )
}
