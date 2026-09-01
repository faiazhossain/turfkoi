import { ShieldCheckIcon } from "lucide-react"

import { getT } from "@/i18n/server"

import { Reveal } from "./reveal"

/** bKash + fee-transparency one-liner. Pure text, no images. */
export async function TrustStrip() {
  const t = await getT()

  return (
    <section className="mx-auto max-w-6xl px-4 pb-16 md:pb-24">
      <Reveal>
        <div className="flex flex-col items-center gap-3 rounded-lg border border-dt-line bg-dt-card px-6 py-6 text-center shadow-low sm:flex-row sm:text-left">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-md bg-dt-green/15 text-dt-green">
            <ShieldCheckIcon className="size-5" aria-hidden />
          </div>
          <div>
            <p className="font-heading text-sm font-semibold">
              {t("home.trustPayments")}
            </p>
            <p className="mt-0.5 text-sm text-dt-dim">
              {t("home.trustFee")}
            </p>
          </div>
        </div>
      </Reveal>
    </section>
  )
}
