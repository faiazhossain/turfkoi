"use client"

import { useState, type ReactNode } from "react"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { cn } from "@/lib/utils"

/**
 * Button-triggered modal for the match page: the page stays informational
 * and every recruiting/share action opens in a dialog instead of an inline
 * section. Server components pass the dialog body as `children`.
 * `defaultOpen` re-opens the dialog after URL-driven re-renders (e.g. the
 * player search filters push `?player_q=` and the server re-renders).
 */
export function ButtonModal({
  label,
  icon,
  variant = "default",
  triggerClassName,
  title,
  description,
  contentClassName,
  defaultOpen = false,
  children,
}: {
  /** Trigger button text. */
  label: string
  icon?: ReactNode
  variant?: "default" | "outline" | "secondary" | "ghost"
  triggerClassName?: string
  title: string
  description?: string
  contentClassName?: string
  defaultOpen?: boolean
  children: ReactNode
}) {
  const [open, setOpen] = useState(defaultOpen)
  const [lastDefaultOpen, setLastDefaultOpen] = useState(defaultOpen)

  // Re-open after server re-renders that flip defaultOpen (URL filters);
  // user closes still win until the prop changes again.
  if (lastDefaultOpen !== defaultOpen) {
    setLastDefaultOpen(defaultOpen)
    setOpen(defaultOpen)
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button
            variant={variant}
            size="lg"
            className={cn("w-full justify-center sm:w-auto", triggerClassName)}
          />
        }
      >
        {icon}
        {label}
      </DialogTrigger>
      <DialogContent
        className={cn(
          "max-h-[85dvh] gap-3 overflow-y-auto sm:max-w-lg",
          contentClassName
        )}
      >
        <DialogHeader>
          <DialogTitle className="font-heading">{title}</DialogTitle>
          {description ? (
            <DialogDescription>{description}</DialogDescription>
          ) : null}
        </DialogHeader>
        {children}
      </DialogContent>
    </Dialog>
  )
}
