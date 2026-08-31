"use client"

import { useState, useTransition, type ReactNode } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import {
  CheckIcon,
  ChevronLeftIcon,
  GoalIcon,
  UserCheckIcon,
  UserPlusIcon,
  UsersIcon,
} from "lucide-react"

import { useI18n } from "@/i18n/client"
import { toBnDigits } from "@/lib/format-time"

import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Checkbox } from "@/components/ui/checkbox"
import { Progress } from "@/components/ui/progress"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { createMatchAction, inviteMatchPlayersAction } from "@/features/matches/actions"
import {
  FORMATS,
  MATCH_FORMATS,
  defaultSquadSize,
  isValidSquadSize,
  startersOf,
  type MatchFormat,
} from "@/features/matches/formats"

export interface WizardTeam {
  id: string
  name: string
}

export interface WizardNearbyPlayer {
  userId: string
  name: string | null
  position: string | null
  area: string | null
  distanceKm: number
}

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
      className={`animate-in fade-in slide-in-from-bottom-2 motion-reduce:animate-none rounded-xl border bg-card p-4 transition-colors duration-300 sm:p-5 ${
        active ? "border-primary/40 shadow-sm" : "border-border"
      }`}
    >
      <div className="flex items-start gap-3">
        <span
          aria-hidden
          className={`flex size-7 shrink-0 items-center justify-center rounded-full font-heading text-xs font-bold transition-all duration-300 ${
            done
              ? "bg-primary text-primary-foreground"
              : active
                ? "bg-primary/10 text-primary ring-4 ring-primary/10"
                : "bg-muted text-muted-foreground"
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
            <p className="mt-0.5 text-sm leading-snug text-muted-foreground">
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
          ? "border-primary bg-primary/10 ring-2 ring-primary/25"
          : "border-border bg-card hover:border-primary/40"
      } ${className}`}
    >
      {selected ? (
        <CheckIcon
          aria-hidden
          className="absolute right-2 top-2 size-4 text-primary animate-in zoom-in-50 duration-200 motion-reduce:animate-none"
        />
      ) : null}
      <span className="block font-heading font-semibold leading-tight">{label}</span>
      {sub ? (
        <span className="mt-1 block text-xs leading-snug text-muted-foreground">
          {sub}
        </span>
      ) : null}
    </button>
  )
}

/**
 * Match creation flow — count-first (owner spec):
 *   1. Format (7v7 etc.) — players per side ON THE FIELD.
 *   2. Squad size — total incl. substitutes.
 *   3. "How many players do you already have?" — a count, or Full squad.
 *      NO identities here: names/numbers/invites/guests all happen later,
 *      progressively, from the match room.
 *   4. Still short? Optionally pre-invite nearby available players.
 *
 * UX: a stepper header shows where you are, each step is a card whose badge
 * turns into a check, squad fill is visualized with dots + a progress bar,
 * and the create action sits in a sticky bottom bar with a live summary.
 */
