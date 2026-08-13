import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import {
  CheckCircle2Icon,
  InfoIcon,
  AlertTriangleIcon,
  XCircleIcon,
  CircleDashedIcon,
} from "lucide-react"

import { cn } from "@/lib/utils"

const statusBadgeVariants = cva(
  "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium whitespace-nowrap",
  {
    variants: {
      status: {
        success: "border-transparent bg-success/15 text-success",
        info: "border-transparent bg-info/15 text-info",
        warning: "border-transparent bg-warning/15 text-warning",
        danger: "border-transparent bg-destructive/15 text-destructive",
        primary: "border-transparent bg-primary/15 text-primary",
        neutral: "border-border bg-muted text-muted-foreground",
      },
    },
    defaultVariants: { status: "neutral" },
  }
)

type Status = NonNullable<VariantProps<typeof statusBadgeVariants>["status"]>

const statusIconMap: Record<
  Status,
  React.ComponentType<{ className?: string; "aria-hidden"?: boolean }>
> = {
  success: CheckCircle2Icon,
  info: InfoIcon,
  warning: AlertTriangleIcon,
  danger: XCircleIcon,
  primary: CircleDashedIcon,
  neutral: CircleDashedIcon,
}

export interface StatusBadgeProps
  extends React.ComponentProps<"span">,
    VariantProps<typeof statusBadgeVariants> {
  /** Override the default icon for this status. */
  icon?: React.ComponentType<{ className?: string }>
  /** Set false to render text only (color is never the sole signal in copy). */
  showIcon?: boolean
}

/**
 * Status pill. Always pairs color with an icon + text (SS17: never color alone).
 */
export function StatusBadge({
  status,
  icon,
  showIcon = true,
  className,
  children,
  ...props
}: StatusBadgeProps) {
  const Icon = icon ?? statusIconMap[status ?? "neutral"]
  return (
    <span className={cn(statusBadgeVariants({ status }), className)} {...props}>
      {showIcon && Icon ? <Icon className="size-3 shrink-0" aria-hidden /> : null}
      {children}
    </span>
  )
}
