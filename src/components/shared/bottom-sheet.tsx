"use client"

import * as React from "react"

import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetFooter,
} from "@/components/ui/sheet"
import { cn } from "@/lib/utils"

export interface BottomSheetProps {
  /** Controlled open state. */
  open?: boolean
  onOpenChange?: (open: boolean) => void
  defaultOpen?: boolean
  children?: React.ReactNode
  title?: React.ReactNode
  description?: React.ReactNode
  footer?: React.ReactNode
  bodyClassName?: string
  /** Show the grabber handle at the top. */
  showHandle?: boolean
}

/**
 * Mobile-first bottom sheet (SS16). Wraps the shadcn Sheet with side="bottom",
 * a safe-area-aware footer, an optional drag handle, and a scrollable body.
 * Controlled: pass `open` / `onOpenChange` and render your own trigger.
 */
export function BottomSheet({
  title,
  description,
  footer,
  bodyClassName,
  showHandle = true,
  children,
  ...props
}: BottomSheetProps) {
  return (
    <Sheet {...props}>
      <SheetContent
        side="bottom"
        className="rounded-t-2xl pb-[env(safe-area-inset-bottom)] max-h-[85svh]"
      >
        {showHandle ? (
          <div
            className="mx-auto h-1.5 w-10 shrink-0 rounded-full bg-border"
            aria-hidden
          />
        ) : null}
        {title || description ? (
          <SheetHeader>
            {title ? <SheetTitle>{title}</SheetTitle> : null}
            {description ? (
              <SheetDescription>{description}</SheetDescription>
            ) : null}
          </SheetHeader>
        ) : null}
        <div className={cn("min-h-0 flex-1 overflow-y-auto px-4 pb-4", bodyClassName)}>
          {children}
        </div>
        {footer ? <SheetFooter>{footer}</SheetFooter> : null}
      </SheetContent>
    </Sheet>
  )
}
