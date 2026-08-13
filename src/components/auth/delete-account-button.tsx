"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { Trash2Icon, AlertTriangleIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { requestAccountDeletionAction } from "@/features/auth/actions"

export function DeleteAccountButton() {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [confirming, setConfirming] = useState(false)

  function run() {
    start(async () => {
      try {
        await requestAccountDeletionAction()
        toast.success("Account scheduled for deletion.")
        router.refresh()
      } catch {
        toast.error("Could not delete account. Try again or contact support.")
      }
    })
  }

  if (!confirming) {
    return (
      <Button variant="destructive" onClick={() => setConfirming(true)}>
        <Trash2Icon aria-hidden />
        Delete my account
      </Button>
    )
  }

  return (
    <div className="space-y-3 rounded-lg border border-destructive/30 bg-destructive/5 p-4">
      <p className="flex items-center gap-2 text-sm font-medium text-destructive">
        <AlertTriangleIcon className="size-4" aria-hidden />
        Confirm permanent deletion
      </p>
      <p className="text-sm text-muted-foreground">
        You will be signed out immediately and your account enters a 14-day
        grace window. After that, your name, phone, email, and player profile
        are permanently erased. Audit history (referenced by hashed id only) is
        retained.
      </p>
      <div className="flex items-center gap-1">
        <Button variant="destructive" onClick={run} disabled={pending}>
          Yes, delete my account
        </Button>
        <Button variant="ghost" onClick={() => setConfirming(false)} disabled={pending}>
          Cancel
        </Button>
      </div>
    </div>
  )
}
