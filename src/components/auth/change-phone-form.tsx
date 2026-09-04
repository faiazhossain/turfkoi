"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { StatusBadge } from "@/components/shared"
import { useI18n } from "@/i18n/client"
import {
  startPhoneChangeAction,
  verifyPhoneChangeAction,
} from "@/features/auth/actions"

/**
 * Two-step inline flow (same UX shape as the danger-zone confirm): enter the
 * new phone, receive an OTP over the verified email, then verify to move the
 * login identifier.
 */
export function ChangePhoneForm() {
  const router = useRouter()
  const { t } = useI18n()
  const [step, setStep] = useState<"phone" | "code">("phone")
  const [phone, setPhone] = useState("")
  const [code, setCode] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [sending, setSending] = useState(false)
  const [verifying, setVerifying] = useState(false)

  async function sendCode() {
    setError(null)
    setSending(true)
    try {
      const res = await startPhoneChangeAction()
      if (res.ok) {
        toast.success(t("settings.codeSentToast"))
        setStep("code")
        return
      }
      setError(t(res.reason ?? "errors.generic"))
    } finally {
      setSending(false)
    }
  }

  async function verify() {
    setError(null)
    setVerifying(true)
    try {
      const res = await verifyPhoneChangeAction(phone, code)
      if (res.ok) {
        toast.success(t("settings.phoneChangeSuccess"))
        setStep("phone")
        setPhone("")
        setCode("")
        router.refresh()
        return
      }
      setError(t(res.reason ?? "errors.generic"))
    } finally {
      setVerifying(false)
    }
  }

  return (
    <div className="space-y-3">
      {step === "phone" ? (
        <>
          <div className="space-y-2">
            <Label htmlFor="newPhone">{t("auth.phoneLabel")}</Label>
            <Input
              id="newPhone"
              inputMode="tel"
              autoComplete="tel"
              placeholder="01XXXXXXXXX"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
            />
          </div>
          {error && <StatusBadge status="danger">{error}</StatusBadge>}
          <Button onClick={sendCode} disabled={!phone.trim()} loading={sending}>
            {t("settings.changePhoneButton")}
          </Button>
        </>
      ) : (
        <>
          <div className="space-y-2">
            <Label htmlFor="phoneChangeCode">{t("auth.codeLabel")}</Label>
            <Input
              id="phoneChangeCode"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              placeholder="000000"
              className="text-center text-lg tracking-[0.5em]"
              value={code}
              onChange={(e) => setCode(e.target.value)}
            />
          </div>
          {error && <StatusBadge status="danger">{error}</StatusBadge>}
          <div className="flex items-center gap-1">
            <Button onClick={verify} disabled={!code.trim()} loading={verifying}>
              {t("settings.verifyPhoneButton")}
            </Button>
            <Button
              variant="ghost"
              onClick={() => {
                setStep("phone")
                setError(null)
              }}
              disabled={verifying}
            >
              {t("common.cancel")}
            </Button>
          </div>
        </>
      )}
    </div>
  )
}
