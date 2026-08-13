import * as React from "react"

import { Skeleton } from "@/components/ui/skeleton"
import { cn } from "@/lib/utils"

export interface LoadingStateProps extends React.ComponentProps<"div"> {
  /** Number of skeleton rows to render. */
  rows?: number
  /** Accessible label announced to screen readers. */
  label?: string
}

/**
 * Standard loading state (SS15). Announced as busy to assistive tech.
 */
export function LoadingState({
  rows = 3,
  label = "Loading",
  className,
  ...props
}: LoadingStateProps) {
  return (
    <div
      className={cn("space-y-3", className)}
      role="status"
      aria-busy="true"
      aria-live="polite"
      {...props}
    >
      <Skeleton className="h-5 w-1/4" />
      {Array.from({ length: rows }).map((_, i) => (
        <Skeleton key={i} className="h-16 w-full rounded-lg" />
      ))}
      <span className="sr-only">{label}</span>
    </div>
  )
}
