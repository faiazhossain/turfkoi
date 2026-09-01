"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useI18n } from "@/i18n/client"
import { deleteTurfAction } from "@/features/admin/actions"

/**
 * Typed-confirmation delete for a booking-less turf. Typing the turf's
 * exact name arms the button — delete is the one irreversible click in the
 * admin panel. On success the cockpit no longer exists, so the client
 * moves back to the turf list.
 */
export function DeleteTurfControl({
  turfId,
  name,
}: {
  turfId: string
  name: string
}) {
  const router = useRouter()
  const { t } = useI18n()
  const [confirmName, setConfirmName] = useState("")
  const [pending, setPending] = useState(false)
  const armed = confirmName.trim() === name

  async function onDelete() {
    setPending(true)
    try {
      const res = await deleteTurfAction({ turfId })
      if (!res.ok) {
        toast.error(t(res.error ?? "errors.generic"))
        return
      }
      toast.success(t("admin.cockpit.deleted"))
      router.replace("/admin/turfs")
    } finally {
      setPending(false)
    }
  }

  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <Label htmlFor={`delete-turf-${turfId}`}>
          {t("admin.cockpit.typeToConfirm", { name })}
        </Label>
        <Input
          id={`delete-turf-${turfId}`}
          value={confirmName}
          onChange={(e) => setConfirmName(e.target.value)}
          placeholder={name}
          autoComplete="off"
          disabled={pending}
        />
      </div>
      <Button
        variant="destructive"
        onClick={onDelete}
        loading={pending}
        disabled={!armed}
      >
        {t("admin.cockpit.deleteTurf")}
      </Button>
      <p className="text-xs text-dt-dim">
        {t("admin.cockpit.deleteDesc")}
      </p>
    </div>
  )
}
