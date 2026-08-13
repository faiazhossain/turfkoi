"use client"

import { useTransition } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { ZapIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { toggleAvailabilityAction } from "@/features/player/actions"

export function AvailabilityToggle({ available }: { available: boolean }) {
  const router = useRouter()
  const [pending, start] = useTransition()

  function toggle() {
    start(async () => {
      const res = await toggleAvailabilityAction()
      if (!res.ok) {
        toast.error(res.error)
        return
      }
      toast.success(res.available ? "You're marked available!" : "Availability off.")
      router.refresh()
    })
  }

  return (
    <Button
      variant={available ? "default" : "outline"}
      onClick={toggle}
      disabled={pending}
      className="w-full"
    >
      <ZapIcon aria-hidden />
      {available ? "Available — turn off" : "Set available tonight"}
    </Button>
  )
}
