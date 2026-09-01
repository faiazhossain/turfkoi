import * as React from "react"

import { cn } from "@/lib/utils"

function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        "flex field-sizing-content min-h-16 w-full rounded-lg border border-dt-input bg-transparent px-2.5 py-2 text-base transition-colors outline-none placeholder:text-dt-dim focus-visible:border-dt-green focus-visible:ring-3 focus-visible:ring-dt-green/50 disabled:cursor-not-allowed disabled:bg-dt-input/50 disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 md:text-sm dark:bg-dt-input/30 dark:disabled:bg-dt-input/80 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40",
        className
      )}
      {...props}
    />
  )
}

export { Textarea }
