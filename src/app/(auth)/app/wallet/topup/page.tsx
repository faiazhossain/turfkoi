import type { Metadata } from "next"
import { redirect } from "next/navigation"

import { buildMetadata } from "@/i18n/metadata"
import { getT } from "@/i18n/server"
import { getSession } from "@/lib/auth"
import { PLATFORM_BKASH_NUMBER } from "@/lib/platform-payments"
import { PaymentSubmissionForm } from "@/components/payments/payment-submission-form"

export async function generateMetadata(): Promise<Metadata> {
  return buildMetadata({ titleKey: "wallet.topupTitle" })
}

/**
 * Manual bKash Send Money top-up: show the platform number, take the TxID +
 * optional receipt, and file the payment for admin verification. The wallet
 * balance only moves once the submission is VERIFIED.
 */
export default async function WalletTopupPage() {
  const t = await getT()
  const session = await getSession()
  if (!session?.user) redirect("/login")

  return (
    <div className="mx-auto max-w-xl space-y-6 px-4 py-12">
      <header className="space-y-1">
        <p className="match-eyebrow">{t("nav.wallet")}</p>
        <h1 className="font-heading text-2xl font-bold">
          {t("wallet.topupTitle")}
        </h1>
        <p className="text-small text-dt-dim">{t("wallet.topupIntro")}</p>
      </header>

      <PaymentSubmissionForm
        userId={session.user.id}
        purpose="wallet_topup"
        amount={0}
        platformNumber={PLATFORM_BKASH_NUMBER}
      />
    </div>
  )
}
