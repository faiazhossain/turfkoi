"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"

import { useI18n } from "@/i18n/client"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { PositionPicker } from "@/components/player/choice-picker"
import { FIELD_POSITION_IDS } from "@/features/player/positions"
import { addMatchGuestAction } from "@/features/matches/actions"
import type { RecentGuestPick } from "@/features/matches/guests"

/**
 * Manual add for account-less players: name + position + optional jersey
 * number and phone. If the phone belongs to a registered user the server
 * refuses and they must be invited. Chips of players added to previous
 * matches prefill the whole form in one tap.
 */
export function GuestAddForm({
  matchId,
  recentGuests = [],
}: {
  matchId: string
  recentGuests?: RecentGuestPick[]
}) {
  const router = useRouter()
  const { t } = useI18n()
  const [pending, start] = useTransition()
  const [name, setName] = useState("")
  const [phone, setPhone] = useState("")
  const [position, setPosition] = useState("")
  const [jersey, setJersey] = useState("")

  const jerseyValid = jersey.trim() === "" || /^\d+$/.test(jersey.trim())

  function prefill(pick: RecentGuestPick) {
    setName(pick.name)
    setPhone(pick.phone ?? "")
    setPosition(pick.position ?? "")
    setJersey(pick.jerseyNumber != null ? String(pick.jerseyNumber) : "")
  }

  function add() {
    if (!name.trim() || !jerseyValid) return
    start(async () => {
      const res = await addMatchGuestAction({
        matchId,
        name,
        phone: phone.trim() || undefined,
        position: position || undefined,
        jerseyNumber:
          jersey.trim() === "" ? undefined : Number(jersey.trim()),
      })
      if (!res.ok) {
        toast.error(t(res.error ?? "errors.generic"))
        return
      }
      toast.success(t("matches.guest.added"))
      setName("")
      setPhone("")
      setPosition("")
      setJersey("")
      router.refresh()
    })
  }

  return (
    <div className="space-y-3 rounded-lg border border-dashed border-border p-3">
      <p className="text-sm font-medium">{t("matches.guest.addTitle")}</p>
      {recentGuests.length > 0 ? (
        <div className="space-y-1.5">
          <p className="text-xs text-muted-foreground">
            {t("matches.guest.recentTitle")}
          </p>
          <div className="flex flex-wrap gap-1.5">
            {recentGuests.map((pick) => (
              <button
                key={pick.phone ?? pick.name.toLowerCase()}
                type="button"
                onClick={() => prefill(pick)}
                aria-label={t("matches.guest.recentAria") + ": " + pick.name}
                className="rounded-full border border-border px-2.5 py-1 text-xs text-foreground/80 transition-colors hover:border-primary/50 hover:text-foreground"
              >
                {pick.jerseyNumber != null ? `#${pick.jerseyNumber} ` : ""}
                {pick.name}
              </button>
            ))}
          </div>
        </div>
      ) : null}
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
        <div className="space-y-1">
          <Label htmlFor="guest-jersey" className="text-xs">
            {t("matches.guest.jersey")}
          </Label>
          <Input
            id="guest-jersey"
            value={jersey}
            onChange={(e) => setJersey(e.target.value)}
            inputMode="numeric"
            type="number"
            min={0}
            max={99}
            aria-invalid={!jerseyValid}
            className="w-20"
          />
        </div>
        <Button
          size="sm"
          variant="outline"
          onClick={add}
          loading={pending}
          disabled={!name.trim() || !jerseyValid}
        >
          {t("matches.guest.add")}
        </Button>
      </div>
      <PositionPicker
        name="guest-position"
        ariaLabel={t("matches.guest.position")}
        value={position}
        onChange={setPosition}
        allowNone
        ids={FIELD_POSITION_IDS}
      />
    </div>
  )
}
