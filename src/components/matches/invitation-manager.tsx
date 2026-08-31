"use client"

import { useTransition } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"

import { useI18n } from "@/i18n/client"

import { Button } from "@/components/ui/button"
import { cancelMatchInvitationAction } from "@/features/matches/actions"

export interface PendingInvitation {
  id: string
  /** null when invited by phone only. */
  playerName: string | null
  playerPhone: string | null
}

/** Pending outbound invitations with cancel — shown to match managers. */
export function InvitationManager({
  invitations,
}: {
  matchId: string
  invitations: PendingInvitation[]
}) {
  const router = useRouter()
  const { t } = useI18n()
  const [pending, start] = useTransition()

  function cancel(id: string) {
    start(async () => {
      const res = await cancelMatchInvitationAction(id)
      if (!res.ok) {
        toast.error(t(res.error ?? "errors.generic"))
        return
      }
      toast.success(t("matches.invite.cancelled"))
      router.refresh()
    })
  }

  return (
    <section className="space-y-2">
      <h3 className="font-heading text-sm font-semibold">
        {t("matches.invite.pendingCount", { count: invitations.length })}
      </h3>
      <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border">
        {invitations.map((inv) => (
          <li
            key={inv.id}
            className="flex items-center justify-between gap-2 bg-card p-2.5 text-sm"
          >
            <span className="min-w-0 truncate">
              {inv.playerName ?? inv.playerPhone}
            </span>
            <Button
              size="xs"
              variant="ghost"
              onClick={() => cancel(inv.id)}
              loading={pending}
            >
              {t("matches.invite.cancel")}
            </Button>
          </li>
        ))}
      </ul>
    </section>
  )
}
