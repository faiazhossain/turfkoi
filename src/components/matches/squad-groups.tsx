"use client"

import { useTransition } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"

import { useI18n } from "@/i18n/client"

import { Button } from "@/components/ui/button"
import { PlayerAvatar } from "@/components/player/player-avatar"
import { initialsFromName } from "@/features/player/avatar"
import {
  removePlayerAction,
  removeMatchGuestAction,
  setGuestSquadRoleAction,
  setSquadRoleAction,
} from "@/features/matches/actions"

export interface SquadPlayer {
  userId: string
  name: string | null
  phone: string
  teamId: string | null
  role: string
  squadRole: "starting" | "substitute"
}

export interface SquadGuest {
  id: string
  teamId: string | null
  name: string
  phone: string | null
  linkedUserId: string | null
  squadRole: "starting" | "substitute"
}

interface Row {
  key: string
  displayName: string
  avatarName: string | null
  squadRole: "starting" | "substitute"
  canManage: boolean
  removable: boolean
  captain: boolean
  guest: boolean
  userId?: string
  guestId?: string
}

/**
 * Match room squad: per side, Starting first then Substitutes. Registered
 * players and temp guests render in the same groups (guests get a badge).
 * Managers (the side's team captain, or the match captain for solo players)
 * can move rows between groups and remove them.
 */
export function SquadGroups({
  matchId,
  sides,
  roster,
  guests = [],
  captainId,
  managedTeamIds,
  isMatchCaptain,
}: {
  matchId: string
  sides: { teamId: string; teamName: string | null; side: "home" | "away" }[]
  roster: SquadPlayer[]
  guests?: SquadGuest[]
  captainId: string
  /** Team ids in this match the current user can manage. */
  managedTeamIds: string[]
  isMatchCaptain: boolean
}) {
  const router = useRouter()
  const { t } = useI18n()
  const [pending, start] = useTransition()

  const manages = (teamId: string | null) =>
    teamId ? managedTeamIds.includes(teamId) : isMatchCaptain

  function setRole(row: Row, squadRole: "starting" | "substitute") {
    start(async () => {
      const res = row.guest
        ? await setGuestSquadRoleAction(matchId, row.guestId!, squadRole)
        : await setSquadRoleAction(matchId, row.userId!, squadRole)
      if (!res.ok) {
        toast.error(t(res.error ?? "errors.generic"))
        return
      }
      router.refresh()
    })
  }

  function remove(row: Row) {
    start(async () => {
      const res = row.guest
        ? await removeMatchGuestAction(matchId, row.guestId!)
        : await removePlayerAction(matchId, row.userId!)
      if (!res.ok) {
        toast.error(t(res.error ?? "errors.generic"))
        return
      }
      toast.success(t(row.guest ? "matches.guest.removed" : "matches.playerRemoved"))
      router.refresh()
    })
  }

  function rowEl(row: Row) {
    return (
      <li key={row.key} className="flex items-center gap-3 bg-card p-2.5 text-sm">
        <PlayerAvatar
          display={{ kind: "initials", text: initialsFromName(row.avatarName) }}
          size="md"
        />
        <span className="min-w-0 flex-1 truncate font-medium">{row.displayName}</span>
        {row.guest ? (
          <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
            {t("matches.guest.badge")}
          </span>
        ) : null}
        {row.captain ? (
          <span className="shrink-0 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
            {t("matches.captainBadge")}
          </span>
        ) : null}
        {row.canManage ? (
          <span className="flex shrink-0 items-center gap-1">
            {row.squadRole === "starting" ? (
              <Button
                size="xs"
                variant="ghost"
                onClick={() => setRole(row, "substitute")}
                loading={pending}
              >
                {t("matches.squad.bench")}
              </Button>
            ) : (
              <Button
                size="xs"
                variant="ghost"
                onClick={() => setRole(row, "starting")}
                loading={pending}
              >
                {t("matches.squad.field")}
              </Button>
            )}
            <Button
              size="xs"
              variant="ghost"
              onClick={() => remove(row)}
              loading={pending}
              disabled={!row.removable}
            >
              {t("common.remove")}
            </Button>
          </span>
        ) : null}
      </li>
    )
  }

  function group(title: string, rows: Row[]) {
    if (rows.length === 0) {
      return (
        <p className="rounded-lg border border-dashed border-border p-3 text-xs text-muted-foreground">
          {t("matches.squad.emptyGroup", { group: title })}
        </p>
      )
    }
    return (
      <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border">
        {rows.map(rowEl)}
      </ul>
    )
  }

  // Team match: one block per side. Solo: a single synthetic group.
  const groups =
    sides.length > 0
      ? sides.map((s) => ({
          label: `${s.teamName ?? ""} · ${t(
            s.side === "home" ? "matches.sideHome" : "matches.sideAway"
          )}`,
          teamId: s.teamId as string | null,
        }))
      : [{ label: t("matches.soloGroup"), teamId: null as string | null }]

  return (
    <div className="space-y-5">
      {groups.map((g) => {
        const playerRows: Row[] = roster
          .filter((p) => p.teamId === g.teamId)
          .map((p) => ({
            key: `p-${p.userId}`,
            displayName: p.name ?? p.phone,
            avatarName: p.name,
            squadRole: p.squadRole,
            canManage: manages(p.teamId),
            removable: p.userId !== captainId,
            captain: p.userId === captainId,
            guest: false,
            userId: p.userId,
          }))
        const guestRows: Row[] = guests
          .filter((g2) => g2.teamId === g.teamId)
          .map((g2) => ({
            key: `g-${g2.id}`,
            displayName: g2.name,
            avatarName: g2.name,
            squadRole: g2.squadRole,
            canManage: manages(g2.teamId),
            removable: true,
            captain: false,
            guest: true,
            guestId: g2.id,
          }))
        const all = [...playerRows, ...guestRows]
        return (
          <div key={g.teamId ?? "solo"} className="space-y-2">
            <p className="text-sm font-semibold">{g.label}</p>
            <div className="space-y-1">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                {t("matches.squad.starting")}
              </p>
              {group(t("matches.squad.starting"), all.filter((r) => r.squadRole === "starting"))}
            </div>
            <div className="space-y-1">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                {t("matches.squad.substitutes")}
              </p>
              {group(t("matches.squad.substitutes"), all.filter((r) => r.squadRole === "substitute"))}
            </div>
          </div>
        )
      })}
    </div>
  )
}
