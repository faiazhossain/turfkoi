"use client"

import { useTransition } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { CheckIcon, XIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  acceptPlayerRequestAction,
  rejectPlayerRequestAction,
} from "@/features/player/actions"

interface RequestItem {
  matchId: string
  userId: string
  playerName: string | null
  playerPhone: string
}

interface RequestManagerProps {
  teamId: string
  requests: RequestItem[]
}

export function RequestManager({ teamId, requests }: RequestManagerProps) {
  const router = useRouter()
  const [pending, start] = useTransition()

  if (requests.length === 0) return null

  function accept(matchId: string, userId: string) {
    start(async () => {
      const res = await acceptPlayerRequestAction(matchId, userId, teamId)
      if (!res.ok) {
        toast.error(res.error)
        return
      }
      toast.success("Player added to roster.")
      router.refresh()
    })
  }

  function reject(matchId: string, userId: string) {
    start(async () => {
      const res = await rejectPlayerRequestAction(matchId, userId)
      if (!res.ok) {
        toast.error(res.error)
        return
      }
      toast.success("Request rejected.")
      router.refresh()
    })
  }

  return (
    <section className="space-y-2">
      <h3 className="font-heading text-sm font-semibold">
        Join requests ({requests.length})
      </h3>
      <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border">
        {requests.map((r) => (
          <li
            key={`${r.matchId}-${r.userId}`}
            className="flex items-center justify-between gap-2 bg-card p-3 text-sm"
          >
            <div className="min-w-0">
              <p className="truncate font-medium">
                {r.playerName ?? r.playerPhone}
              </p>
              {r.playerName ? (
                <p className="truncate text-xs text-muted-foreground">
                  {r.playerPhone}
                </p>
              ) : null}
            </div>
            <div className="flex items-center gap-1">
              <Button
                size="icon-sm"
                variant="outline"
                aria-label="Accept"
                onClick={() => accept(r.matchId, r.userId)}
                disabled={pending}
              >
                <CheckIcon aria-hidden />
              </Button>
              <Button
                size="icon-sm"
                variant="ghost"
                aria-label="Reject"
                onClick={() => reject(r.matchId, r.userId)}
                disabled={pending}
              >
                <XIcon aria-hidden />
              </Button>
            </div>
          </li>
        ))}
      </ul>
    </section>
  )
}
