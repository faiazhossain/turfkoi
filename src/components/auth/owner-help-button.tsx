"use client"

import { CircleHelpIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"

/**
 * Steps a prospective turf owner follows to get an account. Owners cannot
 * self-register: an admin seeds the turf, sends a claim link, and the owner
 * registers through it (see src/features/turf-claims/invites.ts). Kept as
 * plain data so the copy can be tested without rendering.
 */
export const OWNER_ONBOARDING_STEPS = [
  {
    title: "We list your turf",
    body: "Turf accounts are set up by invitation. The Turfkoi team adds your turf to the platform first.",
  },
  {
    title: "You receive a claim link",
    body: "The Turfkoi team sends you a personal link by WhatsApp or email. It stays valid for 14 days.",
  },
  {
    title: "Open the link, then register or sign in",
    body: "Create your account on this page, or sign in if you already have one. You will be taken straight back to your turf.",
  },
  {
    title: "Press Claim turf",
    body: "That makes you the owner. You will set up slots, pricing, and photos next.",
  },
] as const

export const OWNER_HELP_NOTE =
  "No link yet? The Turfkoi team will reach out to you to get your turf set up."

export function OwnerHelpButton() {
  return (
    <Dialog>
      <DialogTrigger render={<Button variant="link" />}>
        <CircleHelpIcon aria-hidden />
        Own a turf?
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Own a turf?</DialogTitle>
          <DialogDescription>
            How turf owners get their account on Turfkoi.
          </DialogDescription>
        </DialogHeader>
        <ol className="space-y-3">
          {OWNER_ONBOARDING_STEPS.map((step, index) => (
            <li key={step.title} className="flex gap-3">
              <span
                aria-hidden
                className="flex size-6 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-medium"
              >
                {index + 1}
              </span>
              <div className="space-y-0.5">
                <p className="font-medium">{step.title}</p>
                <p className="text-sm text-muted-foreground">{step.body}</p>
              </div>
            </li>
          ))}
        </ol>
        <p className="text-sm text-muted-foreground">{OWNER_HELP_NOTE}</p>
        <DialogFooter showCloseButton />
      </DialogContent>
    </Dialog>
  )
}
