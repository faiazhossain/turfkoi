"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"

import { useI18n } from "@/i18n/client"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { addMatchGuestAction } from "@/features/matches/actions"

/**
 * Manual add for account-less players (name + optional phone). If the phone
 * belongs to a registered user the server refuses and they must be invited.
 */
export function GuestAddForm({ matchId }: { matchId: string }) {
  const router = useRouter()
  const { t } = useI18n()
  const [pending, start] = useTransition()
  const [name, setName] = useState("")
  const [phone, setPhone] = useState("")

  function add() {
    if (!name.trim()) return
    start(async () => {
      const res = await addMatchGuestAction({
        matchId,
        name,
        phone: phone || undefined,
      })
      if (!res.ok) {
        toast.error(t(res.error ?? "errors.generic"))
        return
      }
      toast.success(t("matches.guest.added"))
      setName("")
      setPhone("")
      router.refresh()
    })
  }

  return (
    <div className="space-y-2 rounded-lg border border-dashed border-border p-3">
      <p className="text-sm font-medium">{t("matches.guest.addTitle")}</p>
      <div className="flex flex-wrap items-end gap-2">
        <div className="space-y-1">
          <Label htmlFor="guest-name" className="text-xs">
            {t("matches.guest.name")}
          </Label>
          <Input
            id="guest-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={60}
            className="w-40"
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="guest-phone" className="text-xs">
            {t("matches.guest.phone")}
          </Label>
          <Input
            id="guest-phone"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            inputMode="tel"
            className="w-36"
          />
        </div>
        <Button size="sm" variant="outline" onClick={add} loading={pending} disabled={!name.trim()}>
          {t("matches.guest.add")}
        </Button>
      </div>
    </div>
  )
}
