"use client"

import Link from "next/link"
import { SwordsIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { useI18n } from "@/i18n/client"

/** CTA on the booking detail page — opens the creation wizard with this
 * booking preselected. */
export function CreateMatchButton({ bookingId }: { bookingId: string }) {
  const { t } = useI18n()

  return (
    <Button
      variant="outline"
      className="w-full"
      render={<Link href={`/matches/new?booking=${bookingId}`} />}
    >
      <SwordsIcon aria-hidden />
      {t("matches.createCta")}
    </Button>
  )
}
