"use client"

import { useTransition } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"

import { useI18n } from "@/i18n/client"
import { CheckIcon, XIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  acceptPlayerRequestAction,
  rejectPlayerRequestAction,
} from "@/features/player/actions"

interface RequestItem {
  matchId: string
  userId: string
  playerName: string | null
  playerPhone: string
}

interface RequestManagerProps {
  /** The accepting captain's side — the player is seated there. */
  side: "home" | "away"
  requests: RequestItem[]
}

export function RequestManager({ side, requests }: RequestManagerProps) {
  const router = useRouter()
  const { t } = useI18n()
  const [pending, start] = useTransition()

  if (requests.length === 0) return null

  function accept(matchId: string, userId: string) {
    start(async () => {
      const res = await acceptPlayerRequestAction(matchId, userId, side)
      if (!res.ok) {
        toast.error(t(res.error ?? "errors.generic"))
        return
      }
      toast.success(t("matches.playerAdded"))
      router.refresh()
    })
  }

  function reject(matchId: string, userId: string) {
    start(async () => {
      const res = await rejectPlayerRequestAction(matchId, userId)
      if (!res.ok) {
        toast.error(t(res.error ?? "errors.generic"))
        return
      }
      toast.success(t("matches.requestRejected"))
      router.refresh()
    })
  }

  return (
    <section className="space-y-2">
      <h3 className="font-heading text-sm font-semibold">
        {t("matches.joinRequests", { count: requests.length })}
      </h3>
      <ul className="divide-y divide-dt-line overflow-hidden rounded-lg border border-dt-line">
        {requests.map((r) => (
          <li
            key={`${r.matchId}-${r.userId}`}
            className="flex items-center justify-between gap-2 bg-dt-card p-3 text-sm"
          >
            <div className="min-w-0">
              <p className="truncate font-medium">
                {r.playerName ?? r.playerPhone}
              </p>
              {r.playerName ? (
                <p className="truncate text-xs text-dt-dim">
                  {r.playerPhone}
                </p>
              ) : null}
            </div>
            <div className="flex items-center gap-1">
              <Button
                size="icon-sm"
                variant="outline"
                aria-label={t("common.accept")}
                onClick={() => accept(r.matchId, r.userId)}
                loading={pending}
              >
                <CheckIcon aria-hidden />
              </Button>
              <Button
                size="icon-sm"
                variant="ghost"
                aria-label={t("common.reject")}
                onClick={() => reject(r.matchId, r.userId)}
                loading={pending}
              >
                <XIcon aria-hidden />
              </Button>
            </div>
          </li>
        ))}
      </ul>
    </section>
  )
}
