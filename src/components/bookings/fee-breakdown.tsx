import { formatBdt } from "@/lib/pricing"
import { getT } from "@/i18n/server"

export interface FeeBreakdownProps {
  turfAmount: number
  platformFee: number
  total: number
}

/**
 * Transparent fee breakdown surfaced before payment (audit §28). All amounts
 * are whole Taka; the breakdown is immutable once the transaction row exists.
 */
export async function FeeBreakdown({ turfAmount, platformFee, total }: FeeBreakdownProps) {
  const t = await getT()
  return (
    <dl className="space-y-1 rounded-lg border border-dt-line bg-dt-card p-4 text-sm">
      <div className="flex items-center justify-between">
        <dt className="text-dt-dim">{t("booking.turfPrice")}</dt>
        <dd className="tabular-nums">{formatBdt(turfAmount)}</dd>
      </div>
      <div className="flex items-center justify-between">
        <dt className="text-dt-dim">{t("booking.platformFee")}</dt>
        <dd className="tabular-nums">{formatBdt(platformFee)}</dd>
      </div>
      <div className="mt-2 flex items-center justify-between border-t border-dt-line pt-2">
        <dt className="font-semibold">{t("booking.total")}</dt>
        <dd className="font-semibold tabular-nums">{formatBdt(total)}</dd>
      </div>
    </dl>
  )
}
