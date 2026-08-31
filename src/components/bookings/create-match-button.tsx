"use client"

import { useRouter } from "next/navigation"
import { SwordsIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { useI18n } from "@/i18n/client"

/** CTA on the booking detail page — opens the match creation wizard. */
export function CreateMatchButton({ bookingId }: { bookingId: string }) {
  const router = useRouter()
  const { t } = useI18n()

  return (
    <Button
      variant="outline"
      className="w-full"
      onClick={() => router.push(`/bookings/${bookingId}/create-match`)}
    >
      <SwordsIcon aria-hidden />
      {t("matches.createCta")}
    </Button>
  )
}
