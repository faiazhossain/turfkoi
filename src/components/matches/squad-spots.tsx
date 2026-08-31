"use client"

import { useTransition } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"

import { useI18n } from "@/i18n/client"
import { toBnDigits } from "@/lib/format-time"

import { Button } from "@/components/ui/button"
import {
  updatePlaceholderCountAction,
  updateSquadSizeAction,
} from "@/features/matches/actions"
import {
  isValidSquadSize,
  isMatchFormat,
  placeholdersUpperBound,
  spotsLeft,
  startersOf,
} from "@/features/matches/formats"

/**
 * Count-first squad summary for one side:
 *   "7 / 10 players · 3 more needed"  (or "squad ready ✓")
 * Plus the captain's declared-count editor (+/-): how many players they have
 * WITHOUT naming them. Identities (roster + guests) and pending invites draw
 * from the same squad, so the declared count can never exceed what's left.
 * The match captain can also grow/shrink the squad while the roster is open.
 */
export function SquadSpots({
  matchId,
  matchType,
  squadSize,
  teamId = null,
  starting,
  total,
  pending = 0,
  placeholders = 0,
  label,
  editable = false,
  canEditCount = false,
  countEditable = false,
}: {
  matchId: string
  matchType: string
  squadSize: number
  /** null = solo side. */
  teamId?: string | null
  /** Identities on the roster (players + guests). */
  starting: number
  total: number
  pending?: number
  placeholders?: number
  label?: string
  /** Squad may be resized (match captain only). */
  editable?: boolean
  /** Declared player count may be edited (side captain). */
  canEditCount?: boolean
  /** Pre-computed server-side: rosterOpen(state) — ANDed with canEditCount. */
  countEditable?: boolean
}) {
  const { t, locale } = useI18n()
  const router = useRouter()
  const [pendingTransition, start] = useTransition()
  const num = (n: number) => (locale === "bn" ? toBnDigits(String(n)) : String(n))

  const fmt = isMatchFormat(matchType) ? matchType : "fives"
  const starters = startersOf(fmt)
  const open = spotsLeft(squadSize, total, pending, placeholders)
  const countBound = placeholdersUpperBound(squadSize, total, pending)

  function resize(delta: number) {
    const next = squadSize + delta
    start(async () => {
      const res = await updateSquadSizeAction(matchId, next)
      if (!res.ok) {
        toast.error(t(res.error ?? "errors.generic"))
        return
      }
      toast.success(t("matches.squad.squadUpdated"))
      router.refresh()
    })
  }

  function updateCount(delta: number) {
    const next = Math.max(0, placeholders + delta)
    start(async () => {
      const res = await updatePlaceholderCountAction(matchId, teamId, next)
      if (!res.ok) {
        toast.error(t(res.error ?? "errors.generic"))
        return
      }
      toast.success(t("matches.squad.countUpdated"))
      router.refresh()
    })
  }

  return (
    <div className="space-y-1">
      <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-sm">
        {label ? (
          <span className="font-heading font-medium">{label}</span>
        ) : null}
        <span
          className={`rounded-full px-2 py-0.5 text-xs font-semibold tabular-nums ${
            open === 0
              ? "bg-primary/10 text-primary"
              : "bg-amber-500/15 text-amber-700 dark:text-amber-400"
          }`}
        >
          {open === 0
            ? t("matches.squad.spotsFull", {
                count: num(squadSize),
                total: num(squadSize),
              })
            : t("matches.squad.spotsSummary", {
                count: num(total + pending + placeholders),
                total: num(squadSize),
                need: num(open),
              })}
        </span>
        <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary tabular-nums">
          {t("matches.squad.startingCount", {
            count: num(starting),
            total: num(starters),
          })}
        </span>
        {editable ? (
          <span className="ml-auto flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              className="size-6"
              aria-label={t("matches.wizard.decrease")}
              disabled={pendingTransition || !isValidSquadSize(fmt, squadSize - 1)}
              onClick={() => resize(-1)}
            >
              −
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="size-6"
              aria-label={t("matches.wizard.increase")}
              disabled={pendingTransition || !isValidSquadSize(fmt, squadSize + 1)}
              onClick={() => resize(1)}
            >
              +
            </Button>
          </span>
        ) : null}
        {countEditable && canEditCount ? (
          <span className="ml-auto flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              className="size-6"
              aria-label={t("matches.squad.countDecrease")}
              disabled={pendingTransition || placeholders <= 0}
              onClick={() => updateCount(-1)}
            >
              −
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="size-6"
              aria-label={t("matches.squad.countIncrease")}
              disabled={pendingTransition || placeholders >= countBound}
              onClick={() => updateCount(1)}
            >
              +
            </Button>
          </span>
        ) : null}
      </div>
      {placeholders > 0 ? (
        <p className="px-1 text-xs text-muted-foreground">
          {t("matches.squad.placeholdersHint", { count: num(placeholders) })}
        </p>
      ) : null}
    </div>
  )
}
