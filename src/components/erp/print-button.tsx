"use client"

import { Button } from "@/components/ui/button"
import { PrinterIcon } from "lucide-react"
import { useI18n } from "@/i18n/client"

export function PrintButton() {
  const { t } = useI18n()
  return (
    <Button
      variant="outline"
      size="sm"
      onClick={() => window.print()}
      className="print:hidden"
    >
      <PrinterIcon className="size-4" aria-hidden />
      {t("erp.reports.print")}
    </Button>
  )
}
