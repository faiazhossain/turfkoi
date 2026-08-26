"use client"

import { useState } from "react"
import { toast } from "sonner"
import { CopyIcon, MessageCircleIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"

import { mintOwnerLoginCodeAction } from "@/features/owner-login/actions"

type MintedCode = {
  code: string
  phone: string
  expiresAt: Date
  turfName: string
  passwordLocked: boolean
}

function whatsappMessage(c: MintedCode): string {
  return [
    `Hi! Your Turfkoi sign-in code for "${c.turfName}":`,
    c.code,
    `Sign in with your phone (${c.phone}) and this code. It expires ${c.expiresAt.toTimeString().slice(0, 5)} (${c.expiresAt.toDateString()}) and works once.`,
    "You'll set a new password right after. — Turfkoi team",
  ].join("\n")
}

/**
 * Mint a one-time WhatsApp sign-in code for this turf's owner (support
 * tool: forgot password / lockout). The code is shown exactly once — only
 * its hash is stored — with a ready-to-send WhatsApp message. Optional
 * password lock clears the owner's stored password so only the code works
 * until they set a new one. Minting again revokes the previous code.
 */
export function OwnerLoginCodePanel({
  turfId,
  ownerPhone,
}: {
  turfId: string
  ownerPhone: string
}) {
  const [lockPassword, setLockPassword] = useState(false)
  const [pending, setPending] = useState(false)
  const [minted, setMinted] = useState<MintedCode | null>(null)
  const [message, setMessage] = useState("")

  async function onMint() {
    setPending(true)
    try {
      const res = await mintOwnerLoginCodeAction({ turfId, lockPassword })
      if (!res.ok) {
        toast.error(res.error)
        return
      }
      const next: MintedCode = {
        code: res.code,
        phone: res.phone,
        expiresAt: new Date(res.expiresAt),
        turfName: res.turfName,
        passwordLocked: res.passwordLocked,
      }
      setMinted(next)
      setMessage(whatsappMessage(next))
    } finally {
      setPending(false)
    }
  }

  async function onCopy(value: string, what: string) {
    try {
      await navigator.clipboard.writeText(value)
      toast.success(`${what} copied.`)
    } catch {
      toast.error(`Couldn't copy the ${what.toLowerCase()}. Copy it manually.`)
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Button size="xs" onClick={onMint} loading={pending}>
          {minted ? "New code" : "Send sign-in code"}
        </Button>
        <Label className="flex items-center gap-1.5 text-xs font-normal">
          <Checkbox
            checked={lockPassword}
            onCheckedChange={(v) => setLockPassword(v === true)}
            disabled={pending}
          />
          Lock password login until reset
        </Label>
      </div>

      {minted ? (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Input
              readOnly
              value={minted.code}
              onFocus={(e) => e.currentTarget.select()}
              aria-label="One-time sign-in code"
              className="w-32 text-center font-medium tracking-[0.3em]"
            />
            <Button
              size="sm"
              variant="outline"
              onClick={() => onCopy(minted.code, "Code")}
            >
              <CopyIcon className="size-4" aria-hidden />
              Copy
            </Button>
          </div>
          <div className="space-y-1.5">
            <Label
              htmlFor={`owner-code-wa-${turfId}`}
              className="flex items-center gap-1.5"
            >
              <MessageCircleIcon className="size-4" aria-hidden />
              WhatsApp message
            </Label>
            <Textarea
              id={`owner-code-wa-${turfId}`}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={5}
              className="text-xs"
            />
            <Button
              size="xs"
              variant="outline"
              onClick={() => onCopy(message, "Message")}
            >
              <CopyIcon className="size-3.5" aria-hidden />
              Copy message
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Shown only once — expires {minted.expiresAt.toTimeString().slice(0, 5)} and works once.{" "}
            {minted.passwordLocked
              ? "Password login is locked until the owner sets a new password."
              : `Their current password keeps working for ${minted.phone}.`}
          </p>
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">
          One-time code for {ownerPhone}, valid 15 minutes. Relay it over
          WhatsApp; the owner sets a new password right after signing in.
        </p>
      )}
    </div>
  )
}
