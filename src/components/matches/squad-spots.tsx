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
  slotNames = [],
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
  /** Display names of the named identities, in squad order — rendered as
   * the roster-slot grid (filled tiles) with dashed open tiles after. */
  slotNames?: string[]
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
    <div className="space-y-2 rounded-2xl border border-dt-line bg-dt-card p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        {label ? (
          <span className="font-heading text-sm font-semibold">{label}</span>
        ) : null}
        <span
          className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
            open === 0
              ? "bg-dt-green/10 text-dt-green"
              : "bg-warning/15 text-warning"
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
          className="flex h-2 flex-1 overflow-hidden rounded-full bg-dt-card2"
          aria-hidden
        >
          {total > 0 ? (
            <div className="bg-dt-green" style={{ width: pct(total) }} />
          ) : null}
          {placeholders > 0 ? (
            <div
              className="bg-warning"
              style={{ width: pct(placeholders) }}
            />
          ) : null}
        </div>
        <span className="shrink-0 text-xs font-medium tabular-nums text-dt-dim">
          {num(filled)}/{num(squadSize)}
        </span>
      </div>

      {/* Roster-slot grid (matchmaking.html §roster-box): filled tiles in
          squad order, dashed pulsing open tiles after. The first open tile
          carries the open-count badge. Placeholders are unnamed claimed
          seats — they render as open (recruitable) tiles. */}
      {slotNames.length > 0 || open > 0 ? (
        <div className="flex flex-wrap gap-2" aria-label={t("matches.squad.gridAria")}>
          {slotNames.slice(0, squadSize).map((name, i) => (
            <div
              key={`${i}-${name}`}
              className="match-slot-filled flex h-13 w-13 flex-col items-center justify-center rounded-xl border px-1 text-center"
              title={name}
            >
              <span className="text-[10px] font-semibold tabular-nums text-dt-dim">
                {num(i + 1)}
              </span>
              <span className="w-full truncate text-[10px] leading-tight">
                {name}
              </span>
            </div>
          ))}
          {Array.from({ length: open }, (_, i) => (
            <div
              key={`open-${i}`}
              className="match-slot-open relative flex h-13 w-13 flex-col items-center justify-center rounded-xl border border-dashed"
            >
              {i === 0 && open > 1 ? (
                <span
                  className="absolute -right-1.5 -top-1.5 flex size-5 items-center justify-center rounded-full bg-warning text-[10px] font-bold tabular-nums text-warning-foreground"
                  aria-hidden
                >
                  {num(open)}
                </span>
              ) : null}
              <span className="text-sm font-bold text-warning">
                +
              </span>
              <span className="text-[10px] leading-tight text-dt-dim">
                {t("matches.squad.slotOpen")}
              </span>
            </div>
          ))}
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-dt-dim">
        <span className="flex items-center gap-1.5 text-warning">
          <span
            className="size-2 rounded-full bg-warning"
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
        <span className="flex items-center gap-1.5">
          <span className="size-2 rounded-full bg-dt-green" aria-hidden />
          {t("matches.squad.onField", {
            count: num(starting),
            total: num(starters),
          })}
        </span>
        {benchCapacity > 0 ? (
          <span className="flex items-center gap-1.5">
            <span className="size-2 rounded-full bg-dt-green/60" aria-hidden />
            {t("matches.squad.benchCount", {
              count: num(namedOnBench),
              total: num(benchCapacity),
            })}
          </span>
        ) : null}
        {pending > 0 ? (
          <span className="flex items-center gap-1.5">
            <span
              className="size-2 rounded-full bg-dt-dim/40"
              aria-hidden
            />
            {t("matches.squad.pendingCount", { count: num(pending) })}
          </span>
        ) : null}
      </div>

      {editable ? (
        <div className="flex items-center justify-between border-t border-dt-line pt-2">
          <span className="text-xs text-dt-dim">
            {t("matches.squad.squadSizeLabel")}{" "}
            <span className="font-semibold text-dt-txt tabular-nums">
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
