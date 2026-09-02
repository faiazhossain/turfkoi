import type { Metadata } from "next"
import Link from "next/link"

import { StatusBadge } from "@/components/shared"
import { WalletClaimControls } from "@/components/admin/wallet-claim-controls"
import { listWalletClaims } from "@/features/wallet/queries"
import { getT } from "@/i18n/server"
import { buildMetadata } from "@/i18n/metadata"
import { formatBdt } from "@/lib/pricing"

export async function generateMetadata(): Promise<Metadata> {
  return buildMetadata({ titleKey: "admin.walletClaims.title" })
}

const FILTERS = ["pending", "approved", "paid", "rejected", "all"] as const

const CLAIM_TONE: Record<
  string,
  "success" | "warning" | "neutral"
> = {
  pending: "warning",
  approved: "success",
  paid: "success",
  rejected: "neutral",
}

/**
 * Wallet cash-claim review queue. Payout is executed offline via bKash
 * within 3 working days of approval; marking paid records that the money
 * actually left. Rejection credits the held balance back to the wallet.
 */
export default async function AdminWalletClaimsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: (typeof FILTERS)[number] }>
}) {
  const t = await getT()
  const { status } = await searchParams
  const filter = status ?? "pending"
  const claims = await listWalletClaims(
    filter === "all" ? undefined : (filter as "pending" | "approved" | "paid" | "rejected")
  )

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-heading text-lg font-semibold">
          {t("admin.walletClaims.title")}
        </h2>
        <div className="flex gap-1 text-sm">
          {FILTERS.map((f) => (
            <Link
              key={f}
              href={`/admin/wallet-claims?status=${f}`}
              className={
                "rounded-lg border px-3 py-1.5 " +
                (filter === f
                  ? "border-dt-line bg-dt-card2 text-dt-txt"
                  : "border-transparent text-dt-dim hover:bg-dt-card2/50")
              }
            >
              {f === "all" ? t("admin.all") : t(`admin.walletClaims.status.${f}`)}
            </Link>
          ))}
        </div>
      </div>

      {claims.length === 0 ? (
        <p className="rounded-lg border border-dashed border-dt-line p-6 text-center text-sm text-dt-dim">
          {t("admin.walletClaims.empty")}
        </p>
      ) : (
        <ul className="space-y-2">
          {claims.map((claim) => (
            <li
              key={claim.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-dt-line bg-dt-card p-4"
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="match-score font-bold tabular-nums">
                    {formatBdt(claim.amount)}
                  </span>
                  <StatusBadge status={CLAIM_TONE[claim.status] ?? "neutral"} showIcon={false}>
                    {t(`admin.walletClaims.status.${claim.status}`)}
                  </StatusBadge>
                </div>
                <p className="truncate text-xs text-dt-dim">
                  {claim.userName ?? "—"} · {claim.userPhone}
                </p>
                <p className="text-xs text-dt-dim">
                  {t("admin.walletClaims.requestedAt")}:{" "}
                  {new Date(claim.createdAt).toLocaleDateString("en-CA")}
                </p>
                {claim.note ? (
                  <p className="mt-1 max-w-xl whitespace-pre-line text-xs text-dt-dim">
                    {claim.note}
                  </p>
                ) : null}
              </div>
              {claim.status === "pending" || claim.status === "approved" ? (
                <WalletClaimControls claimId={claim.id} />
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

export const dynamic = "force-dynamic"
