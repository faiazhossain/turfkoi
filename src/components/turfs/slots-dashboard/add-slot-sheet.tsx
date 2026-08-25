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

/**
 * Bottom sheet for adding a one-off slot to a specific calendar date. The
 * date is prefilled (and hidden in the form); the sheet closes on success so
 * the new slot is immediately visible in the day grid behind it.
 */
export function AddSlotSheet({
  turfId,
  date,
  label = "Add one-off slot",
}: {
  turfId: string
  date: string
  label?: string
}) {
  const [open, setOpen] = useState(false)

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger
        render={
          <Button variant="outline" size="sm" className="w-full" />
        }
      >
        <PlusIcon aria-hidden />
        {label}
      </SheetTrigger>
      <SheetContent side="bottom" className="max-h-[85vh] overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Add a one-off slot</SheetTitle>
          <SheetDescription>
            A single slot for {date} that stays put even when weekly hours
            change. Overlapping slots are rejected.
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
