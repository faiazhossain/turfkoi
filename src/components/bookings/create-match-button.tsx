"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { SwordsIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { createMatchAction } from "@/features/matches/actions"
import { useI18n } from "@/i18n/client"
import { teamMemberRoleLabel } from "@/i18n/labels"

interface TeamOption {
  id: string
  name: string
  role: string
}

export function CreateMatchButton({
  bookingId,
  teams,
}: {
  bookingId: string
  teams: TeamOption[]
}) {
  const router = useRouter()
  const { t } = useI18n()
  const [pending, start] = useTransition()
  const [teamId, setTeamId] = useState(teams[0]?.id ?? "")
  const [expanded, setExpanded] = useState(false)

  if (teams.length === 0) return null

  function create() {
    start(async () => {
      const res = await createMatchAction({ bookingId, teamId })
      if (!res.ok) {
        toast.error(t(res.error ?? "errors.generic"))
        return
      }
      toast.success(t("matches.createdToast"))
      if (res.matchId) router.push(`/matches/${res.matchId}`)
    })
  }

  if (!expanded) {
    return (
      <Button
        variant="outline"
        className="w-full"
        onClick={() => setExpanded(true)}
      >
        <SwordsIcon aria-hidden />
        {t("matches.createCta")}
      </Button>
    )
  }

  return (
    <div className="space-y-2 rounded-lg border border-border bg-card p-3">
      <p className="text-sm font-medium">{t("matches.pickTeam")}</p>
      <Select value={teamId} onValueChange={(v) => v && setTeamId(v)}>
        <SelectTrigger className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {teams.map((team) => (
            <SelectItem key={team.id} value={team.id}>
              {team.name} ({t(teamMemberRoleLabel(team.role))})
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <div className="flex gap-2">
        <Button onClick={create} loading={pending} disabled={!teamId} size="sm">
          {pending ? t("matches.creating") : t("matches.create")}
        </Button>
        <Button
          onClick={() => setExpanded(false)}
          variant="ghost"
          size="sm"
          disabled={pending}
        >
          {t("common.cancel")}
        </Button>
      </div>
    </div>
  )
}
