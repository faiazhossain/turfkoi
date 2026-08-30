"use client"

import { useState, useTransition } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { SearchIcon } from "lucide-react"

import { useI18n } from "@/i18n/client"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { POSITION_IDS } from "@/features/player/positions"
import { POSITION_LABEL } from "@/i18n/labels"

const ALL = "__all__"

/**
 * Match-page player search. URL is the source of truth: submitting pushes
 * `?player_q=&player_pos=` and the server re-renders the filtered list and
 * map (same pattern as the turfs AreaSearch). An empty query clears filters.
 */
export function playerSearchUrl(
  matchId: string,
  q: string,
  position: string
): string {
  const params = new URLSearchParams()
  const name = q.trim()
  if (name) params.set("player_q", name)
  if (position && position !== ALL) params.set("player_pos", position)
  const qs = params.toString()
  return qs ? `/matches/${matchId}?${qs}` : `/matches/${matchId}`
}

export function PlayerSearch({
  matchId,
  defaultQ = "",
  defaultPosition = "",
  hasFilter,
}: {
  matchId: string
  defaultQ?: string
  defaultPosition?: string
  hasFilter: boolean
}) {
  const router = useRouter()
  const { t } = useI18n()
  const [pending, start] = useTransition()
  const [query, setQuery] = useState(defaultQ)
  const [position, setPosition] = useState(defaultPosition || ALL)

  function search(q: string, pos: string) {
    start(async () => {
      router.push(playerSearchUrl(matchId, q, pos))
    })
  }

  return (
    <form
      className="flex flex-wrap items-end gap-2"
      onSubmit={(e) => {
        e.preventDefault()
        search(query, position)
      }}
    >
      <div className="min-w-40 flex-1 space-y-1">
        <Label htmlFor="player-search" className="text-xs">
          {t("matches.playerSearchLabel")}
        </Label>
        <div className="relative">
          <SearchIcon
            className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <Input
            id="player-search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("matches.playerSearchPlaceholder")}
            className="pl-8"
            autoComplete="off"
          />
        </div>
      </div>
      <div className="space-y-1">
        <Label className="text-xs">{t("matches.playerSearchPosition")}</Label>
        <Select
          value={position}
          onValueChange={(v) => {
            if (!v) return
            setPosition(v)
            search(query, v)
          }}
        >
          <SelectTrigger className="w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>{t("matches.playerSearchAll")}</SelectItem>
            {POSITION_IDS.map((id) => (
              <SelectItem key={id} value={id}>
                {t(POSITION_LABEL[id])}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <Button type="submit" variant="outline" loading={pending}>
        {t("common.search")}
      </Button>
      {hasFilter ? (
        <Button
          type="button"
          variant="ghost"
          render={<Link href={`/matches/${matchId}`} />}
          disabled={pending}
        >
          {t("common.clear")}
        </Button>
      ) : null}
    </form>
  )
}
