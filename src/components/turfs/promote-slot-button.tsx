"use client"

import { toast } from "sonner"
import { MegaphoneIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { useI18n } from "@/i18n/client"

/**
 * Phase 2 stub for the "Fill This Slot" headline feature. The button is
 * visible so the surface exists; team matchmaking wires in for real in
 * Phase 5. Keeping the affordance present means the dashboard UX is honest
 * about what's coming instead of silently missing.
 */
export function PromoteSlotButton({ slotLabel }: { slotLabel: string }) {
  const { t } = useI18n()
  return (
    <Button
      type="button"
      size="sm"
      variant="outline"
      onClick={() =>
        toast.info(t("turfOwner.promoteToastTitle"), {
          description: t("turfOwner.promoteToastDesc", { label: slotLabel }),
        })
      }
    >
      <MegaphoneIcon aria-hidden />
      {t("turfOwner.promoteSlot")}
    </Button>
  )
}
