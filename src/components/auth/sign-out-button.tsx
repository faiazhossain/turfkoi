"use client"

import { useTransition } from "react"
import { LogOutIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { signOutAction } from "@/features/auth/actions"

export function SignOutButton() {
  const [pending, startTransition] = useTransition()
  return (
    <Button
      variant="outline"
      size="sm"
      disabled={pending}
      onClick={() => startTransition(async () => await signOutAction())}
    >
      <LogOutIcon />
      Sign out
    </Button>
  )
}
