"use client"

import { useState, useTransition } from "react"
import { toast } from "sonner"

import { useI18n } from "@/i18n/client"

import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { InviteToMatchDialog } from "@/components/players/invite-to-match-dialog"
import {
  sendFriendRequestAction,
  removeFriendAction,
  blockUserAction,
  unblockUserAction,
} from "@/features/friends/actions"

export type ProfileRelation =
  | "none"
  | "self"
  | "friends"
  | "outgoing"
  | "incoming"
  | "blocked"

/**
 * Signed-in viewer actions on a public player profile (Player Network):
 * friend-state buttons, invite-to-match, and the ••• block/unblock menu.
 * `friendshipId` (server-provided, accepted pairs only) powers Remove.
 * `blockedByViewer` distinguishes who holds the block — the target's own
 * block is not revealed beyond "interaction is off".
 */
export function ProfileActions({
  targetUserId,
  targetName,
  relation,
  friendshipId,
  blockedByViewer,
}: {
  targetUserId: string
  targetName: string
  relation: ProfileRelation
  /** friendship row id when the pair is friends, else null. */
  friendshipId: string | null
  blockedByViewer: boolean
}) {
  const { t } = useI18n()
  const [pending, start] = useTransition()
  const [relationState, setRelationState] = useState<ProfileRelation>(relation)
  const [inviteOpen, setInviteOpen] = useState(false)

  function sendRequest() {
    start(async () => {
      const res = await sendFriendRequestAction({ userId: targetUserId })
      if (!res.ok) {
        toast.error(t(res.error ?? "errors.generic"))
        return
      }
      toast.success(t("friends.requestSent"))
      // The send action auto-accepts a reverse-pending request.
      setRelationState(relationState === "incoming" ? "friends" : "outgoing")
    })
  }

  function removeFriend() {
    if (!friendshipId) return
    start(async () => {
      const res = await removeFriendAction({ friendshipId })
      if (!res.ok) {
        toast.error(t(res.error ?? "errors.generic"))
        return
      }
      toast.success(t("friends.removedToast"))
      setRelationState("none")
    })
  }

  function block() {
    if (!window.confirm(t("friends.blockConfirm", { name: targetName }))) return
    start(async () => {
      const res = await blockUserAction({ userId: targetUserId })
      if (!res.ok) {
        toast.error(t(res.error ?? "errors.generic"))
        return
      }
      toast.success(t("friends.blockedToast", { name: targetName }))
      setRelationState("blocked")
    })
  }

  function unblock() {
    start(async () => {
      const res = await unblockUserAction({ userId: targetUserId })
      if (!res.ok) {
        toast.error(t(res.error ?? "errors.generic"))
        return
      }
      toast.success(t("friends.unblockedToast", { name: targetName }))
      setRelationState("none")
    })
  }

  if (relationState === "self") return null

  return (
    <div className="flex flex-wrap items-center gap-2">
      {relationState === "none" ? (
        <Button size="sm" onClick={sendRequest} loading={pending}>
          {t("friends.addFriend")}
        </Button>
      ) : null}
      {relationState === "outgoing" ? (
        <Button size="sm" variant="secondary" disabled>
          {t("friends.pendingRequest")}
        </Button>
      ) : null}
      {relationState === "incoming" ? (
        <Button size="sm" onClick={sendRequest} loading={pending}>
          {t("friends.accept")}
        </Button>
      ) : null}
      {relationState === "friends" ? (
        <Button size="sm" variant="secondary" onClick={removeFriend} loading={pending}>
          {t("friends.remove")}
        </Button>
      ) : null}

      {relationState === "blocked" ? (
        <Button size="sm" variant="outline" onClick={unblock} loading={pending}>
          {t("friends.unblock")}
        </Button>
      ) : relationState === "friends" || relationState === "none" ? (
        <Button
          size="sm"
          variant="outline"
          onClick={() => setInviteOpen(true)}
          loading={pending}
        >
          {t("players.inviteToMatch")}
        </Button>
      ) : null}

      {relationState !== "blocked" ? (
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button size="sm" variant="ghost" aria-label={t("friends.more")} />
            }
          >
            •••
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {blockedByViewer ? (
              <DropdownMenuItem onSelect={unblock} disabled={pending}>
                {t("friends.unblock")}
              </DropdownMenuItem>
            ) : (
              <DropdownMenuItem variant="destructive" onSelect={block} disabled={pending}>
                {t("friends.block")}
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      ) : null}

      <InviteToMatchDialog
        key={inviteOpen ? "open" : "closed"}
        target={inviteOpen ? { userId: targetUserId, name: targetName } : null}
        onClose={() => setInviteOpen(false)}
      />
    </div>
  )
}
