"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"

import { useI18n } from "@/i18n/client"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Loader } from "@/components/ui/loader"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  assignRecorderAction,
  logMatchEventAction,
} from "@/features/matches/actions"
import { MATCH_EVENT_TYPES } from "@/features/matches/events"
import { MATCH_EVENT_TYPE_LABEL } from "@/i18n/labels"

export type LoggerPlayer = {
  /** "p-<userId>" or "g-<guestId>" */
  ref: string
  name: string
  side: "home" | "away"
}

/** Sentinel for "no recorder" — Base UI Select values must be non-empty. */
const NONE = "__none__"

/**
 * The logger's write panel: pick an event type, the player, an optional
 * note. Captains also (re)assign the match logger here; a delegated logger
 * just sees a "you are logging" hint.
 */
export function MatchEventLogger({
  matchId,
  players,
  canAssign,
  recorderId,
  viewerId,
}: {
  matchId: string
  players: LoggerPlayer[]
  canAssign: boolean
  recorderId: string | null
  viewerId: string
}) {
  const { t } = useI18n()
  const router = useRouter()
  const [eventType, setEventType] = useState<(typeof MATCH_EVENT_TYPES)[number]>("goal")
  const [playerRef, setPlayerRef] = useState("")
  const [note, setNote] = useState("")
  const [pending, start] = useTransition()
  const [assignPending, startAssign] = useTransition()

  const registeredPlayers = players.filter((p) => p.ref.startsWith("p-"))
  const isRecorder = recorderId !== null && recorderId === viewerId
  const assignedPlayer =
    recorderId !== null
      ? registeredPlayers.find((p) => p.ref === `p-${recorderId}`)
      : undefined

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (pending) return
    start(async () => {
      const res = await logMatchEventAction({
        matchId,
        eventType,
        playerRef: playerRef || undefined,
        note,
      })
      if (!res.ok) {
        toast.error(t(res.error ?? "errors.generic"))
        return
      }
      toast.success(t("matches.events.logged"))
      setNote("")
      router.refresh()
    })
  }

  function assign(value: string) {
    startAssign(async () => {
      const res = await assignRecorderAction({
        matchId,
        recorderId: value === NONE ? null : value,
      })
      if (!res.ok) {
        toast.error(t(res.error ?? "errors.generic"))
        return
      }
      router.refresh()
    })
  }

  return (
    <section className="space-y-3 rounded-2xl border border-dt-line bg-dt-card p-4">
      {canAssign ? (
        <div className="flex flex-wrap items-center gap-2">
          <Label className="text-xs">{t("matches.events.recorder.label")}</Label>
          {registeredPlayers.length === 0 ? (
            <p className="text-xs text-dt-dim">
              {t("matches.events.recorder.noPlayers")}
            </p>
          ) : (
            <div className="flex items-center gap-2">
              <Select
                value={recorderId ?? NONE}
                onValueChange={(v) => {
                  if (typeof v === "string") assign(v)
                }}
              >
                <SelectTrigger className="w-56" disabled={assignPending}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>
                    {t("matches.events.recorder.none")}
                  </SelectItem>
                  {registeredPlayers.map((p) => (
                    <SelectItem key={p.ref} value={p.ref.slice(2)}>
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {assignPending ? <Loader size={14} aria-hidden /> : null}
            </div>
          )}
        </div>
      ) : isRecorder ? (
        <p className="text-xs text-dt-dim">
          {t("matches.events.recorder.you")}
        </p>
      ) : assignedPlayer ? (
        <p className="text-xs text-dt-dim">
          {t("matches.events.recorder.assigned", { name: assignedPlayer.name })}
        </p>
      ) : null}

      <form onSubmit={submit} className="space-y-3">
        <div
          role="group"
          aria-label={t("matches.events.title")}
          className="flex flex-wrap gap-1.5"
        >
          {MATCH_EVENT_TYPES.map((type) => (
            <Button
              key={type}
              type="button"
              size="sm"
              variant={eventType === type ? "default" : "outline"}
              aria-pressed={eventType === type}
              onClick={() => setEventType(type)}
            >
              {t(MATCH_EVENT_TYPE_LABEL[type])}
            </Button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Select
            value={playerRef}
            onValueChange={(v) => {
              if (typeof v === "string") setPlayerRef(v)
            }}
          >
            <SelectTrigger className="w-56">
              <SelectValue placeholder={t("matches.events.pickPlayer")} />
            </SelectTrigger>
            <SelectContent>
              {players.map((p) => (
                <SelectItem key={p.ref} value={p.ref}>
                  {p.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder={t("matches.events.notePlaceholder")}
            maxLength={240}
            aria-label={t("matches.events.notePlaceholder")}
            className="min-w-40 flex-1"
          />
          <Button type="submit" loading={pending}>
            {t("matches.events.logButton")}
          </Button>
        </div>
      </form>
    </section>
  )
}
