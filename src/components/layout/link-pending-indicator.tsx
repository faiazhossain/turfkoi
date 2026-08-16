"use client"

import { useLinkStatus } from "next/link"

import { Loader } from "@/components/ui/loader"
import { cn } from "@/lib/utils"

/**
 * Inline pending hint for <Link> navigation (see Next.js useLinkStatus).
 * Always rendered at a fixed size to avoid layout shift; only becomes
 * visible when navigation is actually in flight (skips prefetched/
 * instant transitions via a 100ms fade-in delay).
 */
export function LinkPendingIndicator({ className }: { className?: string }) {
  const { pending } = useLinkStatus()
  return (
    <span aria-hidden className={cn("link-hint", pending && "is-pending", className)}>
      <Loader size={14} className="size-3.5" aria-hidden />
    </span>
  )
}
