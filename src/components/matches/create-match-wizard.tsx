"use client"

import {
  useEffect,
  useRef,
  useState,
  useTransition,
  type ReactNode,
} from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { toast } from "sonner"
import {
  CalendarCheckIcon,
  CheckIcon,
  GoalIcon,
  LockIcon,
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
 * Match creation flow — booking-first, count-first (owner spec), as a gated
 * stepper: a step must be completed before the next unlocks, completed steps
 * collapse into editable summaries, and upcoming steps stay visible but
 * locked.
 *   1. Pick the confirmed booking the match will be played on (a match is
 *      always played on a platform booking — book a turf first if needed).
 *   2. Format (7v7 etc.) — players per side ON THE FIELD.
 *   3. Squad size — total incl. substitutes.
 *   4. Who is in: count the players you already have, or open the match and
 *      add players later from the match room (DeshiTurf community invites).
 *      NO identities here: names/invites/guests all happen progressively
 *      from the match room.
 *
 * UX: there is no Continue button — selections drive progression. Picking a
 * booking, a format, or a squad size opens the next step immediately;
 * completed steps collapse into editable summaries, the stepper lets you
 * click back to anything you have passed, and the sticky bar holds Create.
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

  // Gated-stepper state: `current` is the open step, `furthest` the highest
  // step reached (stepper back-navigation never exceeds it).
  const [current, setCurrent] = useState(0)
  const [furthest, setFurthest] = useState(0)

  // Step 1 — which confirmed booking is the match played on?
  const preselected = bookings.some((b) => b.id === preselectedBookingId)
    ? preselectedBookingId
    : null
  const [bookingId, setBookingId] = useState<string | null>(preselected)

  // Steps 2–3
  const [format, setFormat] = useState<MatchFormat>("fives")
  const [squadSize, setSquadSize] = useState<number>(defaultSquadSize("fives"))

  // Step 4 — who is in: count the players you have, or add them later.
  const [playerCount, setPlayerCount] = useState<number | null>(null)
  const [haveChoice, setHaveChoice] = useState<"count" | "later" | null>(null)

  const topRef = useRef<HTMLDivElement>(null)

  // Follow the user down the page as steps unlock.
  useEffect(() => {
    if (current === 0) return
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches
    topRef.current?.scrollIntoView({
      block: "start",
      behavior: reduce ? "auto" : "smooth",
    })
  }, [current])

  const starters = startersOf(format)
  const maxSquad = FORMATS[format].maxSquad
  const subs = squadSize - starters
  // Every valid squad size for the format, as selectable chips.
  const squadChoices = Array.from(
    { length: maxSquad - starters + 1 },
    (_, i) => starters + i
  )
  const num = (n: number) => (locale === "bn" ? toBnDigits(String(n)) : String(n))
  const slotDate = (iso: string) => formatSlotDate(iso, locale)
  const slotTime = (v: string) => v.slice(0, 5)

  function pickFormat(f: MatchFormat) {
    setFormat(f)
    const next = isValidSquadSize(f, squadSize) ? squadSize : defaultSquadSize(f)
    setSquadSize(next)
    setPlayerCount((prev) => (prev === null ? null : Math.min(prev, next)))
  }

  function chooseCount() {
    setHaveChoice("count")
  }
  function chooseLater() {
    setHaveChoice("later")
    // Captain-only for now: every other seat becomes an open seat the match
    // room fills through DeshiTurf community invites / join requests.
    setPlayerCount(1)
  }

  // Declared count excludes the creator (always on the roster).
  const placeholders = playerCount === null ? 0 : Math.max(0, playerCount - 1)
  const fullSquad = playerCount !== null && playerCount >= squadSize
  const spotsNeeded = playerCount === null ? 0 : Math.max(0, squadSize - playerCount)

  /** Selections drive progression: picking a value opens the next step. */
  function advance(to: number) {
    setFurthest((f) => Math.max(f, to))
    setCurrent(to)
  }

  function goTo(i: number) {
    if (i <= furthest) setCurrent(i)
  }

  function pickBooking(id: string) {
    setBookingId(id)
    advance(1)
  }

  function pickSquadSize(size: number) {
    setSquadSize(size)
    setPlayerCount((prev) => (prev === null ? null : Math.min(prev, size)))
    advance(3)
  }

  const navSteps = [
    { id: "booking", label: t("matches.wizard.navBooking"), icon: CalendarCheckIcon },
    { id: "format", label: t("matches.wizard.navFormat"), icon: GoalIcon },
    { id: "squad", label: t("matches.wizard.navSquad"), icon: UsersIcon },
    { id: "count", label: t("matches.wizard.navCount"), icon: UserCheckIcon },
  ]
  const stepMeta = [
    { title: t("matches.wizard.stepBooking"), help: t("matches.wizard.bookingHelp") },
    { title: t("matches.wizard.stepFormat"), help: t("matches.wizard.formatHelp") },
    { title: t("matches.wizard.stepSquad"), help: t("matches.wizard.squadHelp") },
    { title: t("matches.wizard.stepCount"), help: undefined },
  ]
  const stepDone = [
    bookingId !== null,
    furthest > 1,
    furthest > 2,
    playerCount !== null,
  ]
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

  /**
   * One section per step in three states: the open StepCard, a collapsed
   * summary row with an Edit shortcut (steps already passed), or a locked
   * preview (steps ahead of the user).
   */
  function renderStep(
    i: number,
    summary: ReactNode,
    content: ReactNode
  ) {
    if (i === current) {
      return (
        <StepCard
          key={i}
          number={num(i + 1)}
          title={stepMeta[i].title}
          help={stepMeta[i].help}
          done={stepDone[i]}
          active
        >
          {content}
        </StepCard>
      )
    }
    if (i < current) {
      return (
        <div
          key={i}
          className="flex items-center gap-3 rounded-xl border border-dt-line bg-dt-card/60 p-3"
        >
          <span
            aria-hidden
            className="flex size-7 shrink-0 items-center justify-center rounded-full bg-dt-green text-dt-ink"
          >
            <CheckIcon className="size-4" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold">{stepMeta[i].title}</p>
            {summary ? (
              <p className="truncate text-xs text-dt-dim">{summary}</p>
            ) : null}
          </div>
          <Button variant="outline" size="sm" onClick={() => goTo(i)}>
            {t("common.edit")}
          </Button>
        </div>
      )
    }
    return (
      <div
        key={i}
        aria-disabled="true"
        className="flex items-center gap-3 rounded-xl border border-dashed border-dt-line p-3 opacity-60"
      >
        <span
          aria-hidden
          className="flex size-7 shrink-0 items-center justify-center rounded-full bg-dt-card2 text-xs font-bold text-dt-dim"
        >
          {num(i + 1)}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-dt-dim">{stepMeta[i].title}</p>
          <p className="text-xs text-dt-dim">{t("matches.wizard.lockedHint")}</p>
        </div>
        <LockIcon className="size-3.5 shrink-0 text-dt-dim/60" aria-hidden />
      </div>
    )
  }

  const bookingSummary = selectedBooking
    ? `${selectedBooking.turfName} · ${slotDate(selectedBooking.date)} ${slotTime(selectedBooking.slotStart)}`
    : null
  const formatSummary = t(`matches.format.${format}`)
  const squadSummaryText = t("matches.wizard.squadSummary", {
    starters: num(starters),
    subs: num(subs),
    total: num(squadSize),
  })

  return (
    <div ref={topRef} className="scroll-mt-20 space-y-4">
      {/* Stepper — where am I, what is left; passed steps click back */}
      <nav
        aria-label={t("matches.wizard.stepProgress", {
          done: num(current + 1),
          total: num(navSteps.length),
        })}
      >
        <p className="mb-2 text-xs font-medium uppercase tracking-wide text-dt-dim">
          {t("matches.wizard.stepProgress", {
            done: num(current + 1),
            total: num(navSteps.length),
          })}
        </p>
        <ol className="flex items-start">
          {navSteps.map((s, i) => {
            const passed = i < furthest
            const active = i === current
            return (
              <li
                key={s.id}
                aria-current={active ? "step" : undefined}
                className="flex min-w-0 flex-1 items-start last:flex-none"
              >
                <div className="flex w-14 flex-col items-center gap-1.5 sm:w-20">
                  <button
                    type="button"
                    onClick={() => goTo(i)}
                    disabled={i > furthest}
                    className={`flex size-8 items-center justify-center rounded-full transition-all duration-300 ${
                      passed
                        ? "bg-dt-green text-dt-ink"
                        : active
                          ? "bg-dt-green/10 text-dt-green ring-4 ring-dt-green/15"
                          : "bg-dt-card2 text-dt-dim"
                    } ${i <= furthest ? "cursor-pointer" : "cursor-not-allowed"}`}
                  >
                    {passed ? (
                      <CheckIcon
                        className="size-4 animate-in zoom-in-50 duration-300 motion-reduce:animate-none"
                        aria-hidden
                      />
                    ) : (
                      <s.icon className="size-4" aria-hidden />
                    )}
                  </button>
                  <span
                    className={`text-center text-[11px] font-medium leading-tight ${
                      active || passed ? "text-dt-txt" : "text-dt-dim"
                    }`}
                  >
                    {s.label}
                  </span>
                </div>
                {i < navSteps.length - 1 ? (
                  <span
                    aria-hidden
                    className={`mt-4 h-0.5 min-w-3 flex-1 rounded-full transition-colors duration-500 ${
                      i < furthest ? "bg-dt-green" : "bg-dt-line"
                    }`}
                  />
                ) : null}
              </li>
            )
          })}
        </ol>
      </nav>

      {/* Step 1 — the booking the match is played on */}
      {renderStep(
        0,
        bookingSummary,
        <>
          {bookings.length > 0 ? (
            <div className="space-y-2" role="radiogroup" aria-label={t("matches.wizard.stepBooking")}>
              {bookings.map((b) => (
                <button
                  key={b.id}
                  type="button"
                  role="radio"
                  aria-checked={bookingId === b.id}
                  onClick={() => pickBooking(b.id)}
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
        </>
      )}

      {/* Step 2 — format */}
      {renderStep(
        1,
        formatSummary,
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {MATCH_FORMATS.map((f) => (
            <OptionCard
              key={f}
              selected={format === f}
              onClick={() => {
                pickFormat(f)
                advance(2)
              }}
              label={t(`matches.format.${f}`)}
              sub={t("matches.wizard.starters", { count: num(startersOf(f)) })}
            />
          ))}
        </div>
      )}

      {/* Step 3 — squad size */}
      {renderStep(
        2,
        squadSummaryText,
        <div className="space-y-4">
          {/* Squad size as selectable chips — picking one opens the next step */}
          <div
            className="flex flex-wrap justify-center gap-2"
            role="radiogroup"
            aria-label={t("matches.wizard.stepSquad")}
          >
            {squadChoices.map((size) => (
              <button
                key={size}
                type="button"
                role="radio"
                aria-checked={squadSize === size}
                onClick={() => pickSquadSize(size)}
                className={`inline-flex min-w-11 items-center justify-center rounded-full border px-3.5 py-2 font-heading text-sm font-semibold tabular-nums transition-all duration-200 hover:-translate-y-0.5 motion-reduce:hover:translate-y-0 ${
                  squadSize === size
                    ? "border-dt-green bg-dt-green/10 text-dt-green ring-2 ring-dt-green/25"
                    : "border-dt-line bg-dt-card text-dt-txt hover:border-dt-green/40"
                }`}
              >
                {num(size)}
              </button>
            ))}
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
      )}

      {/* Step 4 — who is in: count them now, or add later from the room */}
      {renderStep(
        3,
        playerCount === null
          ? null
          : fullSquad
            ? t("matches.wizard.fullSquadMessage")
            : t("matches.wizard.haveCountMessage", {
                count: num(playerCount),
                need: num(spotsNeeded),
              }),
        <div className="space-y-3">
          <div className="grid gap-2" role="group" aria-label={t("matches.wizard.stepCount")}>
            <OptionCard
              selected={haveChoice === "count"}
              onClick={chooseCount}
              label={t("matches.wizard.havePlayersTitle")}
              sub={t("matches.wizard.havePlayersDesc")}
              className="text-left"
            />
            <OptionCard
              selected={haveChoice === "later"}
              onClick={chooseLater}
              label={t("matches.wizard.addLaterTitle")}
              sub={t("matches.wizard.addLaterDesc")}
              className="text-left"
            />
          </div>

          {haveChoice === "count" ? (
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
          ) : null}

          {haveChoice === "later" ? (
            <p className="rounded-lg border border-dt-line bg-dt-card2/50 p-3 text-sm leading-snug text-dt-dim">
              {t("matches.wizard.laterSeatsHint")}
            </p>
          ) : null}

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
      )}

      {/* Sticky action bar — Create once every step's selection exists */}
      <div className="sticky bottom-0 -mx-4 mt-8 border-t border-dt-line bg-dt-bg/90 px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 backdrop-blur-md">
        {current === 3 ? (
          <p className="mb-2 truncate text-sm text-dt-dim">
            {selectedBooking
              ? t("matches.wizard.squadFill", {
                  count: num(playerCount ?? squadSize),
                  total: num(squadSize),
                })
              : t("matches.wizard.pickBookingFirst")}
          </p>
        ) : null}
        <Button
          onClick={create}
          loading={pending}
          disabled={bookingId === null || playerCount === null}
          className="w-full"
        >
          {t("matches.create")}
        </Button>
      </div>
    </div>
  )
}
