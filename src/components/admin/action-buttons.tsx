"use client"

import { useTransition } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import {
  verifyTurfAction,
  setUserStatusAction,
  setUserRoleAction,
  resolveMatchDisputeAction,
  updateReportStatusAction,
} from "@/features/admin/actions"
import { useI18n } from "@/i18n/client"
import type { reportStatus } from "@/db/schema"
import { userRoleLabel } from "@/i18n/labels"

type ReportStatus = (typeof reportStatus.enumValues)[number]

/** Verify a pending turf. */
export function VerifyTurfButton({ turfId }: { turfId: string }) {
  const router = useRouter()
  const { t } = useI18n()
  const [pending, start] = useTransition()
  function run() {
    start(async () => {
      const res = await verifyTurfAction({ turfId })
      if (!res.ok) { toast.error(t(res.error)); return }
      toast.success(t("admin.turfs.verifiedToast"))
      router.refresh()
    })
  }
  return (
    <Button size="sm" onClick={run} loading={pending}>
      {t("admin.turfs.verify")}
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
  const { t } = useI18n()
  const [pending, start] = useTransition()
  const next = status === "active" ? "suspended" : "active"
  function run() {
    start(async () => {
      const res = await setUserStatusAction({ userId, status: next })
      if (!res.ok) { toast.error(t(res.error)); return }
      toast.success(t(next === "suspended" ? "admin.users.userSuspendedToast" : "admin.users.userActivatedToast"))
      router.refresh()
    })
  }
  if (status === "deleted") {
    return <span className="text-xs text-muted-foreground">{t("admin.users.status.deleted")}</span>
  }
  return (
    <Button
      size="sm"
      variant={next === "suspended" ? "destructive" : "outline"}
      onClick={run}
      loading={pending}
    >
      {t(next === "suspended" ? "admin.users.suspend" : "admin.users.activate")}
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
  const { t } = useI18n()
  const [pending, start] = useTransition()
  function run() {
    start(async () => {
      const res = await setUserRoleAction({ userId, role, on: !enabled })
      if (!res.ok) { toast.error(t(res.error)); return }
      toast.success(
        t(!enabled ? "admin.users.roleGrantedToast" : "admin.users.roleRemovedToast", {
          role: t(userRoleLabel(role)),
        })
      )
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
      {t(userRoleLabel(role))}
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
  const { t } = useI18n()
  const [pending, start] = useTransition()

  function confirm() {
    start(async () => {
      const res = await resolveMatchDisputeAction({
        matchId,
        decision: "confirm",
        homeScore: homeScore ?? undefined,
        awayScore: awayScore ?? undefined,
      })
      if (!res.ok) { toast.error(t(res.error)); return }
      toast.success(t("admin.matches.resultConfirmedToast"))
      router.refresh()
    })
  }

  function scratch() {
    start(async () => {
      const res = await resolveMatchDisputeAction({ matchId, decision: "scratch" })
      if (!res.ok) { toast.error(t(res.error)); return }
      toast.success(t("admin.matches.scratchedToast"))
      router.refresh()
    })
  }

  return (
    <div className="flex items-center gap-1">
      <Button size="sm" onClick={confirm} loading={pending}>
        {t("admin.matches.confirmResult")}
      </Button>
      <Button size="sm" variant="destructive" onClick={scratch} loading={pending}>
        {t("admin.matches.scratch")}
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
  const { t } = useI18n()
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
      if (!res.ok) { toast.error(t(res.error)); return }
      toast.success(t("admin.reports.statusToast", { status: t(`admin.reports.status.${next[status]}`) }))
      router.refresh()
    })
  }
  return (
    <Button size="sm" variant="outline" onClick={run} loading={pending}>
      {t("admin.reports.nextLabel", { status: t(`admin.reports.status.${next[status]}`) })}
    </Button>
  )
}
