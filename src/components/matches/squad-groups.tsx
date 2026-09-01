"use client"

import { useTransition } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"

import { useI18n } from "@/i18n/client"

import { positionLabelKey } from "@/i18n/labels"

import { Button } from "@/components/ui/button"
import { PlayerAvatar } from "@/components/player/player-avatar"
import { initialsFromName } from "@/features/player/avatar"
import type { Side } from "@/features/matches/authority"
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
  side: Side
  role: string
  squadRole: "starting" | "substitute"
}

export interface SquadGuest {
  id: string
  side: Side
  name: string
  phone: string | null
  position: string | null
  jerseyNumber: number | null
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
  position?: string | null
  jerseyNumber?: number | null
}

/**
 * Match room squad: per side, Starting first then Substitutes. Registered
 * players and temp guests render in the same groups (guests get a badge).
 * Managers (the captain of the row's side) can move rows between groups and
 * remove them.
 */
export function SquadGroups({
  matchId,
  sides,
  roster,
  guests = [],
  captainId,
  awayCaptainId,
  managedSides,
}: {
  matchId: string
  /** Legacy team matches label their sides with the team name. */
  sides: { side: Side; legacyTeamLabel: string | null }[]
  roster: SquadPlayer[]
  guests?: SquadGuest[]
  captainId: string
  awayCaptainId: string | null
  /** Sides the current user can manage. */
  managedSides: Side[]
}) {
  const router = useRouter()
  const { t } = useI18n()
  const [pending, start] = useTransition()

  const manages = (side: Side) => managedSides.includes(side)

  /** Canonical ids translate through the dictionary; legacy text renders raw. */
  const positionLabelText = (value: string) => {
    const key = positionLabelKey(value)
    return key ? t(key) : value
  }

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
      <li key={row.key} className="flex items-center gap-3 bg-dt-card p-2.5 text-sm">
        <PlayerAvatar
          display={{ kind: "initials", text: initialsFromName(row.avatarName) }}
          size="md"
        />
        <span className="min-w-0 flex-1 truncate font-medium">{row.displayName}</span>
        {row.guest ? (
          <span className="shrink-0 rounded-full bg-dt-card2 px-2 py-0.5 text-xs font-medium text-dt-dim">
            {t("matches.guest.badge")}
          </span>
        ) : null}
        {row.jerseyNumber != null ? (
          <span className="shrink-0 rounded-full bg-dt-green/10 px-2 py-0.5 text-xs font-medium tabular-nums text-dt-green">
            #{row.jerseyNumber}
          </span>
        ) : null}
        {row.position ? (
          <span className="shrink-0 rounded-full bg-dt-card2 px-2 py-0.5 text-xs font-medium text-dt-dim">
            {positionLabelText(row.position)}
          </span>
        ) : null}
        {row.captain ? (
          <span className="shrink-0 rounded-full bg-dt-green/10 px-2 py-0.5 text-xs font-medium text-dt-green">
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
        <p className="rounded-lg border border-dashed border-dt-line p-3 text-xs text-dt-dim">
          {t("matches.squad.emptyGroup", { group: title })}
        </p>
      )
    }
    return (
      <ul className="divide-y divide-dt-line overflow-hidden rounded-xl border border-dt-line">
        {rows.map(rowEl)}
      </ul>
    )
  }

  return (
    <div className="space-y-5">
      {sides.map((s) => {
        const label = s.legacyTeamLabel ?? t(s.side === "home" ? "matches.sideHome" : "matches.sideAway")
        const playerRows: Row[] = roster
          .filter((p) => p.side === s.side)
          .map((p) => ({
            key: `p-${p.userId}`,
            displayName: p.name ?? p.phone,
            avatarName: p.name,
            squadRole: p.squadRole,
            canManage: manages(p.side),
            removable: p.userId !== captainId && p.userId !== awayCaptainId,
            captain: p.userId === captainId || p.userId === awayCaptainId,
            guest: false,
            userId: p.userId,
          }))
        const guestRows: Row[] = guests
          .filter((g2) => g2.side === s.side)
          .map((g2) => ({
            key: `g-${g2.id}`,
            displayName: g2.name,
            avatarName: g2.name,
            squadRole: g2.squadRole,
            canManage: manages(g2.side),
            removable: true,
            captain: false,
            guest: true,
            guestId: g2.id,
            position: g2.position,
            jerseyNumber: g2.jerseyNumber,
          }))
        const all = [...playerRows, ...guestRows]
        return (
          <div key={s.side} className="space-y-2">
            <p className="text-sm font-semibold">{label}</p>
            <div className="space-y-1">
              <p className="text-xs font-medium uppercase tracking-wide text-dt-dim">
                {t("matches.squad.starting")}
              </p>
              {group(t("matches.squad.starting"), all.filter((r) => r.squadRole === "starting"))}
            </div>
            <div className="space-y-1">
              <p className="text-xs font-medium uppercase tracking-wide text-dt-dim">
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
