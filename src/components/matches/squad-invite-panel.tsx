"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"

import { useI18n } from "@/i18n/client"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { GuestAddForm } from "@/components/matches/guest-add-form"
import { inviteMatchPlayersAction } from "@/features/matches/actions"
import type { RecentGuestPick } from "@/features/matches/guests"

interface SquadInvitePanelProps {
  matchId: string
  /** The user's friends not already on the roster — per-friend invite. */
  friends: { userId: string; name: string | null; phone: string }[]
  /** Players the user added to previous matches — guest quick-add chips. */
  recentGuests?: RecentGuestPick[]
}

/**
 * "Add players to your side" — phone invitations, friend invites, and the
 * guest add form for a side captain. Content-only: it renders inside the
 * add-players modal (ButtonModal owns the trigger and dialog header).
 */
export function SquadInvitePanel({
  matchId,
  friends,
  recentGuests,
}: SquadInvitePanelProps) {
  const router = useRouter()
  const { t } = useI18n()
  const [pending, start] = useTransition()
  const [phone, setPhone] = useState("")

  /** Invite a phone (and nothing else) — they must accept. */
  function invitePhone() {
    if (!phone.trim()) return
    start(async () => {
      const res = await inviteMatchPlayersAction({
        matchId,
        phones: [phone.trim()],
      })
      if (!res.ok) {
        toast.error(t(res.error ?? "errors.generic"))
        return
      }
      toast.success(t("matches.invite.sent"))
      setPhone("")
      router.refresh()
    })
  }

  function inviteFriend(userId: string) {
    start(async () => {
      const res = await inviteMatchPlayersAction({ matchId, userIds: [userId] })
      if (!res.ok) {
        toast.error(t(res.error ?? "errors.generic"))
        return
      }
      toast.success(t("matches.invite.sent"))
      router.refresh()
    })
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">
        {t("matches.invite.overInviteHint")}
      </p>
      <div className="flex flex-wrap items-end gap-2">
        <div className="space-y-1">
          <Label htmlFor="invite-phone" className="text-xs">
            {t("matches.invite.phoneLabel")}
          </Label>
          <Input
            id="invite-phone"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            inputMode="tel"
            className="w-40"
          />
        </div>
        <Button
          size="sm"
          onClick={invitePhone}
          loading={pending}
          disabled={!phone.trim()}
        >
          {t("matches.invite.cta")}
        </Button>
      </div>
      {friends.length > 0 ? (
        <div className="space-y-2">
          <p className="text-sm font-medium">{t("matches.invite.friendsTitle")}</p>
          <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border">
            {friends.map((f) => (
              <li key={f.userId} className="flex items-center justify-between gap-2 bg-card p-2.5 text-sm">
                <span className="min-w-0 truncate">{f.name ?? f.phone}</span>
                <Button
                  size="xs"
                  variant="outline"
                  onClick={() => inviteFriend(f.userId)}
                  loading={pending}
                >
                  {t("matches.invite.cta")}
                </Button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      <GuestAddForm matchId={matchId} recentGuests={recentGuests} />
    </div>
  )
}
