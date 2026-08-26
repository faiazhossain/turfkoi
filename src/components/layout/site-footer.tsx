import { getT } from "@/i18n/server"

export async function SiteFooter() {
  const t = await getT()
  // pb-16 on mobile clears the fixed bottom nav.
  return (
    <footer className="border-t border-border pb-16 pt-10 md:pb-10">
      <div className="mx-auto flex max-w-6xl flex-col gap-3 px-4 text-small text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <span className="inline-block size-2 rounded-full bg-primary" aria-hidden />
          <span className="font-heading font-semibold text-foreground">DeshiTurf</span>
          <span>{t("nav.footerTagline")}</span>
        </div>
        <p>{t("nav.footerPayments")}</p>
      </div>
    </footer>
  )
}
