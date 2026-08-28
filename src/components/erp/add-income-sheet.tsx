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

import { addOtherIncomeAction } from "@/features/erp/actions"
import {
  addOtherIncomeSchema,
  type AddOtherIncomeValues,
} from "@/features/erp/schemas"

const SOURCES = ["gate", "tournament", "other"] as const

export function AddIncomeSheet({ today }: { today: string }) {
  const router = useRouter()
  const { t } = useI18n()
  const [serverError, setServerError] = useState<string | null>(null)

  const form = useForm<z.input<typeof addOtherIncomeSchema>, unknown, AddOtherIncomeValues>({
    resolver: zodResolver(addOtherIncomeSchema),
    defaultValues: {
      amount: undefined as unknown as number,
      date: today,
      source: "gate",
    },
  })

  return (
    <ErpSheet triggerLabel={t("erp.income.addIncome")} title={t("erp.income.addIncome")}>
      {(close) => (
        <form
          onSubmit={form.handleSubmit(async (v) => {
            setServerError(null)
            const res = await addOtherIncomeAction(v)
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
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-muted-foreground">
                {t("erp.income.form.amount")}
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
              <Label className="text-xs font-medium text-muted-foreground">
                {t("erp.income.form.date")}
              </Label>
              <Input type="date" {...form.register("date")} />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs font-medium text-muted-foreground">
              {t("erp.income.form.source")}
            </Label>
            <Select
              value={form.watch("source")}
              onValueChange={(v) =>
                form.setValue("source", v as AddOtherIncomeValues["source"], {
                  shouldValidate: true,
                })
              }
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SOURCES.map((s) => (
                  <SelectItem key={s} value={s}>
                    {t(`erp.income.sources.${s}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs font-medium text-muted-foreground">
              {t("erp.income.form.note")}
            </Label>
            <Input placeholder={t("erp.income.form.notePh")} {...form.register("note")} />
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
