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
import type { Side } from "@/features/matches/authority"
import {
  isValidSquadSize,
  isMatchFormat,
  placeholdersUpperBound,
  spotsLeft,
  startersOf,
} from "@/features/matches/formats"

/**
 * Squad status card for one side. Shows the same facts as before but
 * structured so the numbers can't contradict each other:
 *   - Status badge: "Squad full" vs "{need} more needed" (seat capacity,
 *     claimed seats only — pending invites are prospects, not reservations).
 *   - Seat bar: named players / unnamed declared seats, with the
 *     filled/total count beside it.
 *   - Breakdown row: on-field starters, bench, unnamed count, pending
 *     invites (info only — invites can exceed open seats).
 *   - Labeled editors: the +/- pairs sit next to the value they change
 *     (unnamed count inline, squad size on its own row).
 */
export function SquadSpots({
  matchId,
  matchType,
  squadSize,
  side,
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
  side: Side
  /** Named identities in the starting group (players + guests). */
  starting: number
  /** Named identities on the roster (players + guests). */
  total: number
  pending?: number
  placeholders?: number
  label?: string
  /** Squad may be resized (home captain only). */
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
  const benchCapacity = squadSize - starters
  const namedOnBench = Math.max(0, total - starting)
  const open = spotsLeft(squadSize, total, placeholders)
  // Clamp for display — the squad may have been shrunk below current fills.
  const filled = Math.min(total + placeholders, squadSize)
  const countBound = placeholdersUpperBound(squadSize, total)
  const pct = (n: number) => `${Math.min(100, (n / squadSize) * 100)}%`

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
      const res = await updatePlaceholderCountAction(matchId, side, next)
      if (!res.ok) {
        toast.error(t(res.error ?? "errors.generic"))
        return
      }
      toast.success(t("matches.squad.countUpdated"))
      router.refresh()
    })
  }

  return (
    <div className="space-y-2 rounded-lg border border-border bg-card p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        {label ? (
          <span className="font-heading text-sm font-semibold">{label}</span>
        ) : null}
        <span
          className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
            open === 0
              ? "bg-primary/10 text-primary"
              : "bg-amber-500/15 text-amber-700 dark:text-amber-400"
          }`}
        >
          {open === 0
            ? t("matches.squad.seatsFull")
            : t("matches.squad.seatsNeed", { need: num(open) })}
        </span>
      </div>

      {/* Seat bar segments share the colors of the breakdown dots below. */}
      <div className="flex items-center gap-3">
        <div
          className="flex h-2 flex-1 overflow-hidden rounded-full bg-muted"
          aria-hidden
        >
          {total > 0 ? (
            <div className="bg-primary" style={{ width: pct(total) }} />
          ) : null}
          {placeholders > 0 ? (
            <div
              className="bg-amber-500 dark:bg-amber-400"
              style={{ width: pct(placeholders) }}
            />
          ) : null}
        </div>
        <span className="shrink-0 text-xs font-medium tabular-nums text-muted-foreground">
          {num(filled)}/{num(squadSize)}
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <span className="size-2 rounded-full bg-primary" aria-hidden />
          {t("matches.squad.onField", {
            count: num(starting),
            total: num(starters),
          })}
        </span>
        {benchCapacity > 0 ? (
          <span className="flex items-center gap-1.5">
            <span className="size-2 rounded-full bg-primary/60" aria-hidden />
            {t("matches.squad.benchCount", {
              count: num(namedOnBench),
              total: num(benchCapacity),
            })}
          </span>
        ) : null}
        <span className="flex items-center gap-1.5 text-amber-700 dark:text-amber-400">
          <span
            className="size-2 rounded-full bg-amber-500 dark:bg-amber-400"
            aria-hidden
          />
          {t("matches.squad.unnamed", { count: num(placeholders) })}
          {countEditable && canEditCount ? (
            <span className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="icon"
                className="size-6"
                aria-label={t("matches.squad.unnamedDecrease")}
                loading={pendingTransition}
                disabled={placeholders <= 0}
                onClick={() => updateCount(-1)}
              >
                −
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="size-6"
                aria-label={t("matches.squad.unnamedIncrease")}
                loading={pendingTransition}
                disabled={placeholders >= countBound}
                onClick={() => updateCount(1)}
              >
                +
              </Button>
            </span>
          ) : null}
        </span>
        {pending > 0 ? (
          <span className="flex items-center gap-1.5">
            <span
              className="size-2 rounded-full bg-muted-foreground/40"
              aria-hidden
            />
            {t("matches.squad.pendingCount", { count: num(pending) })}
          </span>
        ) : null}
      </div>

      {editable ? (
        <div className="flex items-center justify-between border-t border-border pt-2">
          <span className="text-xs text-muted-foreground">
            {t("matches.squad.squadSizeLabel")}{" "}
            <span className="font-semibold text-foreground tabular-nums">
              {num(squadSize)}
            </span>
          </span>
          <span className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              className="size-6"
              aria-label={t("matches.wizard.decrease")}
              loading={pendingTransition}
              disabled={!isValidSquadSize(fmt, squadSize - 1)}
              onClick={() => resize(-1)}
            >
              −
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="size-6"
              aria-label={t("matches.wizard.increase")}
              loading={pendingTransition}
              disabled={!isValidSquadSize(fmt, squadSize + 1)}
              onClick={() => resize(1)}
            >
              +
            </Button>
          </span>
        </div>
      ) : null}
    </div>
  )
}
