"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { Trash2Icon, CrownIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { StatusBadge } from "@/components/shared"
import {
  addMemberAction,
  updateMemberRoleAction,
  removeMemberAction,
  transferOwnershipAction,
} from "@/features/teams/actions"
import { useI18n, translateError } from "@/i18n/client"
import { teamMemberRoleLabel } from "@/i18n/labels"

interface Member {
  userId: string
  phone: string
  name: string | null
  role: "owner" | "captain" | "manager" | "player"
  joinedAt: Date
}

interface Invitation {
  id: string
  phone: string
  role: "owner" | "captain" | "manager" | "player"
  createdAt: Date
}

interface MemberManagerProps {
  teamId: string
  members: Member[]
  invitations: Invitation[]
  canManage: boolean
  isOwner: boolean
  currentUserId: string
}

const ROLE_TONE: Record<string, "primary" | "success" | "warning" | "neutral"> = {
  owner: "primary",
  captain: "success",
  manager: "warning",
  player: "neutral",
}

export function MemberManager({
  teamId,
  members,
  invitations,
  canManage,
  isOwner,
  currentUserId,
}: MemberManagerProps) {
  const router = useRouter()
  const { t } = useI18n()
  const [pending, start] = useTransition()
  const [phone, setPhone] = useState("")
  const [transferTarget, setTransferTarget] = useState<string | null>(null)

  function add() {
    start(async () => {
      const res = await addMemberAction(teamId, { phone, role: "player" })
      if (!res.ok) {
        toast.error(translateError(res.error, t))
        return
      }
      toast.success(t("team.memberAdded"))
      setPhone("")
      router.refresh()
    })
  }

  function changeRole(userId: string, role: string) {
    start(async () => {
      const res = await updateMemberRoleAction({ teamId, userId, role: role as "player" | "captain" | "manager" })
      if (!res.ok) {
        toast.error(translateError(res.error, t))
        return
      }
      toast.success(t("team.roleUpdated"))
      router.refresh()
    })
  }

  function remove(userId: string) {
    if (!confirm(t("team.removeMemberConfirm"))) return
    start(async () => {
      const res = await removeMemberAction(teamId, userId)
      if (!res.ok) {
        toast.error(translateError(res.error, t))
        return
      }
      toast.success(t("team.memberRemoved"))
      router.refresh()
    })
  }

  function transfer(newOwnerId: string) {
    start(async () => {
      const res = await transferOwnershipAction({ teamId, newOwnerId })
      if (!res.ok) {
        toast.error(translateError(res.error, t))
        return
      }
      toast.success(t("team.ownershipTransferred"))
      setTransferTarget(null)
      router.refresh()
    })
  }

  return (
    <div className="space-y-6">
      {canManage ? (
        <section className="space-y-2">
          <h3 className="font-heading text-sm font-semibold">{t("team.addMemberTitle")}</h3>
          <p className="text-sm text-muted-foreground">{t("team.addMemberDesc")}</p>
          <div className="flex items-end gap-2">
            <div className="flex-1 space-y-1.5">
              <Label htmlFor="phone" className="sr-only">
                {t("team.phoneLabel")}
              </Label>
              <Input
                id="phone"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+8801XXXXXXXXX"
              />
            </div>
            <Button onClick={add} loading={pending} disabled={phone.length < 6}>
              {t("common.add")}
            </Button>
          </div>
        </section>
      ) : null}

      <section className="space-y-2">
        <h3 className="font-heading text-sm font-semibold">
          {t("team.membersCount", { count: members.length })}
        </h3>
        <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border">
          {members.map((m) => (
            <li
              key={m.userId}
              className="flex flex-wrap items-center justify-between gap-2 bg-card p-3 text-sm"
            >
              <div className="min-w-0">
                <p className="truncate font-medium">
                  {m.name ?? m.phone}
                  {m.userId === currentUserId ? (
                    <span className="ml-1 text-xs text-muted-foreground">{t("team.you")}</span>
                  ) : null}
                </p>
                {m.name ? (
                  <p className="truncate text-xs text-muted-foreground">
                    {m.phone}
                  </p>
                ) : null}
              </div>
              <div className="flex items-center gap-2">
                {canManage && m.role !== "owner" ? (
                  <Select
                    value={m.role}
                    onValueChange={(v) => v && changeRole(m.userId, v)}
                    disabled={pending}
                  >
                    <SelectTrigger size="sm" className="w-32">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="player">{t("team.role.player")}</SelectItem>
                      <SelectItem value="captain">{t("team.role.captain")}</SelectItem>
                      <SelectItem value="manager">{t("team.role.manager")}</SelectItem>
                    </SelectContent>
                  </Select>
                ) : (
                  <StatusBadge status={ROLE_TONE[m.role]} showIcon={false}>
                    {t(teamMemberRoleLabel(m.role))}
                  </StatusBadge>
                )}
                {canManage && m.role !== "owner" ? (
                  <Button
                    size="icon-sm"
                    variant="ghost"
                    aria-label={t("team.removeMemberAria")}
                    onClick={() => remove(m.userId)}
                    loading={pending}
                  >
                    <Trash2Icon aria-hidden />
                  </Button>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      </section>

      {isOwner ? (
        <section className="space-y-2">
          <h3 className="font-heading text-sm font-semibold">
            <CrownIcon className="mr-1 inline size-4 text-primary" aria-hidden />
            {t("team.transferTitle")}
          </h3>
          <p className="text-sm text-muted-foreground">{t("team.transferDesc")}</p>
          {transferTarget ? (
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant="destructive"
                onClick={() => { if (transferTarget) transfer(transferTarget) }}
                loading={pending}
              >
                {t("team.transferTo", {
                  name:
                    members.find((m) => m.userId === transferTarget)?.name ??
                    t("team.thisMember"),
                })}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setTransferTarget(null)}
                disabled={pending}
              >
                {t("common.cancel")}
              </Button>
            </div>
          ) : (
            <div className="flex flex-wrap gap-2">
              {members
                .filter((m) => m.role !== "owner")
                .map((m) => (
                  <Button
                    key={m.userId}
                    size="sm"
                    variant="outline"
                    onClick={() => setTransferTarget(m.userId)}
                  >
                    {m.name ?? m.phone}
                  </Button>
                ))}
            </div>
          )}
        </section>
      ) : null}

      {invitations.length > 0 ? (
        <section className="space-y-2">
          <h3 className="font-heading text-sm font-semibold">
            {t("team.pendingInvites", { count: invitations.length })}
          </h3>
          <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border border-dashed">
            {invitations.map((inv) => (
              <li
                key={inv.id}
                className="flex items-center justify-between gap-2 bg-card p-3 text-sm"
              >
                <span className="font-mono text-xs">{inv.phone}</span>
                <StatusBadge status="warning" showIcon={false}>
                  {t("team.pending")}
                </StatusBadge>
              </li>
            ))}
          </ul>
          <p className="text-xs text-muted-foreground">{t("team.pendingNote")}</p>
        </section>
      ) : null}
    </div>
  )
}