export function CreateMatchWizard({
  bookingId,
  teams,
  currentUserId,
  nearbyPlayers,
}: {
  bookingId: string
  teams: WizardTeam[]
  currentUserId: string
  nearbyPlayers: WizardNearbyPlayer[]
}) {
  const router = useRouter()
  const { t, locale } = useI18n()
  const [pending, start] = useTransition()

  // Steps 1–2
  const [format, setFormat] = useState<MatchFormat>("fives")
  const [squadSize, setSquadSize] = useState<number>(defaultSquadSize("fives"))

  // Step 3 — count-first: how many players does the captain already have?
  const [teamId, setTeamId] = useState<string>("")
  const [playerCount, setPlayerCount] = useState<number | null>(null)

  // Step 4 — nearby available players (optional, progressive)
  const [wantNearby, setWantNearby] = useState<boolean | null>(null)
  const [pickedNearbyIds, setPickedNearbyIds] = useState<string[]>([])

  const starters = startersOf(format)
  const maxSquad = FORMATS[format].maxSquad
  const subs = squadSize - starters
  const num = (n: number) => (locale === "bn" ? toBnDigits(String(n)) : String(n))

  function pickFormat(f: MatchFormat) {
    setFormat(f)
    const next = isValidSquadSize(f, squadSize) ? squadSize : defaultSquadSize(f)
    setSquadSize(next)
    setPlayerCount((prev) => (prev === null ? null : Math.min(prev, next)))
  }

  // Declared count excludes the creator (always on the roster); nearby picks
  // are invitations (pending seats), not placeholders.
  const placeholders = playerCount === null ? 0 : Math.max(0, playerCount - 1)
  const fullSquad = playerCount !== null && playerCount >= squadSize
  const spotsNeeded = playerCount === null ? 0 : Math.max(0, squadSize - playerCount)
  const showNearbyStep = playerCount !== null && spotsNeeded > 0
  const nearbyCount = pickedNearbyIds.length
  const nearbyAtCap = nearbyCount >= spotsNeeded

  const steps = [
    { id: "format", label: t("matches.wizard.navFormat"), icon: GoalIcon, done: true },
    { id: "squad", label: t("matches.wizard.navSquad"), icon: UsersIcon, done: true },
    {
      id: "count",
      label: t("matches.wizard.navCount"),
      icon: UserCheckIcon,
      done: playerCount !== null,
    },
    {
      id: "fill",
      label: t("matches.wizard.navFill"),
      icon: UserPlusIcon,
      done: showNearbyStep ? wantNearby !== null : true,
    },
  ]
  const activeIdx = Math.max(
    0,
    steps.findIndex((s) => !s.done)
  )
  const doneCount = steps.filter((s) => s.done).length

  function toggleNearby(userId: string) {
    setPickedNearbyIds((prev) =>
      prev.includes(userId)
        ? prev.filter((x) => x !== userId)
        : prev.length >= spotsNeeded
          ? prev
          : [...prev, userId]
    )
  }

  function create() {
    start(async () => {
      const res = await createMatchAction({
        bookingId,
        teamId: teamId && teamId !== "solo" ? teamId : undefined,
        matchType: format,
        squadSize,
        placeholderCount: placeholders,
      })
      if (!res.ok) {
        toast.error(t(res.error ?? "errors.generic"))
        return
      }
      // Honor step 4's promise: pre-invite the nearby players picked above.
      // Best-effort — the match room shows pending invites either way.
      if (res.matchId && wantNearby && nearbyCount > 0) {
        await inviteMatchPlayersAction({
          matchId: res.matchId,
          userIds: pickedNearbyIds,
        }).catch(() => {})
      }
      toast.success(t("matches.createdToast"))
      if (res.matchId) router.push(`/matches/${res.matchId}`)
    })
  }

  return (
    <div className="space-y-5">
      {/* Stepper — where am I, how much is left */}
      <nav aria-label={t("matches.wizard.stepProgress", { done: doneCount, total: steps.length })}>
        <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
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
                      ? "bg-primary text-primary-foreground"
                      : i === activeIdx
                        ? "bg-primary/10 text-primary ring-4 ring-primary/15"
                        : "bg-muted text-muted-foreground"
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
                      ? "text-foreground"
                      : "text-muted-foreground"
                  }`}
                >
                  {s.label}
                </span>
              </div>
              {i < steps.length - 1 ? (
                <span
                  aria-hidden
                  className={`mt-4 h-0.5 min-w-3 flex-1 rounded-full transition-colors duration-500 ${
                    steps[i].done && steps[i + 1].done ? "bg-primary" : "bg-border"
                  }`}
                />
              ) : null}
            </li>
          ))}
        </ol>
      </nav>

      {/* Step 1 — format */}
      <StepCard
        number={num(1)}
        title={t("matches.wizard.stepFormat")}
        help={t("matches.wizard.formatHelp")}
        done={steps[0].done}
        active={activeIdx === 0}
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

      {/* Step 2 — squad size */}
      <StepCard
        number={num(2)}
        title={t("matches.wizard.stepSquad")}
        help={t("matches.wizard.squadHelp")}
        done={steps[1].done}
        active={activeIdx === 1}
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
              <span className="ml-1 text-sm text-muted-foreground">
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
                    ? "bg-primary"
                    : "bg-primary/15 ring-1 ring-inset ring-primary/50"
                }`}
              />
            ))}
          </div>
          <p className="text-center text-sm text-muted-foreground">
            {t("matches.wizard.squadSummary", {
              starters: num(starters),
              subs: num(subs),
              total: num(squadSize),
            })}
          </p>
        </div>
      </StepCard>

      {/* Step 3 — which team + how many players do you already have? */}
      <StepCard
        number={num(3)}
        title={t("matches.wizard.stepCount")}
        help={t("matches.wizard.countHint")}
        done={steps[2].done}
        active={activeIdx === 2}
      >
        <div className="space-y-4">
          {teams.length > 0 ? (
            <div className="space-y-1">
              <Select
                value={teamId || undefined}
                onValueChange={(v) => setTeamId(v ?? "")}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder={t("matches.wizard.teamPickLabel")} />
                </SelectTrigger>
                <SelectContent>
                  {teams.map((tm) => (
                    <SelectItem key={tm.id} value={tm.id}>
                      {tm.name}
                    </SelectItem>
                  ))}
                  <SelectItem value="solo">{t("matches.noTeamOption")}</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                {t("matches.wizard.teamPickHelp")}
              </p>
            </div>
          ) : null}

          <div className="grid grid-cols-2 gap-2">
            <OptionCard
              selected={fullSquad}
              onClick={() => setPlayerCount(squadSize)}
              label={t("matches.wizard.fullSquad")}
            />
            <div
              className={`flex items-center justify-center gap-2 rounded-xl border p-1.5 transition-colors ${
                playerCount !== null && !fullSquad
                  ? "border-primary bg-primary/10 ring-2 ring-primary/25"
                  : "border-border bg-card"
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
            <div className="animate-in space-y-2 rounded-lg border border-border bg-background p-3 fade-in slide-in-from-top-1 duration-300 motion-reduce:animate-none">
              <div className="flex items-center justify-between text-sm">
                <span className="font-medium">{t("matches.wizard.yourSquad")}</span>
                <span className="font-semibold tabular-nums">
                  {num(playerCount)}/{num(squadSize)}
                </span>
              </div>
              <Progress value={(playerCount / squadSize) * 100} />
              <p
                className={`text-sm leading-snug ${
                  fullSquad ? "font-medium text-primary" : "text-muted-foreground"
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

      {/* Step 4 — fill remaining spots from nearby available players */}
      {showNearbyStep ? (
        <StepCard
          number={num(4)}
          title={t("matches.wizard.nearbyQuestion", { count: num(spotsNeeded) })}
          done={steps[3].done}
          active={activeIdx === 3}
        >
          <div className="animate-in space-y-3 fade-in slide-in-from-top-1 duration-300 motion-reduce:animate-none">
            <div className="grid grid-cols-2 gap-2">
              <OptionCard
                selected={wantNearby === true}
                onClick={() => setWantNearby(true)}
                label={t("matches.wizard.nearbyYes")}
              />
              <OptionCard
                selected={wantNearby === false}
                onClick={() => setWantNearby(false)}
                label={t("matches.wizard.nearbyNo")}
              />
            </div>
            {wantNearby ? (
              nearbyPlayers.filter((p) => p.userId !== currentUserId).length > 0 ? (
                <>
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm text-muted-foreground">
                      {t("matches.wizard.nearbyHelp", { count: num(spotsNeeded) })}
                    </p>
                    <span className="shrink-0 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium tabular-nums text-primary">
                      {t("matches.wizard.nearbyPicked", {
                        count: num(nearbyCount),
                        need: num(spotsNeeded),
                      })}
                    </span>
                  </div>
                  <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border">
                    {nearbyPlayers
                      .filter((p) => p.userId !== currentUserId)
                      .map((p) => {
                        const picked = pickedNearbyIds.includes(p.userId)
                        return (
                        <li
                          key={p.userId}
                          className={`flex items-center gap-3 p-2.5 text-sm transition-colors ${
                            picked ? "bg-primary/5" : "bg-card"
                          }`}
                        >
                          <Checkbox
                            id={`nearby-${p.userId}`}
                            disabled={!picked && nearbyAtCap}
                            checked={picked}
                            onCheckedChange={() => toggleNearby(p.userId)}
                          />
                          <Label
                            htmlFor={`nearby-${p.userId}`}
                            className="min-w-0 flex-1 cursor-pointer"
                          >
                            <span className="block truncate font-normal">
                              {p.name ?? t("matches.player")}
                            </span>
                            <span className="block text-xs text-muted-foreground">
                              {[
                                p.position,
                                p.area,
                                `${p.distanceKm.toFixed(1)} km`,
                              ]
                                .filter(Boolean)
                                .join(" · ")}
                            </span>
                          </Label>
                        </li>
                        )
                      })}
                  </ul>
                </>
              ) : (
                <p className="rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground">
                  {t("matches.nearbyEmpty")}
                </p>
              )
            ) : null}
          </div>
        </StepCard>
      ) : null}

      {/* Sticky action bar — summary + create always within reach */}
      <div className="sticky bottom-0 -mx-4 mt-8 border-t border-border bg-background/90 px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 backdrop-blur-md">
        <p className="mb-2 truncate text-sm text-muted-foreground">
          {t("matches.wizard.squadFill", {
            count: num(playerCount ?? squadSize),
            total: num(squadSize),
          })}
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
            disabled={playerCount === null}
            className="flex-1"
          >
            {t("matches.create")}
          </Button>
        </div>
      </div>
    </div>
  )
}
