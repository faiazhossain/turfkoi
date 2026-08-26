"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { CopyIcon } from "lucide-react"
import { toast } from "sonner"

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
import { useI18n } from "@/i18n/client"

import { ownerCodeLoginAction } from "@/features/owner-login/actions"
import {
  setClaimPasswordAction,
  skipClaimPasswordAction,
} from "@/features/turf-claims/actions"

/**
 * Sign-in with a one-time code the Turfkoi team relayed over WhatsApp
 * (owner lockout support flow). Verifying the code signs the owner in with
 * a rotated one-time password, then this forces the set-password step —
 * same shape as the claim OTP flow, minus the claim.
 */
export function OwnerCodeLogin() {
  const router = useRouter()
  const { t } = useI18n()
  const [phone, setPhone] = useState("")
  const [code, setCode] = useState("")
  const [verifying, setVerifying] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Modal state (mirrors ClaimOtpFlow).
  const [modalOpen, setModalOpen] = useState(false)
  const [password, setPassword] = useState("")
  const [confirm, setConfirm] = useState("")
  const [saving, setSaving] = useState(false)
  const [skipping, setSkipping] = useState(false)
  const [modalError, setModalError] = useState<string | null>(null)
  const [generated, setGenerated] = useState<string | null>(null)
  const [redirecting, setRedirecting] = useState(false)

  async function onVerify() {
    setError(null)
    setVerifying(true)
    try {
      const res = await ownerCodeLoginAction({ phone, code })
      if (!res.ok) {
        setError(res.error)
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
      setModalError("ownerCode.errors.passwordMismatch")
      return
    }
    setSaving(true)
    try {
      const res = await setClaimPasswordAction(password)
      if (!res.ok) {
        setModalError(res.error)
        return
      }
      await goHome()
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
        setModalError(res.error)
        return
      }
      setGenerated(res.password)
    } finally {
      setSkipping(false)
    }
  }

  async function goHome() {
    setRedirecting(true)
    router.replace("/turf-owner")
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
    <div className="space-y-4">
      <form
        onSubmit={(e) => {
          e.preventDefault()
          if (!verifying) onVerify()
        }}
        className="space-y-3"
      >
        <div className="space-y-2">
          <Label htmlFor="owner-code-phone">{t("auth.phoneLabel")}</Label>
          <Input
            id="owner-code-phone"
            inputMode="tel"
            autoComplete="tel"
            placeholder="01XXXXXXXXX"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="owner-code">{t("ownerCode.codeLabel")}</Label>
          <Input
            id="owner-code"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            placeholder="000000"
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
            className="text-center text-lg tracking-[0.5em]"
          />
        </div>
        {error ? (
          <StatusBadge status="danger">{t(error)}</StatusBadge>
        ) : null}
        <Button type="submit" size="lg" className="w-full" loading={verifying}>
          {verifying ? t("claim.verifying") : t("ownerCode.signInButton")}
        </Button>
      </form>

      <Dialog open={modalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {generated
                ? t("claim.yourPasswordTitle")
                : t("claim.setPasswordTitle")}
            </DialogTitle>
            <DialogDescription>
              {generated
                ? t("claim.passwordGeneratedDesc")
                : t("claim.passwordChooseDesc")}
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
                  {t("admin.ownerCode.copy")}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                {t("claim.shownOnce", { phone })}
              </p>
              {modalError ? (
                <StatusBadge status="danger">{t(modalError)}</StatusBadge>
              ) : null}
            </div>
          ) : (
            <div className="space-y-3">
              <div className="space-y-2">
                <Label htmlFor="owner-new-password">
                  {t("ownerCode.newPassword")}
                </Label>
                <Input
                  id="owner-new-password"
                  type="password"
                  autoComplete="new-password"
                  placeholder={t("auth.passwordPlaceholder")}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="owner-new-confirm">
                  {t("auth.confirmPassword")}
                </Label>
                <Input
                  id="owner-new-confirm"
                  type="password"
                  autoComplete="new-password"
                  placeholder={t("claim.confirmPlaceholder")}
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                />
              </div>
              {modalError ? (
                <StatusBadge status="danger">{t(modalError)}</StatusBadge>
              ) : null}
            </div>
          )}

          <DialogFooter>
            {generated ? (
              <Button loading={redirecting} onClick={goHome}>
                {t("common.continue")}
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
                <Button onClick={onSavePassword} loading={saving} disabled={skipping}>
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
