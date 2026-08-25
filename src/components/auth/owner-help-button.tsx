"use client"

import Link from "next/link"
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
import { useI18n } from "@/i18n/client"

/**
 * Steps a prospective turf owner follows to get an account. Owners cannot
 * self-register: an admin seeds the turf, sends a claim link, and the owner
 * registers through it (see src/features/turf-claims/invites.ts). Turfs can
 * also enter via an owner application at /own-a-turf, which admins approve
 * into the same flow. Copy lives in the dictionaries (auth.ownerStep*);
 * this stays plain key data so it can be tested without rendering.
 */
export const OWNER_ONBOARDING_STEPS = [
  { titleKey: "auth.ownerStep1Title", bodyKey: "auth.ownerStep1Body" },
  { titleKey: "auth.ownerStep2Title", bodyKey: "auth.ownerStep2Body" },
  { titleKey: "auth.ownerStep3Title", bodyKey: "auth.ownerStep3Body" },
  { titleKey: "auth.ownerStep4Title", bodyKey: "auth.ownerStep4Body" },
] as const

export const OWNER_HELP_NOTE_KEY = "auth.ownerHelpNote"

/** CTA that routes prospective owners into the application funnel. */
export const OWNER_APPLY_PATH = "/own-a-turf"

export function OwnerHelpButton() {
  const { t } = useI18n()
  return (
    <Dialog>
      <DialogTrigger render={<Button variant="link" />}>
        <CircleHelpIcon aria-hidden />
        {t("auth.ownATurfTitle")}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("auth.ownATurfTitle")}</DialogTitle>
          <DialogDescription>{t("auth.ownATurfDesc")}</DialogDescription>
        </DialogHeader>
        <ol className="space-y-3">
          {OWNER_ONBOARDING_STEPS.map((step, index) => (
            <li key={step.titleKey} className="flex gap-3">
              <span
                aria-hidden
                className="flex size-6 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-medium"
              >
                {index + 1}
              </span>
              <div className="space-y-0.5">
                <p className="font-medium">{t(step.titleKey)}</p>
                <p className="text-sm text-muted-foreground">{t(step.bodyKey)}</p>
              </div>
            </li>
          ))}
        </ol>
        <p className="text-sm text-muted-foreground">{t(OWNER_HELP_NOTE_KEY)}</p>
        <DialogFooter showCloseButton>
          <Button render={<Link href={OWNER_APPLY_PATH} />}>
            {t("auth.listYourTurf")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
