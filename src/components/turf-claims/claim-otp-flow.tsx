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
      setModalError("Passwords do not match")
      return
    }
    setSaving(true)
    try {
      const res = await setClaimPasswordAction(password)
      if (!res.ok) {
        setModalError(res.error)
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
        setModalError(res.error)
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
        toast.error(res.error)
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
      toast.success("Password copied — keep it somewhere safe.")
    } catch {
      toast.error("Couldn't copy. Write it down manually.")
    }
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        We sent a 6-digit code to your WhatsApp ({maskedPhone}). Enter it to
        sign in and claim this turf.
      </p>
      <form
        onSubmit={(e) => {
          e.preventDefault()
          if (!verifying) onVerify()
        }}
        className="space-y-3"
      >
        <div className="space-y-2">
          <Label htmlFor="claim-otp">WhatsApp code</Label>
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
          {verifying ? "Verifying" : "Verify and continue"}
        </Button>
      </form>

      <Dialog open={modalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {generated ? "Your password" : "Set a password"}
            </DialogTitle>
            <DialogDescription>
              {generated
                ? "Use this to sign in with your phone number. You can change it later in settings."
                : "You're signed in. Choose a password for next time — or skip and we'll generate one for you."}
            </DialogDescription>
          </DialogHeader>

          {generated ? (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Input
                  readOnly
                  value={generated}
                  onFocus={(e) => e.currentTarget.select()}
                  aria-label="Generated password"
                />
                <Button
                  variant="outline"
                  onClick={onCopyGenerated}
                  aria-label="Copy password"
                >
                  <CopyIcon className="size-4" aria-hidden />
                  Copy
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Shown only once — save it now. Signing in uses your phone
                number ({maskedPhone}) and this password.
              </p>
              {modalError ? (
                <StatusBadge status="danger">{modalError}</StatusBadge>
              ) : null}
            </div>
          ) : (
            <div className="space-y-3">
              <div className="space-y-2">
                <Label htmlFor="claim-password">New password</Label>
                <Input
                  id="claim-password"
                  type="password"
                  autoComplete="new-password"
                  placeholder="At least 8 characters"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="claim-confirm">Confirm password</Label>
                <Input
                  id="claim-confirm"
                  type="password"
                  autoComplete="new-password"
                  placeholder="Same password again"
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
                {claiming ? "Claiming your turf" : "Continue"}
              </Button>
            ) : (
              <>
                <Button
                  variant="ghost"
                  onClick={onSkip}
                  loading={skipping}
                  disabled={saving}
                >
                  Skip — generate one for me
                </Button>
                <Button
                  onClick={onSavePassword}
                  loading={saving}
                  disabled={skipping}
                >
                  Save password
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
