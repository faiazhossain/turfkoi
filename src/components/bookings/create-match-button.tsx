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
  const [pending, start] = useTransition()
  const [teamId, setTeamId] = useState(teams[0]?.id ?? "")
  const [expanded, setExpanded] = useState(false)

  if (teams.length === 0) return null

  function create() {
    start(async () => {
      const res = await createMatchAction({ bookingId, teamId })
      if (!res.ok) {
        toast.error(res.error)
        return
      }
      toast.success("Match created!")
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
        Create match — find opponent
      </Button>
    )
  }

  return (
    <div className="space-y-2 rounded-lg border border-border bg-card p-3">
      <p className="text-sm font-medium">Pick your team</p>
      <Select value={teamId} onValueChange={(v) => v && setTeamId(v)}>
        <SelectTrigger className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {teams.map((t) => (
            <SelectItem key={t.id} value={t.id}>
              {t.name} ({t.role})
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <div className="flex gap-2">
        <Button onClick={create} loading={pending} disabled={!teamId} size="sm">
          {pending ? "Creating…" : "Create match"}
        </Button>
        <Button
          onClick={() => setExpanded(false)}
          variant="ghost"
          size="sm"
          disabled={pending}
        >
          Cancel
        </Button>
      </div>
    </div>
  )
}
