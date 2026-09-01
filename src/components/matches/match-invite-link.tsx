"use client"

import { useState, useTransition } from "react"
import { CheckIcon, CopyIcon } from "lucide-react"
import { toast } from "sonner"

import { useI18n } from "@/i18n/client"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

/**
 * The match invite link actions (matchmaking.html §builder side card): the
 * short /m/<token> URL in a mono field, with Copy, Facebook and WhatsApp
 * share. Rendered inside the share-link modal — the label and hint live in
 * the dialog header. The link is public — anyone who opens it lands on the
 * match room, and signed-out visitors are routed through login/register
 * straight back here.
 */
export function MatchInviteLink({ shareToken }: { shareToken: string }) {
  const { t } = useI18n()
  const [copied, setCopied] = useState(false)
  const [pending, start] = useTransition()

  const url =
    typeof window === "undefined"
      ? `/m/${shareToken}`
      : `${window.location.origin}/m/${shareToken}`

  function copy() {
    start(async () => {
      try {
        await navigator.clipboard.writeText(url)
        setCopied(true)
        toast.success(t("matches.inviteLink.copied"))
        setTimeout(() => setCopied(false), 2000)
      } catch {
        toast.error(t("errors.generic"))
      }
    })
  }

  const message = `${t("matches.inviteLink.shareText")}\n${url}`

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <Input
          readOnly
          value={url}
          onFocus={(e) => e.currentTarget.select()}
          aria-label={t("matches.inviteLink.label")}
          className="match-score text-xs text-dt-green"
        />
        <Button
          size="sm"
          className="match-btn-lime"
          onClick={copy}
          loading={pending}
        >
          {copied ? (
            <CheckIcon className="size-4" aria-hidden />
          ) : (
            <CopyIcon className="size-4" aria-hidden />
          )}
          {t("matches.inviteLink.copy")}
        </Button>
      </div>
      <div className="flex gap-2">
        <Button
          variant="outline"
          size="sm"
          className="flex-1"
          render={
            <a
              href={`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`}
              target="_blank"
              rel="noopener noreferrer"
            />
          }
        >
          {t("matches.inviteLink.facebook")}
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="flex-1"
          render={
            <a
              href={`https://wa.me/?text=${encodeURIComponent(message)}`}
              target="_blank"
              rel="noopener noreferrer"
            />
          }
        >
          {t("matches.inviteLink.whatsapp")}
        </Button>
      </div>
    </div>
  )
}
