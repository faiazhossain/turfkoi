"use client"

import { useTransition } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { useI18n } from "@/i18n/client"

import { devVerifyPaymentSubmissionAction } from "@/features/payments/actions"

/**
 * DEV-ONLY shortcut: instantly verifies a pending payment submission so
 * developers can test the manual bKash loop locally without signing in as an
 * admin. Renders nothing in production, and the server action hard-refuses
 * outside development anyway.
 */
export function DevVerifyButton({ submissionId }: { submissionId: string }) {
  const router = useRouter()
  const { t } = useI18n()
  const [pending, start] = useTransition()

  if (process.env.NODE_ENV === "production") return null

  return (
    <Button
      size="xs"
      variant="outline"
      loading={pending}
      onClick={() =>
        start(async () => {
          const res = await devVerifyPaymentSubmissionAction(submissionId)
          if (!res.ok) {
            toast.error(t(res.error ?? "errors.generic"))
            return
          }
          toast.success(t("payments.devVerifiedToast"))
          router.refresh()
        })
      }
    >
      {t("payments.devVerify")}
    </Button>
  )
}
