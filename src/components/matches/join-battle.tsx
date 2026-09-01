"use client"

import { useI18n } from "@/i18n/client"
import { toBnDigits } from "@/lib/format-time"

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import type { InvitationOutcome } from "@/features/matches/queries"
import type { Side } from "@/features/matches/authority"

/**
 * The join battle log (matchmaking.html §slots): every invitation sent for
 * the match with its outcome — Confirmed for accepted, Declined for
 * declined, Pending while unanswered. When a side is full and invites are
 * still out, the HTML's "you were late" copy renders beneath the table.
 */
export function JoinBattle({
  outcomes,
  openBySide,
}: {
  outcomes: InvitationOutcome[]
  /** Open seats per side — pending rows on a full side get the late copy. */
  openBySide: Partial<Record<Side, number>>
}) {
  const { t, locale } = useI18n()
  const num = (n: number | string) =>
    locale === "bn" ? toBnDigits(String(n)) : String(n)
  const time = (d: Date) =>
    num(`${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}`)

  const late = outcomes.some(
    (o) => o.status === "pending" && (openBySide[o.side] ?? 0) === 0
  )

  if (outcomes.length === 0) return null

  return (
    <div className="match-battle overflow-hidden rounded-2xl border border-border bg-card">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t("matches.battle.player")}</TableHead>
            <TableHead className="hidden sm:table-cell">
              {t("matches.battle.invited")}
            </TableHead>
            <TableHead className="text-right">{t("matches.battle.status")}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {outcomes.map((o) => {
            const full = (openBySide[o.side] ?? 0) === 0
            return (
              <TableRow key={o.id}>
                <TableCell>
                  <span className="flex items-center gap-2.5">
                    <span
                      aria-hidden
                      className={`flex size-7 shrink-0 items-center justify-center rounded-lg text-xs font-bold ${
                        o.status === "accepted"
                          ? "bg-primary/15 text-primary"
                          : o.status === "declined"
                            ? "bg-destructive/15 text-destructive"
                            : "bg-muted text-muted-foreground"
                      }`}
                    >
                      {initials(o)}
                    </span>
                    <span className="min-w-0 truncate font-medium">
                      {o.playerName ??
                        (o.inviteePhoneMasked
                          ? num(o.inviteePhoneMasked)
                          : t("matches.player"))}
                    </span>
                  </span>
                </TableCell>
                <TableCell className="hidden tabular-nums text-muted-foreground sm:table-cell">
                  {time(o.createdAt)}
                </TableCell>
                <TableCell className="text-right">
                  <span
                    className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-semibold ${
                      o.status === "accepted"
                        ? "border-primary/40 bg-primary/10 text-primary"
                        : o.status === "declined"
                          ? "border-destructive/40 bg-destructive/10 text-destructive"
                          : "border-border bg-muted/50 text-muted-foreground"
                    }`}
                  >
                    {o.status === "pending" ? (
                      <span aria-hidden className="match-blink-dot" />
                    ) : (
                      <span aria-hidden className="size-1.5 rounded-full bg-current" />
                    )}
                    {t(`matches.battle.${o.status}`)}
                    {o.status === "pending" && full ? (
                      <span className="sr-only">
                        {t("matches.battle.lateBanner")}
                      </span>
                    ) : null}
                  </span>
                </TableCell>
              </TableRow>
            )
          })}
        </TableBody>
      </Table>
      {late ? (
        <p className="rounded-b-2xl border-t border-destructive/30 bg-destructive/5 px-4 py-3 text-xs leading-relaxed text-destructive">
          {t("matches.battle.lateBanner")}
        </p>
      ) : null}
    </div>
  )
}

function initials(o: InvitationOutcome): string {
  const base = o.playerName ?? o.inviteePhoneMasked ?? ""
  const trimmed = base.trim()
  return trimmed ? trimmed[0]!.toUpperCase() : "?"
}
