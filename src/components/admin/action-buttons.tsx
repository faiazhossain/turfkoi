"use client"

import { useTransition } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import {
  verifyTurfAction,
  unverifyTurfAction,
  setTurfActiveAction,
  setUserStatusAction,
  setUserRoleAction,
  resolveMatchDisputeAction,
  updateReportStatusAction,
} from "@/features/admin/actions"
import type { reportStatus } from "@/db/schema"

type ReportStatus = (typeof reportStatus.enumValues)[number]

/** Verify a pending turf. */
export function VerifyTurfButton({ turfId }: { turfId: string }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  function run() {
    start(async () => {
      const res = await verifyTurfAction({ turfId })
      if (!res.ok) { toast.error(res.error); return }
      toast.success("Turf verified.")
      router.refresh()
    })
  }
  return (
    <Button size="sm" onClick={run} loading={pending}>
      Verify
    </Button>
  )
}

/** Pull a verified turf back to pending (misleading listing lever). */
export function UnverifyTurfButton({ turfId }: { turfId: string }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  function run() {
    start(async () => {
      const res = await unverifyTurfAction({ turfId })
      if (!res.ok) { toast.error(res.error); return }
      toast.success("Turf moved back to pending.")
      router.refresh()
    })
  }
  return (
    <Button size="xs" variant="destructive" onClick={run} loading={pending}>
      Unverify
    </Button>
  )
}

/** Toggle a turf's active status: deactivate hides it and stops bookings. */
export function TurfActiveToggle({
  turfId,
  isActive,
}: {
  turfId: string
  isActive: boolean
}) {
  const router = useRouter()
  const [pending, start] = useTransition()
  function run() {
    start(async () => {
      const res = await setTurfActiveAction({ turfId, isActive: !isActive })
      if (!res.ok) { toast.error(res.error); return }
      toast.success(isActive ? "Turf deactivated." : "Turf activated.")
      router.refresh()
    })
  }
  return (
    <Button
      size="xs"
      variant={isActive ? "secondary" : "outline"}
      onClick={run}
      loading={pending}
    >
      {isActive ? "Deactivate" : "Activate"}
    </Button>
  )
}

/** Toggle a user's active/suspended status. */
export function UserStatusToggle({
  userId,
  status,
}: {
  userId: string
  status: "active" | "suspended" | "deleted"
}) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const next = status === "active" ? "suspended" : "active"
  function run() {
    start(async () => {
      const res = await setUserStatusAction({ userId, status: next })
      if (!res.ok) { toast.error(res.error); return }
      toast.success(`User ${next}.`)
      router.refresh()
    })
  }
  if (status === "deleted") {
    return <span className="text-xs text-muted-foreground">deleted</span>
  }
  return (
    <Button
      size="sm"
      variant={next === "suspended" ? "destructive" : "outline"}
      onClick={run}
      loading={pending}
    >
      {next === "suspended" ? "Suspend" : "Activate"}
    </Button>
  )
}

/** Toggle a single role on/off for a user. */
export function RoleToggle({
  userId,
  role,
  enabled,
}: {
  userId: string
  role: "admin" | "turf_owner" | "team_owner" | "player"
  enabled: boolean
}) {
  const router = useRouter()
  const [pending, start] = useTransition()
  function run() {
    start(async () => {
      const res = await setUserRoleAction({ userId, role, on: !enabled })
      if (!res.ok) { toast.error(res.error); return }
      toast.success(`${role} ${!enabled ? "granted" : "removed"}.`)
      router.refresh()
    })
  }
  return (
    <Button
      size="xs"
      variant={enabled ? "secondary" : "outline"}
      onClick={run}
      loading={pending}
      aria-pressed={enabled}
    >
      {role.replace("_", " ")}
    </Button>
  )
}

/** Resolve a disputed match: confirm (optionally override score) or scratch. */
export function ResolveDisputeButtons({
  matchId,
  homeScore,
  awayScore,
}: {
  matchId: string
  homeScore: number | null
  awayScore: number | null
}) {
  const router = useRouter()
  const [pending, start] = useTransition()

  function confirm() {
    start(async () => {
      const res = await resolveMatchDisputeAction({
        matchId,
        decision: "confirm",
        homeScore: homeScore ?? undefined,
        awayScore: awayScore ?? undefined,
      })
      if (!res.ok) { toast.error(res.error); return }
      toast.success("Result confirmed.")
      router.refresh()
    })
  }

  function scratch() {
    start(async () => {
      const res = await resolveMatchDisputeAction({ matchId, decision: "scratch" })
      if (!res.ok) { toast.error(res.error); return }
      toast.success("Match scratched (cancelled).")
      router.refresh()
    })
  }

  return (
    <div className="flex items-center gap-1">
      <Button size="sm" onClick={confirm} loading={pending}>
        Confirm result
      </Button>
      <Button size="sm" variant="destructive" onClick={scratch} loading={pending}>
        Scratch
      </Button>
    </div>
  )
}

/** Cycle a report through its status workflow. */
export function ReportStatusSelect({
  reportId,
  status,
}: {
  reportId: string
  status: ReportStatus
}) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const next: Record<ReportStatus, ReportStatus> = {
    pending: "reviewing",
    reviewing: "resolved",
    resolved: "dismissed",
    dismissed: "pending",
  }
  function run() {
    start(async () => {
      const res = await updateReportStatusAction({
        reportId,
        status: next[status],
      })
      if (!res.ok) { toast.error(res.error); return }
      toast.success(`Report → ${next[status]}.`)
      router.refresh()
    })
  }
  return (
    <Button size="sm" variant="outline" onClick={run} loading={pending}>
      → {next[status]}
    </Button>
  )
}
