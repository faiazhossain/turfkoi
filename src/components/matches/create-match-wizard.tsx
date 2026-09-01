"use client"

import { useState, useTransition, type ReactNode } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { toast } from "sonner"
import {
  CalendarCheckIcon,
  CheckIcon,
  ChevronLeftIcon,
  GoalIcon,
  UserCheckIcon,
  UsersIcon,
} from "lucide-react"

import { useI18n } from "@/i18n/client"
import { toBnDigits } from "@/lib/format-time"
import { formatSlotDate } from "@/lib/format-date"

import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import { createMatchAction } from "@/features/matches/actions"
import {
  FORMATS,
  MATCH_FORMATS,
  defaultSquadSize,
  isValidSquadSize,
  startersOf,
  type MatchFormat,
} from "@/features/matches/formats"

export interface WizardBooking {
  id: string
  turfName: string
  turfArea: string | null
  date: string
  slotStart: string
  slotEnd: string
}

/**
 * Match creation flow — booking-first, count-first (owner spec):
 *   1. Pick the confirmed booking the match will be played on (a match is
 *      always played on a platform booking — book a turf first if needed).
 *   2. Format (7v7 etc.) — players per side ON THE FIELD.
 *   3. Squad size — total incl. substitutes.
 *   4. "How many players do you already have?" — a count, or Full squad.
 *      NO identities and NO teams here: names/invites/guests all happen
 *      later, progressively, from the match room.
 *
 * UX: a stepper header shows where you are, each step is a card whose badge
 * turns into a check, squad fill is visualized with dots + a progress bar,
 * and the create action sits in a sticky bottom bar with a live summary.
 */

/** One wizard step — numbered badge that turns into a check when done. */
function StepCard({
  number,
  title,
  help,
  done,
  active,
  header,
  children,
}: {
  number: ReactNode
  title: string
  help?: string
  done: boolean
  active: boolean
  header?: ReactNode
  children: ReactNode
}) {
  return (
    <section
      aria-current={active ? "step" : undefined}
      className={`animate-in fade-in slide-in-from-bottom-2 motion-reduce:animate-none rounded-xl border bg-dt-card p-4 transition-colors duration-300 sm:p-5 ${
        active ? "border-dt-green/40 shadow-sm" : "border-dt-line"
      }`}
    >
      <div className="flex items-start gap-3">
        <span
          aria-hidden
          className={`flex size-7 shrink-0 items-center justify-center rounded-full font-heading text-xs font-bold transition-all duration-300 ${
            done
              ? "bg-dt-green text-dt-ink"
              : active
                ? "bg-dt-green/10 text-dt-green ring-4 ring-dt-green/10"
                : "bg-dt-card2 text-dt-dim"
          }`}
        >
          {done ? (
            <CheckIcon className="size-4 animate-in zoom-in-50 duration-200 motion-reduce:animate-none" />
          ) : (
            number
          )}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <h2 className="font-heading text-base font-semibold leading-snug">
              {title}
            </h2>
            {header}
          </div>
          {help ? (
            <p className="mt-0.5 text-sm leading-snug text-dt-dim">
              {help}
            </p>
          ) : null}
        </div>
      </div>
      <div className="mt-4">{children}</div>
    </section>
  )
}

/** Selectable card with a check mark — shared by format & yes/no choices. */
function OptionCard({
  selected,
  onClick,
  label,
  sub,
  className = "",
}: {
  selected: boolean
  onClick: () => void
  label: ReactNode
  sub?: ReactNode
  className?: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={`relative rounded-xl border p-3 text-center transition-all duration-200 hover:-translate-y-0.5 hover:shadow-sm motion-reduce:hover:translate-y-0 ${
        selected
          ? "border-dt-green bg-dt-green/10 ring-2 ring-dt-green/25"
          : "border-dt-line bg-dt-card hover:border-dt-green/40"
      } ${className}`}
    >
      {selected ? (
        <CheckIcon
          aria-hidden
          className="absolute right-2 top-2 size-4 text-dt-green animate-in zoom-in-50 duration-200 motion-reduce:animate-none"
        />
      ) : null}
      <span className="block font-heading font-semibold leading-tight">{label}</span>
      {sub ? (
        <span className="mt-1 block text-xs leading-snug text-dt-dim">
          {sub}
        </span>
      ) : null}
    </button>
  )
}

