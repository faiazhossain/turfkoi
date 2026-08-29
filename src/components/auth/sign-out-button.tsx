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
      aria-label={t("nav.signOut")}
      className="px-2 sm:px-2.5"
      onClick={() => startTransition(async () => await signOutAction())}
    >
      <LogOutIcon />
      <span className="hidden sm:inline">{t("nav.signOut")}</span>
    </Button>
  )
}
