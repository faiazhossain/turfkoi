import { AlertTriangleIcon } from "lucide-react"

import { getT } from "@/i18n/server"

import type { SlotConflict } from "@/features/turfs/materialize"

/**
 * Needs-attention center (slot system P3.2): slots the materializer refused
 * to touch because a booking or the owner's hand work sits where the active
 * schedule no longer agrees. Read-only for now — the owner resolves these in
 * the day panel (block/reprice/contact bookers). P3.4 conflict resolution is
 * the follow-up.
 */
export async function SlotConflictsCard({
  conflicts,
}: {
  conflicts: SlotConflict[]
}) {
  const t = await getT()
  if (conflicts.length === 0) return null

  return (
    <section className="space-y-2 rounded-lg border border-warning bg-warning/10 p-4">
      <div className="flex items-center gap-2">
        <AlertTriangleIcon className="size-4 text-warning" aria-hidden />
        <h3 className="font-heading text-sm font-semibold">
          {t("turfOwner.schedule.needsAttention", { count: conflicts.length })}
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
              {t(`turfOwner.schedule.conflictBadge.${c.kind}`)}
            </span>
            <span className="text-xs text-muted-foreground">
              {c.kind === "booked_duration_mismatch" &&
              c.wantedMinutes != null
                ? t("turfOwner.schedule.conflictMinutes", {
                    got: c.durationMinutes,
                    want: c.wantedMinutes,
                  })
                : t(`turfOwner.schedule.conflictDetail.${c.kind}`)}
            </span>
          </li>
        ))}
      </ul>
    </section>
  )
}
