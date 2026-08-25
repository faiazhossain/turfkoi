"use client"

import { useTransition } from "react"
import { LogOutIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { useI18n } from "@/i18n/client"
import { signOutAction } from "@/features/auth/actions"

export function SignOutButton() {
  const { t } = useI18n()
  const [pending, startTransition] = useTransition()
  return (
    <Button
      variant="outline"
      size="sm"
      loading={pending}
      onClick={() => startTransition(async () => await signOutAction())}
    >
      <LogOutIcon />
      {t("nav.signOut")}
    </Button>
  )
}
