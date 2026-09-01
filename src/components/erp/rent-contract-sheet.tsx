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
import { StatusBadge } from "@/components/shared"
import { ErpSheet } from "./erp-sheet"
import { useI18n } from "@/i18n/client"

import { upsertRentContractAction } from "@/features/erp/actions"
import { upsertRentSchema, type UpsertRentValues } from "@/features/erp/schemas"

export function RentContractSheet({
  existing,
}: {
  existing?: {
    monthlyAmount: number
    landlordName: string | null
    landlordPhone: string | null
    agreementStart: string | null
    agreementEnd: string | null
    securityDeposit: number
    note: string | null
  } | null
}) {
  const router = useRouter()
  const { t } = useI18n()
  const [serverError, setServerError] = useState<string | null>(null)

  const form = useForm<z.input<typeof upsertRentSchema>, unknown, UpsertRentValues>({
    resolver: zodResolver(upsertRentSchema),
    defaultValues: {
      monthlyAmount: existing?.monthlyAmount,
      landlordName: existing?.landlordName ?? "",
      landlordPhone: existing?.landlordPhone ?? "",
      agreementStart: existing?.agreementStart ?? undefined,
      agreementEnd: existing?.agreementEnd ?? undefined,
      securityDeposit: existing?.securityDeposit ?? 0,
      note: existing?.note ?? "",
      createMonthlyRule: !existing,
    },
  })

  return (
    <ErpSheet
      triggerLabel={
        existing ? t("erp.rent.editRent") : t("erp.rent.addRent")
      }
      title={existing ? t("erp.rent.editRent") : t("erp.rent.addRent")}
      triggerVariant={existing ? "outline" : "default"}
    >
      {(close) => (
        <form
          onSubmit={form.handleSubmit(async (v) => {
            setServerError(null)
            const res = await upsertRentContractAction(v)
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
              <Label className="text-xs font-medium text-dt-dim">
                {t("erp.rent.monthlyAmount")}
              </Label>
              <Input
                type="number"
                inputMode="decimal"
                min={1}
                step="any"
                {...form.register("monthlyAmount", { valueAsNumber: true })}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-dt-dim">
                {t("erp.rent.securityDeposit")}
              </Label>
              <Input
                type="number"
                inputMode="decimal"
                min={0}
                step="any"
                {...form.register("securityDeposit", { valueAsNumber: true })}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs font-medium text-dt-dim">
              {t("erp.rent.landlord")}
            </Label>
            <Input {...form.register("landlordName")} />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs font-medium text-dt-dim">
              {t("erp.rent.landlordPhone")}
            </Label>
            <Input type="tel" inputMode="tel" {...form.register("landlordPhone")} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-dt-dim">
                {t("erp.rent.agreementStart")}
              </Label>
              <Input type="date" {...form.register("agreementStart")} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-dt-dim">
                {t("erp.rent.agreementEnd")}
              </Label>
              <Input type="date" {...form.register("agreementEnd")} />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs font-medium text-dt-dim">
              {t("erp.rent.note")}
            </Label>
            <Input {...form.register("note")} />
          </div>

          {!existing ? (
            <label className="flex items-start gap-2.5 rounded-lg border border-dt-line p-3">
              <Checkbox
                checked={form.watch("createMonthlyRule")}
                onCheckedChange={(v) => form.setValue("createMonthlyRule", v === true)}
                className="mt-0.5"
              />
              <span className="text-sm font-medium">
                {t("erp.rent.createMonthlyRule")}
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