export function CreateMatchWizard({
  bookings,
  pendingPayment,
  preselectedBookingId,
}: {
  bookings: WizardBooking[]
  pendingPayment: WizardBooking[]
  preselectedBookingId: string | null
}) {
  const router = useRouter()
  const { t, locale } = useI18n()
  const [pending, start] = useTransition()

  // Step 1 — which confirmed booking is the match played on?
  const preselected = bookings.some((b) => b.id === preselectedBookingId)
    ? preselectedBookingId
    : null
  const [bookingId, setBookingId] = useState<string | null>(preselected)

  // Steps 2–3
  const [format, setFormat] = useState<MatchFormat>("fives")
  const [squadSize, setSquadSize] = useState<number>(defaultSquadSize("fives"))

  // Step 4 — count-first: how many players does the captain already have?
  const [playerCount, setPlayerCount] = useState<number | null>(null)

  const starters = startersOf(format)
  const maxSquad = FORMATS[format].maxSquad
  const subs = squadSize - starters
  const num = (n: number) => (locale === "bn" ? toBnDigits(String(n)) : String(n))
  const slotDate = (iso: string) => formatSlotDate(iso, locale)
  const slotTime = (v: string) => v.slice(0, 5)

  function pickFormat(f: MatchFormat) {
    setFormat(f)
    const next = isValidSquadSize(f, squadSize) ? squadSize : defaultSquadSize(f)
    setSquadSize(next)
    setPlayerCount((prev) => (prev === null ? null : Math.min(prev, next)))
  }

  // Declared count excludes the creator (always on the roster).
  const placeholders = playerCount === null ? 0 : Math.max(0, playerCount - 1)
  const fullSquad = playerCount !== null && playerCount >= squadSize
  const spotsNeeded = playerCount === null ? 0 : Math.max(0, squadSize - playerCount)

  const steps = [
    {
      id: "booking",
      label: t("matches.wizard.navBooking"),
      icon: CalendarCheckIcon,
      done: bookingId !== null,
    },
    { id: "format", label: t("matches.wizard.navFormat"), icon: GoalIcon, done: true },
    { id: "squad", label: t("matches.wizard.navSquad"), icon: UsersIcon, done: true },
    {
      id: "count",
      label: t("matches.wizard.navCount"),
      icon: UserCheckIcon,
      done: playerCount !== null,
    },
  ]
  const activeIdx = Math.max(
    0,
    steps.findIndex((s) => !s.done)
  )
  const doneCount = steps.filter((s) => s.done).length
  const selectedBooking = bookings.find((b) => b.id === bookingId) ?? null

  function create() {
    if (!bookingId) return
    start(async () => {
      const res = await createMatchAction({
        bookingId,
        matchType: format,
        squadSize,
        placeholderCount: placeholders,
      })
      if (!res.ok) {
        toast.error(t(res.error ?? "errors.generic"))
        return
      }
      toast.success(t("matches.createdToast"))
      if (res.matchId) router.push(`/matches/${res.matchId}`)
    })
  }

  return (
    <div className="space-y-5">
      {/* Stepper — where am I, how much is left */}
      <nav aria-label={t("matches.wizard.stepProgress", { done: doneCount, total: steps.length })}>
        <p className="mb-2 text-xs font-medium uppercase tracking-wide text-dt-dim">
          {t("matches.wizard.stepProgress", {
            done: num(doneCount),
            total: num(steps.length),
          })}
        </p>
        <ol className="flex items-start">
          {steps.map((s, i) => (
            <li
              key={s.id}
              aria-current={i === activeIdx ? "step" : undefined}
              className="flex min-w-0 flex-1 items-start last:flex-none"
            >
              <div className="flex w-14 flex-col items-center gap-1.5 sm:w-20">
                <span
                  aria-hidden
                  className={`flex size-8 items-center justify-center rounded-full transition-all duration-300 ${
                    s.done
                      ? "bg-dt-green text-dt-ink"
                      : i === activeIdx
                        ? "bg-dt-green/10 text-dt-green ring-4 ring-dt-green/15"
                        : "bg-dt-card2 text-dt-dim"
                  }`}
                >
                  {s.done ? (
                    <CheckIcon
                      className="size-4 animate-in zoom-in-50 duration-300 motion-reduce:animate-none"
                      aria-hidden
                    />
                  ) : (
                    <s.icon className="size-4" aria-hidden />
                  )}
                </span>
                <span
                  className={`text-center text-[11px] font-medium leading-tight ${
                    s.done || i === activeIdx
                      ? "text-dt-txt"
                      : "text-dt-dim"
                  }`}
                >
                  {s.label}
                </span>
              </div>
              {i < steps.length - 1 ? (
                <span
                  aria-hidden
                  className={`mt-4 h-0.5 min-w-3 flex-1 rounded-full transition-colors duration-500 ${
                    steps[i].done && steps[i + 1].done ? "bg-dt-green" : "bg-dt-line"
                  }`}
                />
              ) : null}
            </li>
          ))}
        </ol>
      </nav>

      {/* Step 1 — the booking the match is played on */}
      <StepCard
        number={num(1)}
        title={t("matches.wizard.stepBooking")}
        help={t("matches.wizard.bookingHelp")}
        done={steps[0].done}
        active={activeIdx === 0}
      >
        {bookings.length > 0 ? (
          <div className="space-y-2" role="radiogroup" aria-label={t("matches.wizard.stepBooking")}>
            {bookings.map((b) => (
              <button
                key={b.id}
                type="button"
                role="radio"
                aria-checked={bookingId === b.id}
                onClick={() => setBookingId(b.id)}
                className={`relative flex w-full items-center gap-3 rounded-xl border p-3 text-left transition-all duration-200 ${
                  bookingId === b.id
                    ? "border-dt-green bg-dt-green/10 ring-2 ring-dt-green/25"
                    : "border-dt-line bg-dt-card hover:border-dt-green/40"
                }`}
              >
                {bookingId === b.id ? (
                  <CheckIcon
                    aria-hidden
                    className="size-4 shrink-0 text-dt-green animate-in zoom-in-50 duration-200 motion-reduce:animate-none"
                  />
                ) : (
                  <span
                    aria-hidden
                    className="size-4 shrink-0 rounded-full border border-dt-dim/40"
                  />
                )}
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-heading font-semibold leading-tight">
                    {b.turfName}
                    {b.turfArea ? (
                      <span className="font-normal text-dt-dim">
                        {" "}
                        · {b.turfArea}
                      </span>
                    ) : null}
                  </span>
                  <span className="mt-0.5 block font-mono text-xs text-dt-dim">
                    {slotDate(b.date)} · {slotTime(b.slotStart)}–{slotTime(b.slotEnd)}
                  </span>
                </span>
              </button>
            ))}
          </div>
        ) : null}

        {pendingPayment.length > 0 ? (
          <div className="mt-3 space-y-2">
            {pendingPayment.map((b) => (
              <div
                key={b.id}
                className="flex items-center justify-between gap-3 rounded-xl border border-dashed border-dt-line p-3"
              >
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium">{b.turfName}</span>
                  <span className="block font-mono text-xs text-dt-dim">
                    {slotDate(b.date)} · {slotTime(b.slotStart)}
                  </span>
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  className="shrink-0"
                  render={<Link href={`/bookings/${b.id}`} />}
                >
                  {t("matches.completePaymentCta")}
                </Button>
              </div>
            ))}
          </div>
        ) : null}

        {bookings.length === 0 ? (
          <p className="rounded-lg border border-dashed border-dt-line p-4 text-sm text-dt-dim">
            {t("matches.noEligibleBookingsShort")}
          </p>
        ) : null}
      </StepCard>

      {/* Step 2 — format */}
      <StepCard
        number={num(2)}
        title={t("matches.wizard.stepFormat")}
        help={t("matches.wizard.formatHelp")}
        done={steps[1].done}
        active={activeIdx === 1}
      >
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {MATCH_FORMATS.map((f) => (
            <OptionCard
              key={f}
              selected={format === f}
              onClick={() => pickFormat(f)}
              label={t(`matches.format.${f}`)}
              sub={t("matches.wizard.starters", { count: num(startersOf(f)) })}
            />
          ))}
        </div>
      </StepCard>

      {/* Step 3 — squad size */}
      <StepCard
        number={num(3)}
        title={t("matches.wizard.stepSquad")}
        help={t("matches.wizard.squadHelp")}
        done={steps[2].done}
        active={activeIdx === 2}
      >
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <Button
              type="button"
              variant="outline"
              size="icon"
              aria-label={t("matches.wizard.decrease")}
              disabled={squadSize <= starters}
              onClick={() => {
                const next = Math.max(starters, squadSize - 1)
                setSquadSize(next)
                setPlayerCount((prev) => (prev === null ? null : Math.min(prev, next)))
              }}
            >
              −
            </Button>
            <div
              key={squadSize}
              className="flex-1 animate-in text-center fade-in zoom-in-50 duration-150 motion-reduce:animate-none"
            >
              <span className="font-heading text-3xl font-bold tabular-nums">
                {num(squadSize)}
              </span>
              <span className="ml-1 text-sm text-dt-dim">
                / {num(maxSquad)}
              </span>
            </div>
            <Button
              type="button"
              variant="outline"
              size="icon"
              aria-label={t("matches.wizard.increase")}
              disabled={squadSize >= maxSquad}
              onClick={() => setSquadSize((n) => Math.min(maxSquad, n + 1))}
            >
              +
            </Button>
          </div>

          {/* Squad dots — solid = starting XI, faded = substitutes */}
          <div aria-hidden className="flex flex-wrap justify-center gap-1.5">
            {Array.from({ length: squadSize }, (_, i) => (
              <span
                key={i}
                className={`size-2.5 rounded-full transition-colors duration-200 ${
                  i < starters
                    ? "bg-dt-green"
                    : "bg-dt-green/15 ring-1 ring-inset ring-dt-green/50"
                }`}
              />
            ))}
          </div>
          <p className="text-center text-sm text-dt-dim">
            {t("matches.wizard.squadSummary", {
              starters: num(starters),
              subs: num(subs),
              total: num(squadSize),
            })}
          </p>
        </div>
      </StepCard>

      {/* Step 4 — how many players do you already have? */}
      <StepCard
        number={num(4)}
        title={t("matches.wizard.stepCount")}
        help={t("matches.wizard.countHint")}
        done={steps[3].done}
        active={activeIdx === 3}
      >
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-2">
            <OptionCard
              selected={fullSquad}
              onClick={() => setPlayerCount(squadSize)}
              label={t("matches.wizard.fullSquad")}
            />
            <div
              className={`flex items-center justify-center gap-2 rounded-xl border p-1.5 transition-colors ${
                playerCount !== null && !fullSquad
                  ? "border-dt-green bg-dt-green/10 ring-2 ring-dt-green/25"
                  : "border-dt-line bg-dt-card"
              }`}
            >
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="size-8"
                aria-label={t("matches.wizard.decrease")}
                disabled={playerCount === null || playerCount <= 1}
                onClick={() =>
                  setPlayerCount((n) => Math.max(1, (n ?? squadSize) - 1))
                }
              >
                −
              </Button>
              <span
                key={playerCount}
                className="min-w-8 animate-in text-center font-heading text-lg font-bold tabular-nums fade-in zoom-in-50 duration-150 motion-reduce:animate-none"
              >
                {playerCount === null ? "—" : num(playerCount)}
              </span>
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="size-8"
                aria-label={t("matches.wizard.increase")}
                disabled={playerCount !== null && playerCount >= squadSize}
                onClick={() =>
                  setPlayerCount((n) => Math.min(squadSize, (n ?? 0) + 1))
                }
              >
                +
              </Button>
            </div>
          </div>

          {/* Visual fill: X/Y bar — the single clearest "what's missing" cue */}
          {playerCount !== null ? (
            <div className="animate-in space-y-2 rounded-lg border border-dt-line bg-dt-bg p-3 fade-in slide-in-from-top-1 duration-300 motion-reduce:animate-none">
              <div className="flex items-center justify-between text-sm">
                <span className="font-medium">{t("matches.wizard.yourSquad")}</span>
                <span className="font-semibold tabular-nums">
                  {num(playerCount)}/{num(squadSize)}
                </span>
              </div>
              <Progress value={(playerCount / squadSize) * 100} />
              <p
                className={`text-sm leading-snug ${
                  fullSquad ? "font-medium text-dt-green" : "text-dt-dim"
                }`}
              >
                {fullSquad
                  ? t("matches.wizard.fullSquadMessage")
                  : t("matches.wizard.haveCountMessage", {
                      count: num(playerCount),
                      need: num(spotsNeeded),
                    })}
              </p>
            </div>
          ) : null}
        </div>
      </StepCard>

      {/* Sticky action bar — summary + create always within reach */}
      <div className="sticky bottom-0 -mx-4 mt-8 border-t border-dt-line bg-dt-bg/90 px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 backdrop-blur-md">
        <p className="mb-2 truncate text-sm text-dt-dim">
          {selectedBooking
            ? t("matches.wizard.squadFill", {
                count: num(playerCount ?? squadSize),
                total: num(squadSize),
              })
            : t("matches.wizard.pickBookingFirst")}
        </p>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => router.back()}
            disabled={pending}
            aria-label={t("common.back")}
          >
            <ChevronLeftIcon aria-hidden />
          </Button>
          <Button
            onClick={create}
            loading={pending}
            disabled={bookingId === null || playerCount === null}
            className="flex-1"
          >
            {t("matches.create")}
          </Button>
        </div>
      </div>
    </div>
  )
}
