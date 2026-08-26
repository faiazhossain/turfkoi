"use client"

import { useLinkStatus } from "next/link"

import { Loader } from "@/components/ui/loader"
import { cn } from "@/lib/utils"

/**
 * Inline pending hint for <Link> navigation (see Next.js useLinkStatus).
 * Takes up no space while idle — the width grows (CSS transition) and the
 * loader fades in only when navigation is actually in flight (skips
 * prefetched/instant transitions via a 100ms fade-in delay). Pass a fixed
 * width (e.g. `w-3.5`) via className for absolutely positioned usages.
 */
export function LinkPendingIndicator({ className }: { className?: string }) {
  const { pending } = useLinkStatus()
  return (
    <span
      aria-hidden
      className={cn("link-hint ml-0.5 h-3.5 w-0", pending && "w-3.5 is-pending", className)}
    >
      <Loader size={14} className="size-3.5" aria-hidden />
    </span>
  )
}
