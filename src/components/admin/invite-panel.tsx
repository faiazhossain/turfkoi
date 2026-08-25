"use client"

import { useState } from "react"
import { toast } from "sonner"
import { CopyIcon, LinkIcon, MessageCircleIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { isValidPhone } from "@/features/auth/phone"
import { useI18n } from "@/i18n/client"

import { createClaimInviteAction } from "@/features/turf-claims/actions"

type CreatedInvite = {
  url: string
  expiresAt: Date
  emailed: boolean
  otp: string | null
  phone: string | null
  turfName: string
}

/**
 * Mint and deliver a turf-claim invite link. The plaintext link (and OTP,
 * when a WhatsApp phone is given) is shown exactly once — only hashes are
 * stored — with copy buttons for the link and a ready-to-send WhatsApp
 * message. A new invite invalidates any previous link for the turf.
 */
export function InvitePanel({
  turfId,
  defaultOpen = false,
  defaultEmail = "",
  defaultPhone = "",
}: {
  turfId: string
  defaultOpen?: boolean
  defaultEmail?: string
  defaultPhone?: string
}) {
  const { t } = useI18n()
  const [open, setOpen] = useState(defaultOpen)
  const [email, setEmail] = useState(defaultEmail)
  const [phone, setPhone] = useState(defaultPhone)
  const [phoneError, setPhoneError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  const [invite, setInvite] = useState<CreatedInvite | null>(null)

  function whatsappMessage(inv: CreatedInvite): string {
    const lines = [
      t("admin.invite.whatsappHi", { name: inv.turfName }),
      inv.url,
    ]
    if (inv.otp) {
      lines.push(t("admin.invite.whatsappCode", { code: inv.otp }))
      lines.push(t("admin.invite.whatsappExpires", { date: inv.expiresAt.toDateString() }))
    }
    lines.push(t("admin.invite.whatsappSignoff"))
    return lines.join("\n")
  }

  async function onCreate() {
    const trimmedPhone = phone.trim()
    if (!trimmedPhone) {
      setPhoneError(t("admin.invite.phoneRequired"))
      return
    }
    if (!isValidPhone(trimmedPhone)) {
      setPhoneError(t("auth.errors.phone_invalid"))
      return
    }
    setPhoneError(null)
    setPending(true)
    try {
      const res = await createClaimInviteAction({
        turfId,
        targetEmail: email.trim() ? email.trim() : undefined,
        targetPhone: trimmedPhone ? trimmedPhone : undefined,
      })
      if (!res.ok) {
        toast.error(t(res.error))
        return
      }
      setInvite({
        url: `${window.location.origin}${res.path}`,
        expiresAt: new Date(res.expiresAt),
        emailed: res.emailed,
        otp: res.otp,
        phone: res.phone,
        turfName: res.turfName,
      })
      setOpen(true)
      toast.success(
        t(res.emailed ? "admin.invite.inviteEmailedToast" : "admin.invite.inviteCreatedToast")
      )
    } finally {
      setPending(false)
    }
  }

  async function copyText(text: string, successMessage: string) {
    try {
      await navigator.clipboard.writeText(text)
      toast.success(successMessage)
    } catch {
      toast.error(t("admin.invite.copyFailToast"))
    }
  }

  if (!open) {
    return (
      <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
        {t("admin.invite.owner")}
      </Button>
    )
  }

  return (
    <div className="space-y-2 border-border bg-muted/40 p-3 rounded-lg w-full sm:w-96">
      {invite ? (
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <LinkIcon className="size-3.5" aria-hidden />
            <span>
              {t("admin.invite.expires", { date: invite.expiresAt.toDateString() })}
              {" · "}
              {t(invite.emailed ? "admin.invite.emailedSuffix" : "admin.invite.notEmailedSuffix")}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <Input
              readOnly
              value={invite.url}
              onFocus={(e) => e.currentTarget.select()}
              className="text-xs"
              aria-label={t("admin.invite.claimLinkAria")}
            />
            <Button
              size="sm"
              variant="outline"
              onClick={() =>
                copyText(
                  invite.url,
                  t("admin.invite.linkCopiedToast")
                )
              }
              aria-label={t("admin.invite.copyClaimLinkAria")}
            >
              <CopyIcon className="size-3.5" aria-hidden />
              {t("common.copy")}
            </Button>
          </div>
          {invite.otp ? (
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground">
                {t("admin.invite.otpEnabled", { phone: invite.phone ?? "" })}
              </p>
              <div className="flex items-center gap-2">
                <Input
                  readOnly
                  value={invite.otp}
                  onFocus={(e) => e.currentTarget.select()}
                  className="text-center text-sm tracking-[0.5em]"
                  aria-label={t("admin.invite.codeAria")}
                />
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    copyText(invite.otp ?? "", t("admin.invite.codeCopiedToast"))
                  }
                  aria-label={t("admin.invite.copyCodeAria")}
                >
                  <CopyIcon className="size-3.5" aria-hidden />
                  {t("common.copy")}
                </Button>
              </div>
              <div className="space-y-1.5">
                <div className="flex items-center justify-between gap-2">
                  <Label className="text-xs text-muted-foreground">
                    {t("admin.invite.whatsappLabel")}
                  </Label>
                  <Button
                    size="xs"
                    variant="outline"
                    onClick={() =>
                      copyText(
                        whatsappMessage(invite),
                        t("admin.invite.messageCopiedToast")
                      )
                    }
                  >
                    <MessageCircleIcon className="size-3.5" aria-hidden />
                    {t("admin.invite.copyMessage")}
                  </Button>
                </div>
                <Textarea
                  readOnly
                  rows={5}
                  value={whatsappMessage(invite)}
                  onFocus={(e) => e.currentTarget.select()}
                  className="text-xs"
                  aria-label={t("admin.invite.whatsappMessageAria")}
                />
              </div>
            </div>
          ) : null}
          <p className="text-xs text-muted-foreground">
            {t("admin.invite.shownOnce")}
          </p>
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">
          {t("admin.invite.singleUse")}
        </p>
      )}
      <div className="space-y-1.5">
        <Label htmlFor={`invite-email-${turfId}`} className="text-xs">
          {t("admin.invite.ownerEmail")}
        </Label>
        <div className="flex items-center gap-2">
          <Input
            id={`invite-email-${turfId}`}
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="owner@example.com"
            className="text-xs"
          />
        </div>
        <Label htmlFor={`invite-phone-${turfId}`} className="text-xs">
          {t("admin.invite.ownerPhone")}
        </Label>
        <div className="flex items-center gap-2">
          <Input
            id={`invite-phone-${turfId}`}
            inputMode="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="01XXXXXXXXX"
            className="text-xs"
            aria-invalid={!!phoneError}
            required
          />
          <Button size="sm" onClick={onCreate} loading={pending}>
            {t(invite ? "admin.invite.newLink" : "admin.invite.createLink")}
          </Button>
        </div>
        {phoneError ? (
          <p className="text-xs text-destructive">{phoneError}</p>
        ) : null}
      </div>
    </div>
  )
}
