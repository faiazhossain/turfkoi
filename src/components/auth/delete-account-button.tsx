"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { Trash2Icon, AlertTriangleIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { useI18n } from "@/i18n/client"
import { requestAccountDeletionAction } from "@/features/auth/actions"

export function DeleteAccountButton() {
  const router = useRouter()
  const { t } = useI18n()
  const [pending, start] = useTransition()
  const [confirming, setConfirming] = useState(false)

  function run() {
    start(async () => {
      try {
        await requestAccountDeletionAction()
        toast.success(t("settings.deleteScheduledToast"))
        router.refresh()
      } catch {
        toast.error(t("settings.deleteFailedToast"))
      }
    })
  }

  if (!confirming) {
    return (
      <Button variant="destructive" onClick={() => setConfirming(true)}>
        <Trash2Icon aria-hidden />
        {t("settings.deleteButton")}
      </Button>
    )
  }

  return (
    <div className="space-y-3 rounded-lg border border-destructive/30 bg-destructive/5 p-4">
      <p className="flex items-center gap-2 text-sm font-medium text-destructive">
        <AlertTriangleIcon className="size-4" aria-hidden />
        {t("settings.deleteConfirmTitle")}
      </p>
      <p className="text-sm text-muted-foreground">
        {t("settings.deleteConfirmBody")}
      </p>
      <div className="flex items-center gap-1">
        <Button variant="destructive" onClick={run} loading={pending}>
          {t("settings.deleteConfirmButton")}
        </Button>
        <Button variant="ghost" onClick={() => setConfirming(false)} disabled={pending}>
          {t("common.cancel")}
        </Button>
      </div>
    </div>
  )
}
