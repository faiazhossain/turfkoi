import { LockIcon, SparklesIcon } from "lucide-react"

import { getT } from "@/i18n/server"

/** Small "Premium" chip shown on unlocked premium-gated sections. */
export async function PremiumBadge() {
  const t = await getT()
  return (
    <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">
      <SparklesIcon className="size-3" aria-hidden />
      {t("erp.premium.badge")}
    </span>
  )
}

/**
 * Premium feature preview (UX spec §5): what it does, why it matters, and a
 * clear lock badge. Server-renderable; no nag-walls, no crippled data.
 */
export async function PremiumLockCard({
  titleKey,
  descKey,
}: {
  titleKey: string
  descKey: string
}) {
  const t = await getT()
  return (
    <section className="rounded-xl border border-dashed border-border bg-card/50 p-5">
      <div className="flex items-start gap-3">
        <LockIcon className="mt-0.5 size-5 text-muted-foreground" aria-hidden />
        <div>
          <p className="font-heading text-sm font-semibold">
            {t(titleKey)}
            <span className="ml-2 rounded bg-muted px-1.5 py-0.5 text-[10px] uppercase text-muted-foreground">
              {t("erp.premium.badge")}
            </span>
          </p>
          <p className="mt-1 text-sm text-muted-foreground">{t(descKey)}</p>
        </div>
      </div>
    </section>
  )
}
