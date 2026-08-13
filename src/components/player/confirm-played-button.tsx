"use client"

import { useTransition } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { CheckIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { confirmPlayedAction } from "@/features/player/actions"

export function ConfirmPlayedButton({ matchId }: { matchId: string }) {
  const router = useRouter()
  const [pending, start] = useTransition()

  function confirm() {
    start(async () => {
      const res = await confirmPlayedAction(matchId)
      if (!res.ok) {
        toast.error(res.error)
        return
      }
      toast.success("Thanks for confirming!")
      router.refresh()
    })
  }

  return (
    <Button
      size="xs"
      variant="outline"
      onClick={confirm}
      disabled={pending}
    >
      <CheckIcon aria-hidden />
      I played
    </Button>
  )
}
