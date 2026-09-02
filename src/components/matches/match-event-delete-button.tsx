"use client"

import { useTransition } from "react"
import { useRouter } from "next/navigation"
import { XIcon } from "lucide-react"
import { toast } from "sonner"

import { useI18n } from "@/i18n/client"
import { deleteMatchEventAction } from "@/features/matches/actions"

/** Remove one logged event — an authorized-logger-only client island. */
export function MatchEventDeleteButton({
  matchId,
  eventId,
}: {
  matchId: string
  eventId: string
}) {
  const { t } = useI18n()
  const router = useRouter()
  const [pending, start] = useTransition()

  function remove() {
    start(async () => {
      const res = await deleteMatchEventAction({ matchId, eventId })
      if (!res.ok) {
        toast.error(t(res.error ?? "errors.generic"))
        return
      }
      toast.success(t("matches.events.deleted"))
      router.refresh()
    })
  }

  return (
    <button
      type="button"
      onClick={remove}
      disabled={pending}
      aria-busy={pending || undefined}
      aria-label={t("matches.events.deleted")}
      className="rounded-lg p-1.5 text-dt-dim transition-colors hover:bg-dt-card2 hover:text-dt-txt disabled:pointer-events-none disabled:opacity-50"
    >
      <XIcon className="size-4" aria-hidden />
    </button>
  )
}
