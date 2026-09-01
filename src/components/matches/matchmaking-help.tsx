"use client"

import { InfoIcon } from "lucide-react"

import { useI18n } from "@/i18n/client"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"

/**
 * "কীভাবে কাজ করে?" — unobtrusive ⓘ trigger with a 5-step visual explainer
 * of the whole matchmaking flow. Shown in the match room and the creation
 * wizard; never blocks the main UI.
 */
export function MatchmakingHelp() {
  const { t } = useI18n()

  return (
    <Dialog>
      <DialogTrigger
        render={(props) => (
          <button
            type="button"
            aria-label={t("matches.help.triggerAria")}
            className="inline-flex items-center gap-1 rounded-full border border-dt-line bg-dt-card px-2.5 py-1 text-xs font-medium text-dt-dim transition-colors hover:bg-dt-card2/40 hover:text-dt-txt"
            {...props}
          >
            <InfoIcon className="size-3.5" aria-hidden />
            {t("matches.help.triggerAria")}
          </button>
        )}
      />
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle className="font-heading text-base">
            {t("matches.help.title")}
          </DialogTitle>
          <DialogDescription className="sr-only">
            {t("matches.help.title")}
          </DialogDescription>
        </DialogHeader>
        <ol className="space-y-3">
          {([1, 2, 3, 4, 5] as const).map((n) => (
            <li key={n} className="flex items-start gap-3">
              <span
                aria-hidden
                className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-dt-green/10 font-heading text-xs font-bold text-dt-green"
              >
                {n}
              </span>
              <div className="min-w-0">
                <p className="text-sm font-semibold leading-snug">
                  {t(`matches.help.step${n}Title`)}
                </p>
                <p className="mt-0.5 text-sm leading-snug text-dt-dim">
                  {t(`matches.help.step${n}`)}
                </p>
              </div>
            </li>
          ))}
        </ol>
      </DialogContent>
    </Dialog>
  )
}
