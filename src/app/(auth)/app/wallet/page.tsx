import type { Metadata } from "next"
import Link from "next/link"
import { redirect } from "next/navigation"
import { WalletIcon } from "lucide-react"

import { buildMetadata } from "@/i18n/metadata"
import { getT } from "@/i18n/server"
import { getSession } from "@/lib/auth"
import { formatBdt } from "@/lib/pricing"
import { TopUpButton } from "@/components/wallet/topup-button"
import { ClaimButton } from "@/components/wallet/claim-button"
import {
  getWalletBalance,
  hasPendingWalletClaim,
  listWalletEntries,
  type WalletEntryRow,
} from "@/features/wallet/queries"

export async function generateMetadata(): Promise<Metadata> {
  return buildMetadata({ titleKey: "wallet.title" })
}

const ENTRY_LABEL: Record<WalletEntryRow["type"], string> = {
  topup: "wallet.entryTopup",
  match_fee: "wallet.entryMatchFee",
  credit: "wallet.entryCredit",
  claim: "wallet.entryClaim",
}

export default async function WalletPage({
  searchParams,
}: {
  searchParams: Promise<{ topup?: string }>
}) {
  const t = await getT()
  const session = await getSession()
  if (!session?.user) redirect("/login")
  const { topup } = await searchParams

  const [balance, entries, pendingClaim] = await Promise.all([
    getWalletBalance(session.user.id),
    listWalletEntries(session.user.id),
    hasPendingWalletClaim(session.user.id),
  ])

  return (
    <div className="player-hq mx-auto max-w-2xl space-y-6 px-4 py-12">
      <div className="match-hq-glow" aria-hidden />

      <header>
        <p className="match-eyebrow">{t("nav.wallet")}</p>
        <h1 className="mt-1 font-heading text-2xl font-bold">
          {t("wallet.title")}
        </h1>
      </header>

      {topup === "success" ? (
        <p className="rounded-xl border border-dt-line bg-dt-card p-3 text-sm text-dt-green">
          {t("wallet.topupSuccess")}
        </p>
      ) : null}
      {topup === "failed" ? (
        <p className="rounded-xl border border-dt-line bg-dt-card p-3 text-sm text-dt-red">
          {t("wallet.topupFailed")}
        </p>
      ) : null}

      {/* Balance card */}
      <section className="player-hero rounded-2xl p-5">
        <div className="flex items-center gap-3">
          <WalletIcon className="size-6 text-dt-green" aria-hidden />
          <p className="text-small text-dt-dim">{t("wallet.balanceLabel")}</p>
        </div>
        <p className="match-score mt-2 text-4xl font-bold text-dt-txt">
          {formatBdt(balance)}
        </p>

        <div className="mt-5">
          <TopUpButton />
        </div>

        <div className="mt-4 border-t border-dt-line pt-4">
          {pendingClaim ? (
            <p className="text-small text-dt-dim">{t("wallet.claimPending")}</p>
          ) : (
            <>
              <p className="text-xs text-dt-dim">{t("wallet.claimWithin3Days")}</p>
              <div className="mt-2">
                <ClaimButton disabled={balance <= 0} />
              </div>
            </>
          )}
        </div>
      </section>

      {/* Fee explainer */}
      <p className="text-small text-dt-dim">{t("wallet.feeNotice")}</p>

      {/* History */}
      <section className="space-y-3">
        <h2 className="match-eyebrow">{t("wallet.historyTitle")}</h2>
        {entries.length === 0 ? (
          <p className="rounded-xl border border-dashed border-dt-line p-4 text-small text-dt-dim">
            {t("wallet.emptyHistory")}
          </p>
        ) : (
          <ul className="space-y-2">
            {entries.map((e) => (
              <li
                key={e.id}
                className="flex items-center justify-between gap-3 rounded-xl border border-dt-line bg-dt-card p-4 text-sm"
              >
                <div className="min-w-0">
                  <p className="truncate font-heading font-semibold">
                    {e.status === "pending"
                      ? t("wallet.entryPending")
                      : t(ENTRY_LABEL[e.type])}
                  </p>
                  <p className="match-score text-xs text-dt-dim">
                    {new Date(e.createdAt).toLocaleDateString("en-CA")}
                  </p>
                </div>
                <div className="text-right">
                  <p
                    className={`match-score tabular-nums font-bold ${
                      e.amount >= 0 ? "text-dt-green" : "text-dt-txt"
                    }`}
                  >
                    {e.amount >= 0 ? "+" : "−"}
                    {formatBdt(Math.abs(e.amount))}
                  </p>
                  {e.matchId ? (
                    <Link
                      href={`/matches/${e.matchId}`}
                      className="text-xs text-dt-dim hover:underline"
                    >
                      {t("wallet.viewMatch")}
                    </Link>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}

export const dynamic = "force-dynamic"
