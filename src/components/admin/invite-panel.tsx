"use client"

import { useState } from "react"
import { toast } from "sonner"
import { CopyIcon, LinkIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

import { createClaimInviteAction } from "@/features/turf-claims/actions"

type CreatedInvite = {
  url: string
  expiresAt: Date
  emailed: boolean
}

/**
 * Mint and deliver a turf-claim invite link. The plaintext link is shown
 * exactly once (only a hash is stored) with a copy button for WhatsApp;
 * a new invite invalidates any previous link for the turf.
 */
export function InvitePanel({
  turfId,
  defaultOpen = false,
}: {
  turfId: string
  defaultOpen?: boolean
}) {
  const [open, setOpen] = useState(defaultOpen)
  const [email, setEmail] = useState("")
  const [pending, setPending] = useState(false)
  const [invite, setInvite] = useState<CreatedInvite | null>(null)

  async function onCreate() {
    setPending(true)
    try {
      const res = await createClaimInviteAction({
        turfId,
        targetEmail: email.trim() ? email.trim() : undefined,
      })
      if (!res.ok) {
        toast.error(res.error)
        return
      }
      setInvite({
        url: `${window.location.origin}${res.path}`,
        expiresAt: new Date(res.expiresAt),
        emailed: res.emailed,
      })
      setOpen(true)
      toast.success(
        res.emailed ? "Invite emailed." : "Invite link created."
      )
    } finally {
      setPending(false)
    }
  }

  async function onCopy() {
    if (!invite) return
    try {
      await navigator.clipboard.writeText(invite.url)
      toast.success("Link copied — paste it to the owner (WhatsApp works).")
    } catch {
      toast.error("Couldn't copy. Select the link and copy manually.")
    }
  }

  if (!open) {
    return (
      <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
        Invite owner
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
              Expires {invite.expiresAt.toDateString()}
              {invite.emailed ? " · emailed" : " · not emailed"}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <Input
              readOnly
              value={invite.url}
              onFocus={(e) => e.currentTarget.select()}
              className="text-xs"
              aria-label="Claim link"
            />
            <Button
              size="sm"
              variant="outline"
              onClick={onCopy}
              aria-label="Copy claim link"
            >
              <CopyIcon className="size-3.5" aria-hidden />
              Copy
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Shown only once. Creating a new invite invalidates this link.
          </p>
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">
          The link is single-use and shown only once. Creating a new invite
          invalidates any previous link.
        </p>
      )}
      <div className="space-y-1.5">
        <Label htmlFor={`invite-email-${turfId}`} className="text-xs">
          Owner email (optional)
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
          <Button size="sm" onClick={onCreate} loading={pending}>
            {invite ? "New link" : "Create link"}
          </Button>
        </div>
      </div>
    </div>
  )
}
