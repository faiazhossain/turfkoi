"use client"

import { useEffect } from "react"

import { ErrorState } from "@/components/shared"

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    // Surface to the browser console / Sentry in Phase 8.
    console.error(error)
  }, [error])

  return (
    <div className="mx-auto max-w-6xl px-4 py-16">
      <ErrorState
        title="Something went wrong"
        description="An unexpected error occurred while loading this page."
        onRetry={reset}
      />
    </div>
  )
}
