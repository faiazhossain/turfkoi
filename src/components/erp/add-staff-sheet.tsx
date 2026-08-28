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

import { addStaffAction } from "@/features/erp/actions"
import { addStaffSchema, type AddStaffValues } from "@/features/erp/schemas"

const POSITIONS = [
  "manager",
  "receptionist",
  "ground_staff",
  "cleaner",
  "security",
  "maintenance",
  "accountant",
  "coach",
  "other",
] as const
const SALARY_TYPES = ["monthly", "daily", "hourly", "commission"] as const

export function AddStaffSheet() {
  const router = useRouter()
  const { t } = useI18n()
  const [serverError, setServerError] = useState<string | null>(null)

  const form = useForm<z.input<typeof addStaffSchema>, unknown, AddStaffValues>({
    resolver: zodResolver(addStaffSchema),
    defaultValues: {
      name: "",
      position: "ground_staff",
      salaryType: "monthly",
      baseSalary: 0,
    },
  })

  const position = form.watch("position")

  return (
    <ErpSheet triggerLabel={t("erp.staff.addStaff")} title={t("erp.staff.addStaff")}>
      {(close) => (
        <form
          onSubmit={form.handleSubmit(async (v) => {
            setServerError(null)
            const res = await addStaffAction(v)
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
                {t("erp.staff.form.name")}
              </Label>
              <Input placeholder={t("erp.staff.form.namePh")} {...form.register("name")} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-muted-foreground">
                {t("erp.staff.form.phone")}
              </Label>
              <Input type="tel" inputMode="tel" {...form.register("phone")} />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs font-medium text-muted-foreground">
              {t("erp.staff.form.position")}
            </Label>
            <Select
              value={position}
              onValueChange={(v) =>
                form.setValue("position", v as AddStaffValues["position"], {
                  shouldValidate: true,
                })
              }
            >
              <SelectTrigger className="w-full">
                <SelectValue>
                  {position ? t(`erp.staff.positions.${position}`) : t("erp.staff.form.position")}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {POSITIONS.map((p) => (
                  <SelectItem key={p} value={p}>
                    {t(`erp.staff.positions.${p}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {position === "other" ? <Input {...form.register("positionOther")} /> : null}

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-muted-foreground">
                {t("erp.staff.form.salaryType")}
              </Label>
              <Select
                value={form.watch("salaryType")}
                onValueChange={(v) =>
                  form.setValue("salaryType", v as AddStaffValues["salaryType"], {
                    shouldValidate: true,
                  })
                }
              >
                <SelectTrigger className="w-full">
                  <SelectValue>
                    {form.watch("salaryType")
                      ? t(`erp.staff.salaryTypes.${form.watch("salaryType")}`)
                      : t("erp.staff.form.salaryType")}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {SALARY_TYPES.map((s) => (
                    <SelectItem key={s} value={s}>
                      {t(`erp.staff.salaryTypes.${s}`)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-muted-foreground">
                {t("erp.staff.form.baseSalary")}
              </Label>
              <Input
                type="number"
                inputMode="decimal"
                min={0}
                step="any"
                {...form.register("baseSalary", { valueAsNumber: true })}
              />
              <p className="text-xs text-muted-foreground">
                {t("erp.staff.form.baseSalaryHint")}
              </p>
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
