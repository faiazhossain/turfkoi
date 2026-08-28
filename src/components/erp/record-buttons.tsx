"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"

import { Button } from "@/components/ui/button"
import { useI18n } from "@/i18n/client"

import {
  deactivateRuleAction,
  deactivateStaffAction,
  markBillPaidAction,
  voidExpenseAction,
  voidOtherIncomeAction,
} from "@/features/erp/actions"

/**
 * Small mutation buttons shared across ERP pages. Each disables while
 * pending, confirms destructive intent, and refreshes server data on
 * success (CLAUDE.md loading-state rules).
 */
function useErpMutation(action: (id: string) => Promise<{ ok: boolean }>, confirmMsg?: string) {
  const router = useRouter()
  const { t } = useI18n()
  const [pending, startTransition] = useTransition()
  const [failed, setFailed] = useState(false)

  function run(id: string) {
    if (confirmMsg && !window.confirm(t(confirmMsg))) return
    startTransition(async () => {
      const res = await action(id)
      if (res.ok) router.refresh()
      else setFailed(true)
    })
  }

  return { run, pending, failed, t }
}

export function VoidExpenseButton({ id }: { id: string }) {
  const { run, pending, failed, t } = useErpMutation(
    voidExpenseAction,
    "erp.expenses.voidConfirm"
  )
  return (
    <Button
      variant="ghost"
      size="xs"
      loading={pending}
      onClick={() => run(id)}
      aria-label={t("erp.expenses.voidCta")}
    >
      {failed ? t("erp.errors.notFound") : t("erp.expenses.voidCta")}
    </Button>
  )
}

export function VoidIncomeButton({ id }: { id: string }) {
  const { run, pending, t } = useErpMutation(voidOtherIncomeAction)
  return (
    <Button variant="ghost" size="xs" loading={pending} onClick={() => run(id)}>
      {t("erp.expenses.voidCta")}
    </Button>
  )
}

export function MarkBillPaidButton({ id }: { id: string }) {
  const { run, pending, t } = useErpMutation(markBillPaidAction)
  return (
    <Button variant="default" size="xs" loading={pending} onClick={() => run(id)}>
      {t("erp.bills.markPaid")}
    </Button>
  )
}

export function DeactivateRuleButton({ id }: { id: string }) {
  const { run, pending, t } = useErpMutation(
    deactivateRuleAction,
    "erp.bills.deactivateConfirm"
  )
  return (
    <Button variant="ghost" size="xs" loading={pending} onClick={() => run(id)}>
      {t("erp.bills.deactivate")}
    </Button>
  )
}

export function DeactivateStaffButton({ id }: { id: string }) {
  const { run, pending, t } = useErpMutation(
    deactivateStaffAction,
    "erp.staff.deactivateConfirm"
  )
  return (
    <Button variant="ghost" size="xs" loading={pending} onClick={() => run(id)}>
      {t("erp.staff.deactivate")}
    </Button>
  )
}
