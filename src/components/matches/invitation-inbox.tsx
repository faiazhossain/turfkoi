"use client"

import { useTransition } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"

import { useI18n } from "@/i18n/client"
import { formatSlotTime } from "@/lib/format-time"

import { Button } from "@/components/ui/button"
import { respondToMatchInvitationAction } from "@/features/matches/actions"

export interface MyInvitation {
  id: string
  invitedByName: string | null
  squadRoleWanted: "starting" | "substitute"
  turfName: string
  date: string
  slotStart: string
  /** More invites are out than open seats — first to accept wins. */
  contested: boolean
  /** False once the side has no claimable seat (show the "late" state). */
  seatAvailable: boolean
}

/** Accept/decline for invitations addressed to the current user. */
export function InvitationInbox({ invitations }: { invitations: MyInvitation[] }) {
  const router = useRouter()
  const { t, locale } = useI18n()
  const [pending, start] = useTransition()

  function respond(id: string, accept: boolean) {
    start(async () => {
      const res = await respondToMatchInvitationAction(id, accept)
      if (!res.ok) {
        toast.error(t(res.error ?? "errors.generic"))
        return
      }
      toast.success(t(accept ? "matches.invite.acceptedToast" : "matches.invite.declinedToast"))
      router.refresh()
    })
  }

  return (
    <section className="space-y-2">
      <h3 className="font-heading text-sm font-semibold">
        {t("matches.invite.inboxTitle")}
      </h3>
      <ul className="divide-y divide-dt-line overflow-hidden rounded-lg border border-dt-line">
        {invitations.map((inv) => (
          <li key={inv.id} className="space-y-2 bg-dt-card p-3 text-sm">
            <p className="font-medium">
              {t("matches.invite.invitedBy", {
                name: inv.invitedByName ?? "—",
              })}
            </p>
            <p className="text-xs text-dt-dim">
              {inv.turfName} · <span className="font-mono">
                {inv.date} · {formatSlotTime(inv.slotStart.slice(0, 5), locale)}
              </span>
              {" · "}
              {inv.squadRoleWanted === "substitute"
                ? t("matches.squad.substitutes")
                : t("matches.squad.starting")}
            </p>
            {!inv.seatAvailable ? (
              <p className="text-xs font-medium text-amber-700 dark:text-amber-400">
                {t("matches.invite.seatTakenHint")}
              </p>
            ) : inv.contested ? (
              <p className="text-xs font-medium text-amber-700 dark:text-amber-400">
                {t("matches.invite.urgencyHint")}
              </p>
            ) : null}
            <div className="flex gap-2">
              <Button
                size="sm"
                onClick={() => respond(inv.id, true)}
                loading={pending}
                disabled={!inv.seatAvailable}
              >
                {t("matches.invite.accept")}
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => respond(inv.id, false)}
                loading={pending}
              >
                {t("matches.invite.decline")}
              </Button>
            </div>
          </li>
        ))}
      </ul>
    </section>
  )
}
