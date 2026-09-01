"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import type { z } from "zod"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { StatusBadge } from "@/components/shared"
import { ErpSheet } from "./erp-sheet"
import { useI18n } from "@/i18n/client"

import { upsertBudgetAction } from "@/features/erp/actions"
import { upsertBudgetSchema, type UpsertBudgetValues } from "@/features/erp/schemas"

export function BudgetSheet({
  month,
  existing,
}: {
  month: string
  existing: { revenueTarget: number; expenseBudget: number; profitTarget: number } | null
}) {
  const router = useRouter()
  const { t } = useI18n()
  const [serverError, setServerError] = useState<string | null>(null)

  const form = useForm<z.input<typeof upsertBudgetSchema>, unknown, UpsertBudgetValues>({
    resolver: zodResolver(upsertBudgetSchema),
    defaultValues: {
      periodMonth: month,
      revenueTarget: existing?.revenueTarget ?? 0,
      expenseBudget: existing?.expenseBudget ?? 0,
      profitTarget: existing?.profitTarget ?? 0,
    },
  })

  return (
    <ErpSheet
      triggerLabel={t("erp.goals.setTargets")}
      title={t("erp.goals.setTargetsTitle")}
    >
      {(close) => (
        <form
          onSubmit={form.handleSubmit(async (v) => {
            setServerError(null)
            const res = await upsertBudgetAction(v)
            if (!res.ok) {
              setServerError(res.error)
              return
            }
            router.refresh()
            close()
          })}
          className="space-y-4"
        >
          {(
            [
              ["revenueTarget", "erp.goals.form.revenueTarget"],
              ["expenseBudget", "erp.goals.form.expenseBudget"],
              ["profitTarget", "erp.goals.form.profitTarget"],
            ] as const
          ).map(([name, key]) => (
            <div key={name} className="space-y-1.5">
              <Label className="text-xs font-medium text-dt-dim">
                {t(key)}
              </Label>
              <Input
                type="number"
                inputMode="decimal"
                min={0}
                step="any"
                {...form.register(name, { valueAsNumber: true })}
              />
            </div>
          ))}

          {serverError ? <StatusBadge status="danger">{t(serverError)}</StatusBadge> : null}

          <Button type="submit" size="lg" loading={form.formState.isSubmitting} className="w-full">
            {t("erp.common.submit")}
          </Button>
        </form>
      )}
    </ErpSheet>
  )
}
