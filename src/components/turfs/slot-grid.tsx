"use client"

import * as React from "react"
import { useState } from "react"
import { useRouter } from "next/navigation"
import { Trash2Icon } from "lucide-react"

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

import {
  deleteSlotAction,
  updateSlotAction,
} from "@/features/turfs/actions"

type SlotStatus =
  | "available"
  | "held"
  | "booked"
  | "maintenance"
  | "blocked"

interface Slot {
  date: string
  startTime: string
  durationMinutes: number
  status: SlotStatus
  price: string
}

interface SlotGridProps {
  turfId: string
  slots: Slot[]
}

const STATUS_BADGE: Record<SlotStatus, "success" | "warning" | "danger" | "neutral"> = {
  available: "success",
  held: "warning",
  booked: "danger",
  maintenance: "neutral",
  blocked: "neutral",
}

function fmtDate(iso: string) {
  const [y, m, d] = iso.split("-").map(Number)
  if (!y || !m || !d) return iso
  const date = new Date(y, m - 1, d)
  return date.toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  })
}

export function SlotGrid({ turfId, slots }: SlotGridProps) {
  const router = useRouter()
  const [busyKey, setBusyKey] = useState<string | null>(null)

  // Group by date
  const byDate = new Map<string, Slot[]>()
  for (const s of slots) {
    const arr = byDate.get(s.date) ?? []
    arr.push(s)
    byDate.set(s.date, arr)
  }

  async function changeStatus(slot: Slot, status: SlotStatus) {
    const key = `${slot.date}|${slot.startTime}`
    setBusyKey(key)
    try {
      const res = await updateSlotAction(turfId, slot.date, slot.startTime, {
        status,
      })
      if (!res.ok) alert(res.error)
      else router.refresh()
    } finally {
      setBusyKey(null)
    }
  }

  async function changePrice(slot: Slot, e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const form = new FormData(e.currentTarget)
    const val = Number(form.get("price"))
    if (!Number.isFinite(val) || val <= 0) return
    setBusyKey(`${slot.date}|${slot.startTime}`)
    try {
      const res = await updateSlotAction(turfId, slot.date, slot.startTime, {
        price: val,
      })
      if (!res.ok) alert(res.error)
      else router.refresh()
    } finally {
      setBusyKey(null)
    }
  }

  async function remove(slot: Slot) {
    if (!confirm("Delete this available slot?")) return
    setBusyKey(`${slot.date}|${slot.startTime}`)
    try {
      const res = await deleteSlotAction(turfId, slot.date, slot.startTime)
      if (!res.ok) alert(res.error)
      else router.refresh()
    } finally {
      setBusyKey(null)
    }
  }

  if (byDate.size === 0) {
    return (
      <p className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
        No slots in this range. Generate some above.
      </p>
    )
  }

  return (
    <div className="space-y-4">
      {Array.from(byDate.entries()).map(([date, daySlots]) => (
        <section key={date} className="space-y-2">
          <h4 className="font-heading text-sm font-semibold">{fmtDate(date)}</h4>
          <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border">
            {daySlots.map((slot) => {
              const key = `${slot.date}|${slot.startTime}`
              const isImmutable = slot.status === "booked" || slot.status === "held"
              return (
                <li
                  key={key}
                  className="flex flex-wrap items-center gap-2 bg-card p-3 text-sm"
                >
                  <div className="w-20 font-mono text-xs">
                    {slot.startTime}
                    <span className="ml-1 text-muted-foreground">
                      ({slot.durationMinutes}m)
                    </span>
                  </div>
                  <StatusBadge status={STATUS_BADGE[slot.status]}>
                    {slot.status}
                  </StatusBadge>
                  <form
                    onSubmit={changePrice.bind(null, slot)}
                    className="flex items-center gap-1"
                  >
                    <Label htmlFor={`price-${key}`} className="sr-only">
                      Price
                    </Label>
                    <Input
                      id={`price-${key}`}
                      name="price"
                      type="number"
                      min={1}
                      step="any"
                      defaultValue={Number(slot.price)}
                      className="w-24"
                      disabled={busyKey === key || isImmutable}
                    />
                    <Button
                      type="submit"
                      size="xs"
                      variant="ghost"
                      disabled={busyKey === key || isImmutable}
                    >
                      Save
                    </Button>
                  </form>
                  <div className="ml-auto flex items-center gap-2">
                    {!isImmutable ? (
                      <Select
                        value={slot.status}
                        onValueChange={(v) =>
                          changeStatus(slot, v as SlotStatus)
                        }
                        disabled={busyKey === key}
                      >
                        <SelectTrigger size="sm" className="w-32">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="available">Available</SelectItem>
                          <SelectItem value="maintenance">Maintenance</SelectItem>
                          <SelectItem value="blocked">Blocked</SelectItem>
                        </SelectContent>
                      </Select>
                    ) : null}
                    {!isImmutable ? (
                      <Button
                        type="button"
                        size="icon-sm"
                        variant="ghost"
                        aria-label="Delete slot"
                        onClick={() => remove(slot)}
                        disabled={busyKey === key}
                      >
                        <Trash2Icon aria-hidden />
                      </Button>
                    ) : null}
                  </div>
                </li>
              )
            })}
          </ul>
        </section>
      ))}
    </div>
  )
}
