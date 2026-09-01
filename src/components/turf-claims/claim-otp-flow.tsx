"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { CopyIcon } from "lucide-react"
import { toast } from "sonner"

import { useI18n } from "@/i18n/client"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { StatusBadge } from "@/components/shared"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"

import {
  claimOtpLoginAction,
  claimTurfAction,
  setClaimPasswordAction,
  skipClaimPasswordAction,
} from "@/features/turf-claims/actions"

/**
 * WhatsApp OTP first-login for a claim link: enter the 6-digit code from the
 * admin's message → signed in → set (or skip) a password → the turf claims
 * automatically and the owner lands on their dashboard.
 */
export function ClaimOtpFlow({
  token,
  maskedPhone,
}: {
  token: string
  maskedPhone: string
}) {
  const router = useRouter()
  const { t } = useI18n()
  const [code, setCode] = useState("")
  const [verifying, setVerifying] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Modal state
  const [modalOpen, setModalOpen] = useState(false)
  const [password, setPassword] = useState("")
  const [confirm, setConfirm] = useState("")
  const [saving, setSaving] = useState(false)
  const [skipping, setSkipping] = useState(false)
  const [modalError, setModalError] = useState<string | null>(null)

  // Skipped: the generated password is shown exactly once.
  const [generated, setGenerated] = useState<string | null>(null)
  const [claiming, setClaiming] = useState(false)

  async function onVerify() {
    setError(null)
    setVerifying(true)
    try {
      const res = await claimOtpLoginAction(token, code)
      if (!res.ok) {
        setError(t(res.error ?? "errors.generic"))
        return
      }
      setModalOpen(true)
    } finally {
      setVerifying(false)
    }
  }

  async function onSavePassword() {
    setModalError(null)
    if (password !== confirm) {
      setModalError(t("auth.passwordsNoMatch"))
      return
    }
    setSaving(true)
    try {
      const res = await setClaimPasswordAction(password)
      if (!res.ok) {
        setModalError(t(res.error ?? "errors.generic"))
        return
      }
      await claimAndGo()
    } finally {
      setSaving(false)
    }
  }

  async function onSkip() {
    setModalError(null)
    setSkipping(true)
    try {
      const res = await skipClaimPasswordAction()
      if (!res.ok) {
        setModalError(t(res.error ?? "errors.generic"))
        return
      }
      setGenerated(res.password)
    } finally {
      setSkipping(false)
    }
  }

  async function claimAndGo() {
    setClaiming(true)
    try {
      const res = await claimTurfAction(token)
      if (!res.ok) {
        toast.error(t(res.error ?? "errors.generic"))
        setClaiming(false)
        setModalOpen(false)
        return
      }
      router.replace(`/turf-owner/turfs/${res.id}`)
    } catch {
      setClaiming(false)
    }
  }

  async function onCopyGenerated() {
    if (!generated) return
    try {
      await navigator.clipboard.writeText(generated)
      toast.success(t("claim.copiedToast"))
    } catch {
      toast.error(t("claim.copyFailToast"))
    }
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-dt-dim">
        {t("claim.otpSentTo", { phone: maskedPhone })}
      </p>
      <form
        onSubmit={(e) => {
          e.preventDefault()
          if (!verifying) onVerify()
        }}
        className="space-y-3"
      >
        <div className="space-y-2">
          <Label htmlFor="claim-otp">{t("claim.codeLabel")}</Label>
          <Input
            id="claim-otp"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            placeholder="000000"
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
            className="text-center text-lg tracking-[0.5em]"
          />
        </div>
        {error ? <StatusBadge status="danger">{error}</StatusBadge> : null}
        <Button type="submit" size="lg" className="w-full" loading={verifying}>
          {verifying ? t("claim.verifying") : t("claim.verify")}
        </Button>
      </form>

      <Dialog open={modalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {generated ? t("claim.yourPasswordTitle") : t("claim.setPasswordTitle")}
            </DialogTitle>
            <DialogDescription>
              {generated ? t("claim.passwordGeneratedDesc") : t("claim.passwordChooseDesc")}
            </DialogDescription>
          </DialogHeader>

          {generated ? (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Input
                  readOnly
                  value={generated}
                  onFocus={(e) => e.currentTarget.select()}
                  aria-label={t("claim.generatedAria")}
                />
                <Button
                  variant="outline"
                  onClick={onCopyGenerated}
                  aria-label={t("claim.copyAria")}
                >
                  <CopyIcon className="size-4" aria-hidden />
                  {t("common.copy")}
                </Button>
              </div>
              <p className="text-xs text-dt-dim">
                {t("claim.shownOnce", { phone: maskedPhone })}
              </p>
              {modalError ? (
                <StatusBadge status="danger">{modalError}</StatusBadge>
              ) : null}
            </div>
          ) : (
            <div className="space-y-3">
              <div className="space-y-2">
                <Label htmlFor="claim-password">{t("auth.newPassword")}</Label>
                <Input
                  id="claim-password"
                  type="password"
                  autoComplete="new-password"
                  placeholder={t("auth.passwordPlaceholder")}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="claim-confirm">{t("auth.confirmPassword")}</Label>
                <Input
                  id="claim-confirm"
                  type="password"
                  autoComplete="new-password"
                  placeholder={t("claim.confirmPlaceholder")}
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                />
              </div>
              {modalError ? (
                <StatusBadge status="danger">{modalError}</StatusBadge>
              ) : null}
            </div>
          )}

          <DialogFooter>
            {generated ? (
              <Button loading={claiming} onClick={claimAndGo}>
                {claiming ? t("claim.claimingYourTurf") : t("common.continue")}
              </Button>
            ) : (
              <>
                <Button
                  variant="ghost"
                  onClick={onSkip}
                  loading={skipping}
                  disabled={saving}
                >
                  {t("claim.skipGenerate")}
                </Button>
                <Button
                  onClick={onSavePassword}
                  loading={saving}
                  disabled={skipping}
                >
                  {t("claim.savePassword")}
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
