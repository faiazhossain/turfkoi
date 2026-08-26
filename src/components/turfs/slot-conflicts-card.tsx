import { AlertTriangleIcon } from "lucide-react"

import type { SlotConflict } from "@/features/turfs/materialize"

const KIND_LABEL: Record<SlotConflict["kind"], string> = {
  booked_outside_plan: "Booking outside the schedule",
  booked_duration_mismatch: "Booking length changed",
  kept_manual: "Custom slot kept",
}

/**
 * Needs-attention center (slot system P3.2): slots the materializer refused
 * to touch because a booking or the owner's hand work sits where the active
 * schedule no longer agrees. Read-only for now — the owner resolves these in
 * the day panel (block/reprice/contact bookers). P3.4 conflict resolution is
 * the follow-up.
 */
export function SlotConflictsCard({ conflicts }: { conflicts: SlotConflict[] }) {
  if (conflicts.length === 0) return null

  return (
    <section className="space-y-2 rounded-lg border border-warning bg-warning/10 p-4">
      <div className="flex items-center gap-2">
        <AlertTriangleIcon className="size-4 text-warning" aria-hidden />
        <h3 className="font-heading text-sm font-semibold">
          Needs attention ({conflicts.length})
        </h3>
      </div>
      <ul className="space-y-1.5 text-sm">
        {conflicts.map((c) => (
          <li
            key={`${c.date}|${c.startTime}|${c.kind}`}
            className="flex flex-wrap items-center gap-2"
          >
            <span className="font-mono text-xs">
              {c.date} · {c.startTime}
            </span>
            <span className="rounded border border-border bg-card px-1.5 py-0.5 text-[0.65rem] text-foreground">
              {KIND_LABEL[c.kind]}
            </span>
            <span className="text-xs text-muted-foreground">{c.detail}</span>
          </li>
        ))}
      </ul>
    </section>
  )
}
