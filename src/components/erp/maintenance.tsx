"use client"

import { useState, useTransition } from "react"
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

import {
  addMaintenanceAction,
  updateMaintenanceStatusAction,
} from "@/features/erp/actions"
import {
  addMaintenanceSchema,
  MAINTENANCE_CATEGORIES,
  type AddMaintenanceValues,
} from "@/features/erp/schemas"

export function AddMaintenanceSheet({
  turfs,
  today,
}: {
  turfs: { id: string; name: string }[]
  today: string
}) {
  const router = useRouter()
  const { t } = useI18n()
  const [serverError, setServerError] = useState<string | null>(null)

  const form = useForm<z.input<typeof addMaintenanceSchema>, unknown, AddMaintenanceValues>({
    resolver: zodResolver(addMaintenanceSchema),
    defaultValues: {
      turfId: turfs[0]?.id ?? "",
      date: today,
      category: "other",
      cost: 0,
      status: "done",
    },
  })

  return (
    <ErpSheet
      triggerLabel={t("erp.maintenance.addMaintenance")}
      title={t("erp.maintenance.addMaintenance")}
      triggerVariant="default"
    >
      {(close) => (
        <form
          onSubmit={form.handleSubmit(async (v) => {
            setServerError(null)
            const res = await addMaintenanceAction(v)
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
                {t("erp.maintenance.form.turf")}
              </Label>
              <Select
                value={form.watch("turfId")}
                onValueChange={(v) => form.setValue("turfId", v ?? "", { shouldValidate: true })}
              >
                <SelectTrigger className="w-full">
                  <SelectValue>
                    {turfs.find((tf) => tf.id === form.watch("turfId"))?.name ??
                      t("erp.maintenance.form.turf")}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {turfs.map((turf) => (
                    <SelectItem key={turf.id} value={turf.id}>
                      {turf.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-dt-dim">
                {t("erp.maintenance.form.date")}
              </Label>
              <Input type="date" {...form.register("date")} />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs font-medium text-dt-dim">
              {t("erp.maintenance.form.category")}
            </Label>
            <Select
              value={form.watch("category")}
              onValueChange={(v) =>
                form.setValue("category", v as AddMaintenanceValues["category"], {
                  shouldValidate: true,
                })
              }
            >
              <SelectTrigger className="w-full">
                <SelectValue>
                  {form.watch("category")
                    ? t(`erp.maintenance.categories.${form.watch("category")}`)
                    : t("erp.maintenance.form.category")}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {MAINTENANCE_CATEGORIES.map((c) => (
                  <SelectItem key={c} value={c}>
                    {t(`erp.maintenance.categories.${c}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs font-medium text-dt-dim">
              {t("erp.maintenance.form.description")}
            </Label>
            <Input placeholder={t("erp.maintenance.form.descriptionPh")} {...form.register("description")} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-dt-dim">
                {t("erp.maintenance.form.cost")}
              </Label>
              <Input
                type="number"
                inputMode="decimal"
                min={0}
                step="any"
                {...form.register("cost", { valueAsNumber: true })}
              />
              <p className="text-xs text-dt-dim">
                {t("erp.maintenance.form.costHint")}
              </p>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-dt-dim">
                {t("erp.maintenance.form.status")}
              </Label>
              <Select
                value={form.watch("status")}
                onValueChange={(v) =>
                  form.setValue("status", v as AddMaintenanceValues["status"], {
                    shouldValidate: true,
                  })
                }
              >
                <SelectTrigger className="w-full">
                  <SelectValue>
                    {form.watch("status")
                      ? t(`erp.maintenance.statuses.${form.watch("status")}`)
                      : t("erp.maintenance.form.status")}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {(["planned", "in_progress", "done"] as const).map((s) => (
                    <SelectItem key={s} value={s}>
                      {t(`erp.maintenance.statuses.${s}`)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs font-medium text-dt-dim">
              {t("erp.maintenance.form.vendor")}
            </Label>
            <Input {...form.register("vendor")} />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs font-medium text-dt-dim">
              {t("erp.maintenance.form.slotBlockedNote")}
            </Label>
            <Input {...form.register("slotBlockedNote")} />
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

export function MaintenanceStatusButtons({
  id,
  status,
}: {
  id: string
  status: string
}) {
  const router = useRouter()
  const { t } = useI18n()
  const [pending, startTransition] = useTransition()

  function set(next: "in_progress" | "done") {
    startTransition(async () => {
      const res = await updateMaintenanceStatusAction({ id, status: next })
      if (res.ok) router.refresh()
    })
  }

  if (status === "done") return null
  return (
    <span className="flex items-center gap-1">
      {status === "planned" ? (
        <Button variant="outline" size="xs" loading={pending} onClick={() => set("in_progress")}>
          {t("erp.maintenance.markInProgress")}
        </Button>
      ) : null}
      <Button variant="default" size="xs" loading={pending} onClick={() => set("done")}>
        {t("erp.maintenance.markDone")}
      </Button>
    </span>
  )
}
