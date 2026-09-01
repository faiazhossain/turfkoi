"use client"

import { useEffect, useState } from "react"
import QRCode from "qrcode"
import { toast } from "sonner"

import { useI18n } from "@/i18n/client"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Loader } from "@/components/ui/loader"

/**
 * Player ID sharing (Player Network): Copy ID, native share where available
 * (clipboard fallback), and a QR that resolves to the public profile route
 * /players/{code} — the code is the only identifier in the URL, never the
 * internal uuid.
 */
export function QrShare({ playerId, playerName }: { playerId: string; playerName: string }) {
  const { t } = useI18n()
  const [copied, setCopied] = useState(false)
  const [qrOpen, setQrOpen] = useState(false)
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null)

  useEffect(() => {
    if (!qrOpen) return
    let alive = true
    const path = `${window.location.origin}/players/${playerId}`
    QRCode.toDataURL(path, { width: 240, margin: 2 })
      .then((url) => {
        if (alive) setQrDataUrl(url)
      })
      .catch(() => {
        if (alive) setQrDataUrl(null)
      })
    return () => {
      alive = false
    }
  }, [qrOpen, playerId])

  function copyId() {
    navigator.clipboard?.writeText(playerId).catch(() => {})
    setCopied(true)
    setTimeout(() => setCopied(false), 1600)
  }

  async function share() {
    const text = t("players.shareText", { code: playerId })
    if (typeof navigator.share === "function") {
      try {
        await navigator.share({ title: playerName, text })
        return
      } catch {
        /* dismissed — fall through to copy */
      }
    }
    await navigator.clipboard?.writeText(text).catch(() => {})
    toast.success(t("players.copied"))
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button size="sm" variant="outline" onClick={copyId}>
        {copied ? t("players.copied") : t("players.copyId")}
      </Button>
      <Button size="sm" variant="outline" onClick={share}>
        {t("players.share")}
      </Button>
      <Button size="sm" variant="outline" onClick={() => setQrOpen(true)}>
        {t("players.qr")}
      </Button>

      <Dialog open={qrOpen} onOpenChange={setQrOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-center font-heading">
              {t("players.qrTitle")}
            </DialogTitle>
            <DialogDescription className="text-center">
              {t("players.qrDesc")}
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col items-center gap-3">
            {qrOpen && !qrDataUrl ? (
              <div className="flex h-60 w-60 items-center justify-center">
                <Loader size={48} label={t("common.loading")} />
              </div>
            ) : qrDataUrl ? (
              // eslint-disable-next-line @next/next/no-img-element -- locally generated data URL
              <img
                src={qrDataUrl}
                alt={`${t("players.qrTitle")} ${playerId}`}
                className="h-60 w-60 rounded-lg border border-border bg-white p-2"
              />
            ) : null}
            <p className="font-mono text-sm font-semibold tracking-wide">{playerId}</p>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
