import * as React from "react"

import { cn } from "@/lib/utils"

export interface EmptyStateProps extends Omit<React.ComponentProps<"div">, "title"> {
  icon?: React.ComponentType<{ className?: string }>
  title: React.ReactNode
  description?: React.ReactNode
  action?: React.ReactNode
}

/**
 * Standard empty state (SS15). Pair with feature copy: lead with the value of
 * the action the user should take next.
 */
export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
  ...props
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-dt-line p-8 text-center",
        className
      )}
      {...props}
    >
      {Icon ? (
        <div className="flex size-12 items-center justify-center rounded-full bg-dt-card2 text-dt-dim">
          <Icon className="size-6" aria-hidden />
        </div>
      ) : null}
      <div className="space-y-1">
        <p className="font-heading text-base font-medium text-dt-txt">{title}</p>
        {description ? (
          <p className="mx-auto max-w-sm text-sm text-dt-dim">
            {description}
          </p>
        ) : null}
      </div>
      {action ? <div className="mt-1">{action}</div> : null}
    </div>
  )
}
