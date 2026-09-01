"use client"

import { useEffect, useState, useTransition } from "react"
import { toast } from "sonner"

import { useI18n } from "@/i18n/client"

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Loader } from "@/components/ui/loader"
import { listInvitableMatchesAction } from "@/features/player/actions"
import { inviteMatchPlayersAction } from "@/features/matches/actions"

export interface InvitableMatchOption {
  id: string
  matchType: string
  date: string
  slotStart: string
  turfName: string
}

/**
 * Player Network "Invite to Match" picker (controlled dialog — no trigger;
 * parents open it by setting `target`). Lists the viewer's own matches with
 * open seats on their side; picking one sends the invitation via the
 * existing match invitation action (accept → roster stays captain-gated).
 * `matches === null` means "still loading"; [] means no eligible match.
 */
export function InviteToMatchDialog({
  target,
  onClose,
}: {
  target: { userId: string; name: string } | null
  onClose: () => void
}) {
  const { t } = useI18n()
  const [matches, setMatches] = useState<InvitableMatchOption[] | null>(null)
  const [pending, start] = useTransition()

  useEffect(() => {
    if (!target) return
    let alive = true
    listInvitableMatchesAction()
      .then((rows) => {
        if (alive) setMatches(rows as InvitableMatchOption[])
      })
      .catch(() => {
        if (alive) setMatches([])
      })
    return () => {
      alive = false
    }
  }, [target])

  function invite(matchId: string) {
    if (!target) return
    start(async () => {
      const res = await inviteMatchPlayersAction({
        matchId,
        userIds: [target.userId],
      })
      if (!res.ok) {
        toast.error(t(res.error ?? "errors.generic"))
        return
      }
      toast.success(t("players.inviteSent"))
      onClose()
    })
  }

  return (
    <Dialog open={target !== null} onOpenChange={(open) => !open && onClose()}>
      {target ? (
        <DialogContent className="max-h-[85dvh] gap-3 overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="font-heading">
              {t("players.inviteToMatchTitle")}
            </DialogTitle>
            <DialogDescription>
              {t("players.inviteToMatchDesc")}
            </DialogDescription>
          </DialogHeader>
          {matches === null ? (
            <div className="flex justify-center py-6">
              <Loader size={40} label={t("common.loading")} />
            </div>
          ) : matches.length === 0 ? (
            <p className="rounded-lg border border-dashed border-dt-line p-6 text-center text-sm text-dt-dim">
              {t("players.noEligibleMatch")}
            </p>
          ) : (
            <ul className="space-y-2">
              {matches.map((m) => (
                <li key={m.id}>
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => invite(m.id)}
                    className="flex w-full items-center justify-between gap-3 rounded-lg border border-dt-line bg-dt-card p-3 text-left text-sm transition-colors hover:border-dt-green disabled:opacity-60"
                  >
                    <span className="min-w-0">
                      <span className="block font-medium">
                        {m.date} {m.slotStart} · {m.matchType}
                      </span>
                      <span className="block truncate text-xs text-dt-dim">
                        {m.turfName}
                      </span>
                    </span>
                    <span className="shrink-0 text-xs font-semibold text-dt-green">
                      {t("players.inviteToMatch")} ›
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </DialogContent>
      ) : null}
    </Dialog>
  )
}
