"use client"

import { Checkbox } from "@/components/ui/checkbox"
import { Label } from "@/components/ui/label"

export interface PickerMember {
  userId: string
  name: string | null
  phone: string
}

/**
 * Checkbox roster picker shared by the create-match wizard and the match
 * room's squad building. Pre-selected/locked ids (e.g. the organizer) render
 * checked and disabled.
 */
export function MemberPicker({
  members,
  selected,
  onToggle,
  lockedIds = [],
}: {
  members: PickerMember[]
  selected: string[]
  onToggle: (userId: string) => void
  lockedIds?: string[]
}) {
  return (
    <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border">
      {members.map((m) => {
        const locked = lockedIds.includes(m.userId)
        const checked = locked || selected.includes(m.userId)
        return (
          <li key={m.userId} className="flex items-center gap-3 bg-card p-2.5">
            <Checkbox
              id={`member-${m.userId}`}
              checked={checked}
              disabled={locked}
              onCheckedChange={() => onToggle(m.userId)}
            />
            <Label
              htmlFor={`member-${m.userId}`}
              className="flex-1 cursor-pointer text-sm font-normal"
            >
              {m.name ?? m.phone}
            </Label>
          </li>
        )
      })}
    </ul>
  )
}
