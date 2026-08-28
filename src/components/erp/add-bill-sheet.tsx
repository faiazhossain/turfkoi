"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import type { z } from "zod"

import { Button } from "@/components/ui/button"
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

import { createRuleAction } from "@/features/erp/actions"
import { createRuleSchema, type CreateRuleValues } from "@/features/erp/schemas"

const FREQUENCIES = ["monthly", "quarterly", "yearly"] as const

export function AddBillSheet({
  categories,
  today,
}: {
  categories: { id: string; label: string }[]
  today: string
}) {
  const router = useRouter()
  const { t } = useI18n()
  const [serverError, setServerError] = useState<string | null>(null)

  const form = useForm<z.input<typeof createRuleSchema>, unknown, CreateRuleValues>({
    resolver: zodResolver(createRuleSchema),
    defaultValues: {
      name: "",
      categoryId: categories[0]?.id ?? "",
      amount: undefined as unknown as number,
      frequency: "monthly",
      nextDueDate: today,
    },
  })
  const selectedCategory = categories.find((c) => c.id === form.watch("categoryId"))
  const frequency = form.watch("frequency")

  return (
    <ErpSheet triggerLabel={t("erp.bills.addBill")} title={t("erp.bills.addBill")}>
      {(close) => (
        <form
          onSubmit={form.handleSubmit(async (v) => {
            setServerError(null)
            const res = await createRuleAction(v)
            if (!res.ok) {
              setServerError(res.error)
              return
            }
            router.refresh()
            close()
          })}
          className="space-y-4"
        >
          <div className="space-y-1.5">
            <Label className="text-xs font-medium text-muted-foreground">
              {t("erp.bills.form.name")}
            </Label>
            <Input placeholder={t("erp.bills.form.namePh")} {...form.register("name")} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-muted-foreground">
                {t("erp.bills.form.amount")}
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
                  {t(form.formState.errors.amount.message ?? "errors.invalid")}
                </p>
              ) : null}
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-muted-foreground">
                {t("erp.bills.form.frequency")}
              </Label>
              <Select
                value={form.watch("frequency")}
                onValueChange={(v) =>
                  form.setValue("frequency", v as CreateRuleValues["frequency"], {
                    shouldValidate: true,
                  })
                }
              >
                <SelectTrigger className="w-full">
                  <SelectValue>
                    {frequency ? t(`erp.bills.frequencies.${frequency}`) : ""}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {FREQUENCIES.map((f) => (
                    <SelectItem key={f} value={f}>
                      {t(`erp.bills.frequencies.${f}`)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-muted-foreground">
                {t("erp.bills.form.category")}
              </Label>
              <Select
                value={form.watch("categoryId")}
                onValueChange={(v) => form.setValue("categoryId", v ?? "", { shouldValidate: true })}
              >
                <SelectTrigger className="w-full">
                  <SelectValue>
                    {selectedCategory?.label ?? t("erp.bills.form.category")}
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
                {t("erp.bills.form.nextDueDate")}
              </Label>
              <Input type="date" {...form.register("nextDueDate")} />
            </div>
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
