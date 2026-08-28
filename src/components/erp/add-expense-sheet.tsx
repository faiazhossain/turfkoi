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

import { addExpenseAction } from "@/features/erp/actions"
import { addExpenseSchema, type AddExpenseValues } from "@/features/erp/schemas"

export function AddExpenseSheet({
  categories,
  today,
  canRepeat,
}: {
  categories: { id: string; label: string }[]
  today: string
  canRepeat: boolean
}) {
  const router = useRouter()
  const { t } = useI18n()
  const [serverError, setServerError] = useState<string | null>(null)

  const form = useForm<z.input<typeof addExpenseSchema>, unknown, AddExpenseValues>({
    resolver: zodResolver(addExpenseSchema),
    defaultValues: {
      amount: undefined as unknown as number,
      categoryId: categories[0]?.id ?? "",
      date: today,
      repeatMonthly: false,
    },
  })

  async function onSubmit(values: AddExpenseValues) {
    setServerError(null)
    const res = await addExpenseAction(values)
    if (!res.ok) {
      setServerError(res.error)
      return
    }
    router.refresh()
    form.reset({ amount: undefined as unknown as number, categoryId: categories[0]?.id ?? "", date: today, repeatMonthly: false })
    return true
  }

  const categoryId = form.watch("categoryId")
  const selectedCategory = categories.find((c) => c.id === categoryId)

  const err = form.formState.errors

  return (
    <ErpSheet triggerLabel={t("erp.expenses.addExpense")} title={t("erp.expenses.addExpense")}>
      {(close) => (
        <form
          onSubmit={form.handleSubmit(async (v) => {
            if (await onSubmit(v)) close()
          })}
          className="space-y-4"
        >
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-muted-foreground">
                {t("erp.expenses.form.amount")}
              </Label>
              <Input
                type="number"
                inputMode="decimal"
                min={1}
                step="any"
                {...form.register("amount", { valueAsNumber: true })}
              />
              {err.amount?.message ? (
                <p className="text-xs text-destructive">
                  {t(err.amount.message ?? "errors.invalid")}
                </p>
              ) : null}
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-muted-foreground">
                {t("erp.expenses.form.date")}
              </Label>
              <Input type="date" {...form.register("date")} />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs font-medium text-muted-foreground">
              {t("erp.expenses.form.category")}
            </Label>
            <Select
              value={form.watch("categoryId")}
              onValueChange={(v) => form.setValue("categoryId", v ?? "", { shouldValidate: true })}
            >
              <SelectTrigger className="w-full">
                <SelectValue>
                  {selectedCategory?.label ?? t("erp.expenses.form.category")}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {categories.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs font-medium text-muted-foreground">
              {t("erp.expenses.form.vendor")}
            </Label>
            <Input placeholder={t("erp.expenses.form.vendorPh")} {...form.register("vendor")} />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs font-medium text-muted-foreground">
              {t("erp.expenses.form.note")}
            </Label>
            <Input {...form.register("note")} />
          </div>

          {canRepeat ? (
            <label className="flex items-start gap-2.5 rounded-lg border border-border p-3">
              <Checkbox
                checked={form.watch("repeatMonthly")}
                onCheckedChange={(v) => form.setValue("repeatMonthly", v === true)}
                className="mt-0.5"
              />
              <span>
                <span className="block text-sm font-medium">
                  {t("erp.expenses.form.repeatMonthly")}
                </span>
                <span className="block text-xs text-muted-foreground">
                  {t("erp.expenses.form.repeatMonthlyHint")}
                </span>
              </span>
            </label>
          ) : null}

          {serverError ? <StatusBadge status="danger">{t(serverError)}</StatusBadge> : null}

          <Button type="submit" size="lg" loading={form.formState.isSubmitting} className="w-full">
            {t("erp.common.submit")}
          </Button>
        </form>
      )}
    </ErpSheet>
  )
}
