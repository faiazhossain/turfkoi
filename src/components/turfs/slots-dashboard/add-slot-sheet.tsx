"use client"

import { useState } from "react"
import { PlusIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet"
import { AddSlotForm } from "@/components/turfs/add-slot-form"
import { useI18n } from "@/i18n/client"

/**
 * Bottom sheet for adding a one-off slot to a specific calendar date. The
 * date is prefilled (and hidden in the form); the sheet closes on success so
 * the new slot is immediately visible in the day grid behind it.
 */
export function AddSlotSheet({
  turfId,
  date,
}: {
  turfId: string
  date: string
}) {
  const { t } = useI18n()
  const [open, setOpen] = useState(false)

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger
        render={
          <Button variant="outline" size="sm" className="w-full" />
        }
      >
        <PlusIcon aria-hidden />
        {t("turfOwner.schedule.addOneOffSlot")}
      </SheetTrigger>
      <SheetContent side="bottom" className="max-h-[85vh] overflow-y-auto">
        <SheetHeader>
          <SheetTitle>{t("turfOwner.schedule.addOneOffTitle")}</SheetTitle>
          <SheetDescription>
            {t("turfOwner.schedule.addOneOffDesc", { date })}
          </SheetDescription>
        </SheetHeader>
        <div className="px-4 pb-6">
          <AddSlotForm
            key={date}
            turfId={turfId}
            defaultDate={date}
            onSuccess={() => setOpen(false)}
          />
        </div>
      </SheetContent>
    </Sheet>
  )
}
