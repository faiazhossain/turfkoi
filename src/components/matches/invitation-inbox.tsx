"use client"

import { useTransition } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"

import { useI18n } from "@/i18n/client"

import { Button } from "@/components/ui/button"
import { respondToMatchInvitationAction } from "@/features/matches/actions"

export interface MyInvitation {
  id: string
  invitedByName: string | null
  squadRoleWanted: "starting" | "substitute"
  turfName: string
  date: string
  slotStart: string
}

/** Accept/decline for invitations addressed to the current user. */
export function InvitationInbox({ invitations }: { invitations: MyInvitation[] }) {
  const router = useRouter()
  const { t } = useI18n()
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
      <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border">
        {invitations.map((inv) => (
          <li key={inv.id} className="space-y-2 bg-card p-3 text-sm">
            <p className="font-medium">
              {t("matches.invite.invitedBy", {
                name: inv.invitedByName ?? "—",
              })}
            </p>
            <p className="text-xs text-muted-foreground">
              {inv.turfName} · <span className="font-mono">
                {inv.date} · {inv.slotStart.slice(0, 5)}
              </span>
              {" · "}
              {inv.squadRoleWanted === "substitute"
                ? t("matches.squad.substitutes")
                : t("matches.squad.starting")}
            </p>
            <div className="flex gap-2">
              <Button size="sm" onClick={() => respond(inv.id, true)} loading={pending}>
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
