import { cn } from "@/lib/utils"

interface KpiTileProps {
  label: string
  value: string | number
  hint?: string
  className?: string
}

export function KpiTile({ label, value, hint, className }: KpiTileProps) {
  return (
    <div
      className={cn(
        "rounded-lg border border-dt-line bg-dt-card p-4 ring-1 ring-foreground/5",
        className
      )}
    >
      <p className="text-xs font-medium uppercase tracking-wide text-dt-dim">
        {label}
      </p>
      <p className="mt-2 font-heading text-2xl font-semibold tabular-nums">
        {value}
      </p>
      {hint ? (
        <p className="mt-1 text-xs text-dt-dim">{hint}</p>
      ) : null}
    </div>
  )
}
