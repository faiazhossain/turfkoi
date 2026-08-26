import { InfoIcon } from "lucide-react"

import { getT } from "@/i18n/server"

/**
 * Concept explainer for the slots dashboard. Keeps the three ideas straight:
 * weekly hours create slots, a day tap overrides that day, one-off slots are
 * exceptions. Server component — no state.
 */
export async function HowSlotsWork() {
  const t = await getT()
  return (
    <div className="flex items-start gap-2.5 rounded-xl border border-border bg-card/60 px-4 py-3 text-sm text-muted-foreground">
      <InfoIcon className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
      <p>
        <span className="font-medium text-foreground">
          {t("turfOwner.schedule.howTitle")}
        </span>{" "}
        {t("turfOwner.schedule.howDesc")}
      </p>
    </div>
  )
}
