"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import type { z } from "zod"

import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { StatusBadge } from "@/components/shared"
import { ErpSheet } from "./erp-sheet"
import { useI18n } from "@/i18n/client"

import {
  recordSalaryPaymentAction,
  upsertSalaryRecordAction,
} from "@/features/erp/actions"
import {
  recordSalaryPaymentSchema,
  upsertSalaryRecordSchema,
  type RecordSalaryPaymentValues,
  type UpsertSalaryRecordValues,
} from "@/features/erp/schemas"

const METHODS = ["cash", "bkash", "nagad", "bank"] as const

/** Monthly salary components editor (base/allowance/overtime/bonus/…). */
export function SalaryAdjustSheet({
  staffId,
  staffName,
  month,
  baseAmount,
  baseSalary,
}: {
  staffId: string
  staffName: string
  month: string
  baseAmount: number
  baseSalary: number
}) {
  const router = useRouter()
  const { t } = useI18n()
  const [serverError, setServerError] = useState<string | null>(null)

  const form = useForm<
    z.input<typeof upsertSalaryRecordSchema>,
    unknown,
    UpsertSalaryRecordValues
  >({
    resolver: zodResolver(upsertSalaryRecordSchema),
    defaultValues: {
      staffId,
      periodMonth: month,
      baseAmount: baseAmount || baseSalary,
      allowance: 0,
      overtime: 0,
      bonus: 0,
      deduction: 0,
      advance: 0,
    },
  })

  const fields = [
    ["baseAmount", "erp.salaries.form.base"],
    ["allowance", "erp.salaries.form.allowance"],
    ["overtime", "erp.salaries.form.overtime"],
    ["bonus", "erp.salaries.form.bonus"],
    ["deduction", "erp.salaries.form.deduction"],
    ["advance", "erp.salaries.form.advance"],
  ] as const

  return (
    <ErpSheet
      triggerLabel={t("erp.salaries.editCta")}
      title={t("erp.salaries.editTitle", { name: staffName, month })}
      triggerVariant="ghost"
      triggerSize="xs"
    >
      {(close) => (
        <form
          onSubmit={form.handleSubmit(async (v) => {
            setServerError(null)
            const res = await upsertSalaryRecordAction(v)
            if (!res.ok) {
              setServerError(res.error)
              return
            }
            router.refresh()
            close()
          })}
          className="space-y-4"
        >
          <div className="grid grid-cols-2 gap-3">
            {fields.map(([name, key]) => (
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
          </div>

          {serverError ? <StatusBadge status="danger">{t(serverError)}</StatusBadge> : null}

          <Button type="submit" size="lg" loading={form.formState.isSubmitting} className="w-full">
            {t("erp.common.submit")}
          </Button>
        </form>
      )}
    </ErpSheet>
  )
}

/** Record a salary payment — auto-posts the expense server-side. */
export function SalaryPaySheet({
  staffId,
  staffName,
  month,
  remaining,
}: {
  staffId: string
  staffName: string
  month: string
  remaining: number
}) {
  const router = useRouter()
  const { t } = useI18n()
  const [serverError, setServerError] = useState<string | null>(null)

  const form = useForm<
    z.input<typeof recordSalaryPaymentSchema>,
    unknown,
    RecordSalaryPaymentValues
  >({
    resolver: zodResolver(recordSalaryPaymentSchema),
    defaultValues: {
      staffId,
      periodMonth: month,
      amount: Math.max(0, remaining),
      method: "cash",
      isAdvance: false,
    },
  })

  return (
    <ErpSheet
      triggerLabel={t("erp.salaries.payCta")}
      title={t("erp.salaries.payTitle", { name: staffName })}
      triggerVariant="default"
      triggerSize="xs"
    >
      {(close) => (
        <form
          onSubmit={form.handleSubmit(async (v) => {
            setServerError(null)
            const res = await recordSalaryPaymentAction(v)
            if (!res.ok) {
              setServerError(res.error)
              return
            }
            router.refresh()
            close()
          })}
          className="space-y-4"
        >
          <p className="text-sm text-dt-dim">
            {t("erp.salaries.payForm.amountRemaining", {
              amount: Math.max(0, remaining).toLocaleString(),
            })}
          </p>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-dt-dim">
                {t("erp.salaries.payForm.amount")}
              </Label>
              <Input
                type="number"
                inputMode="decimal"
                min={1}
                step="any"
                {...form.register("amount", { valueAsNumber: true })}
              />
              {form.formState.errors.amount?.message ? (
                <p className="text-xs text-destructive">
                  {t(form.formState.errors.amount.message)}
                </p>
              ) : null}
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-dt-dim">
                {t("erp.salaries.payForm.method")}
              </Label>
              <Select
                value={form.watch("method")}
                onValueChange={(v) =>
                  form.setValue("method", v as RecordSalaryPaymentValues["method"], {
                    shouldValidate: true,
                  })
                }
              >
                <SelectTrigger className="w-full">
                  <SelectValue>
                    {form.watch("method")
                      ? t(`erp.salaries.methods.${form.watch("method")}`)
                      : t("erp.salaries.payForm.method")}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {METHODS.map((m) => (
                    <SelectItem key={m} value={m}>
                      {t(`erp.salaries.methods.${m}`)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs font-medium text-dt-dim">
              {t("erp.salaries.payForm.reference")}
            </Label>
            <Input {...form.register("reference")} />
          </div>

          <label className="flex items-start gap-2.5 rounded-lg border border-dt-line p-3">
            <Checkbox
              checked={form.watch("isAdvance")}
              onCheckedChange={(v) => form.setValue("isAdvance", v === true)}
              className="mt-0.5"
            />
            <span>
              <span className="block text-sm font-medium">
                {t("erp.salaries.payForm.isAdvance")}
              </span>
              <span className="block text-xs text-dt-dim">
                {t("erp.salaries.payForm.isAdvanceHint")}
              </span>
            </span>
          </label>

          {serverError ? <StatusBadge status="danger">{t(serverError)}</StatusBadge> : null}

          <Button type="submit" size="lg" loading={form.formState.isSubmitting} className="w-full">
            {t("erp.common.submit")}
          </Button>
        </form>
      )}
    </ErpSheet>
  )
}
