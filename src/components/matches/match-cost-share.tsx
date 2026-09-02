import { getT } from "@/i18n/server"
import { formatBdt, type CostShare } from "@/lib/pricing"

/**
 * What the joining side owes for this match: half the slot price plus the
 * matchmaking fee. Purely informational — the actual settlement between the
 * two sides happens outside the platform; only the fee is charged here.
 */
export async function MatchCostShare({ share }: { share: CostShare }) {
  const t = await getT()

  return (
    <section className="rounded-2xl border border-dt-line bg-dt-card p-4">
      <h2 className="font-heading text-lg font-semibold">
        {t("matches.costShare.title")}
      </h2>
      <p className="text-sm text-dt-dim">{t("matches.costShare.desc")}</p>
      <dl className="mt-3 space-y-1.5 text-sm">
        <div className="flex items-center justify-between gap-3">
          <dt className="text-dt-dim">{t("matches.costShare.slotPrice")}</dt>
          <dd className="tabular-nums">{formatBdt(share.total)}</dd>
        </div>
        <div className="flex items-center justify-between gap-3">
          <dt className="text-dt-dim">{t("matches.costShare.yourShare")}</dt>
          <dd className="tabular-nums">{formatBdt(share.share)}</dd>
        </div>
        <div className="flex items-center justify-between gap-3">
          <dt className="text-dt-dim">{t("matches.costShare.matchFee")}</dt>
          <dd className="tabular-nums">{formatBdt(share.fee)}</dd>
        </div>
        <div className="flex items-center justify-between gap-3 border-t border-dt-line pt-1.5">
          <dt className="font-medium">{t("matches.costShare.totalPayable")}</dt>
          <dd className="font-semibold text-dt-green tabular-nums">
            {formatBdt(share.payable)}
          </dd>
        </div>
      </dl>
    </section>
  )
}
