"use client"

import { useTransition } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { requestToJoinAction } from "@/features/player/actions"

interface TeamSpot {
  teamId: string
  teamName: string
  open: number
}

export function JoinRequestButton({
  matchId,
  spots,
}: {
  matchId: string
  spots: TeamSpot[]
}) {
  const router = useRouter()
  const [pending, start] = useTransition()

  if (spots.length === 0) return null

  function join(teamName: string) {
    start(async () => {
      const res = await requestToJoinAction(matchId)
      if (!res.ok) {
        toast.error(res.error)
        return
      }
      toast.success(`Requested to join ${teamName}.`)
      router.refresh()
    })
  }

  return (
    <div className="flex flex-wrap gap-2">
      {spots.map((s) => (
        <Button
          key={s.teamId}
          size="sm"
          variant="outline"
          onClick={() => join(s.teamName)}
          disabled={pending}
        >
          Request to join {s.teamName} ({s.open} spots)
        </Button>
      ))}
    </div>
  )
}
