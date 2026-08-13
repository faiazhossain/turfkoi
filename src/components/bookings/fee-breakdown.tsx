import { formatBdt } from "@/lib/pricing"

export interface FeeBreakdownProps {
  turfAmount: number
  platformFee: number
  total: number
}

/**
 * Transparent fee breakdown surfaced before payment (audit §28). All amounts
 * are whole Taka; the breakdown is immutable once the transaction row exists.
 */
export function FeeBreakdown({ turfAmount, platformFee, total }: FeeBreakdownProps) {
  return (
    <dl className="space-y-1 rounded-lg border border-border bg-card p-4 text-sm">
      <div className="flex items-center justify-between">
        <dt className="text-muted-foreground">Turf price</dt>
        <dd className="tabular-nums">{formatBdt(turfAmount)}</dd>
      </div>
      <div className="flex items-center justify-between">
        <dt className="text-muted-foreground">Platform fee</dt>
        <dd className="tabular-nums">{formatBdt(platformFee)}</dd>
      </div>
      <div className="mt-2 flex items-center justify-between border-t border-border pt-2">
        <dt className="font-semibold">Total</dt>
        <dd className="font-semibold tabular-nums">{formatBdt(total)}</dd>
      </div>
    </dl>
  )
}
