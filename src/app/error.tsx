"use client"

import { useEffect } from "react"

import { ErrorState } from "@/components/shared"
import { useI18n } from "@/i18n/client"

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  const { t } = useI18n()

  useEffect(() => {
    // Surface to the browser console / Sentry in Phase 8.
    console.error(error)
  }, [error])

  return (
    <div className="mx-auto max-w-6xl px-4 py-16">
      <ErrorState
        title={t("errorPage.title")}
        description={t("errorPage.description")}
        onRetry={reset}
      />
    </div>
  )
}
