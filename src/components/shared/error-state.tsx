import * as React from "react"
import { AlertCircleIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

export interface ErrorStateProps extends Omit<React.ComponentProps<"div">, "title"> {
  icon?: React.ComponentType<{ className?: string }>
  title?: React.ReactNode
  description?: React.ReactNode
  onRetry?: () => void
  retryLabel?: string
}

/**
 * Standard error state (SS15). Provide `onRetry` to surface a recovery action -
 * never leave the user stuck on an error with no next step.
 */
export function ErrorState({
  icon: Icon = AlertCircleIcon,
  title = "Something went wrong",
  description,
  onRetry,
  retryLabel = "Retry",
  className,
  ...props
}: ErrorStateProps) {
  return (
    <div
      role="alert"
      className={cn(
        "flex flex-col items-center justify-center gap-3 rounded-lg border border-destructive/30 bg-destructive/5 p-8 text-center",
        className
      )}
      {...props}
    >
      <div className="flex size-12 items-center justify-center rounded-full bg-destructive/15 text-destructive">
        <Icon className="size-6" aria-hidden />
      </div>
      <div className="space-y-1">
        <p className="font-heading text-base font-medium text-dt-txt">{title}</p>
        {description ? (
          <p className="mx-auto max-w-sm text-sm text-dt-dim">
            {description}
          </p>
        ) : null}
      </div>
      {onRetry ? (
        <Button type="button" variant="outline" size="sm" onClick={onRetry}>
          {retryLabel}
        </Button>
      ) : null}
    </div>
  )
}
