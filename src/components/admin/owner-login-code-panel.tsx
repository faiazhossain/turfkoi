"use client"

import { useState } from "react"
import { toast } from "sonner"
import { CopyIcon, MessageCircleIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { useI18n } from "@/i18n/client"

import { mintOwnerLoginCodeAction } from "@/features/owner-login/actions"

type MintedCode = {
  code: string
  phone: string
  expiresAt: Date
  turfName: string
  passwordLocked: boolean
}

function whatsappMessage(c: MintedCode, t: ReturnType<typeof useI18n>["t"]): string {
  return [
    t("admin.ownerCode.waLine1", { name: c.turfName }),
    c.code,
    t("admin.ownerCode.waLine2", {
      phone: c.phone,
      time: c.expiresAt.toTimeString().slice(0, 5),
      date: c.expiresAt.toDateString(),
    }),
    t("admin.ownerCode.waLine3"),
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
  const { t } = useI18n()
  const [lockPassword, setLockPassword] = useState(false)
  const [pending, setPending] = useState(false)
  const [minted, setMinted] = useState<MintedCode | null>(null)
  const [message, setMessage] = useState("")

  async function onMint() {
    setPending(true)
    try {
      const res = await mintOwnerLoginCodeAction({ turfId, lockPassword })
      if (!res.ok) {
        toast.error(t(res.error ?? "errors.generic"))
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
      setMessage(whatsappMessage(next, t))
    } finally {
      setPending(false)
    }
  }

  async function onCopy(value: string) {
    try {
      await navigator.clipboard.writeText(value)
      toast.success(t("admin.ownerCode.copied"))
    } catch {
      toast.error(t("admin.ownerCode.copyFailed"))
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Button size="xs" onClick={onMint} loading={pending}>
          {minted
            ? t("admin.ownerCode.newCode")
            : t("admin.ownerCode.sendCode")}
        </Button>
        <Label className="flex items-center gap-1.5 text-xs font-normal">
          <Checkbox
            checked={lockPassword}
            onCheckedChange={(v) => setLockPassword(v === true)}
            disabled={pending}
          />
          {t("admin.ownerCode.lockPassword")}
        </Label>
      </div>

      {minted ? (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Input
              readOnly
              value={minted.code}
              onFocus={(e) => e.currentTarget.select()}
              aria-label={t("admin.ownerCode.codeAria")}
              className="w-32 text-center font-medium tracking-[0.3em]"
            />
            <Button
              size="sm"
              variant="outline"
              onClick={() => onCopy(minted.code)}
            >
              <CopyIcon className="size-4" aria-hidden />
              {t("admin.ownerCode.copy")}
            </Button>
          </div>
          <div className="space-y-1.5">
            <Label
              htmlFor={`owner-code-wa-${turfId}`}
              className="flex items-center gap-1.5"
            >
              <MessageCircleIcon className="size-4" aria-hidden />
              {t("admin.ownerCode.whatsappMessage")}
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
              onClick={() => onCopy(message)}
            >
              <CopyIcon className="size-3.5" aria-hidden />
              {t("admin.ownerCode.copyMessage")}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            {minted.passwordLocked
              ? t("admin.ownerCode.passwordLocked")
              : t("admin.ownerCode.passwordStillWorks", { phone: minted.phone })}
          </p>
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">
          {t("admin.ownerCode.hint", { phone: ownerPhone })}
        </p>
      )}
    </div>
  )
}
