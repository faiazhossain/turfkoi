import Link from "next/link"
import { CalendarCheckIcon, SwordsIcon, UsersIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { HeroAnimation } from "@/components/home/hero-animation"
import { StatusBadge } from "@/components/shared"
import { getT } from "@/i18n/server"

const featureMeta = [
  { icon: CalendarCheckIcon, titleKey: "home.featureBookTitle", descKey: "home.featureBookDesc" },
  { icon: SwordsIcon, titleKey: "home.featureOpponentTitle", descKey: "home.featureOpponentDesc" },
  { icon: UsersIcon, titleKey: "home.featureRosterTitle", descKey: "home.featureRosterDesc" },
]

export default async function HomePage() {
  const t = await getT()
  return (
    <>
      <section className="mx-auto max-w-6xl px-4 py-16 md:py-24">
        <div className="grid items-center gap-10 md:grid-cols-2">
          <div>
            <StatusBadge status="primary" className="mb-4">
              {t("home.badge")}
            </StatusBadge>
            <h1 className="max-w-3xl text-4xl font-bold leading-tight tracking-tight md:text-5xl">
              {t("home.heroBookTurf")} <span className="text-primary">{t("home.heroFindOpponent")}</span>{" "}
              {t("home.heroFillAndPlay")}
            </h1>
            <p className="mt-4 max-w-xl text-base text-muted-foreground">{t("home.heroBody")}</p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Button size="lg" render={<Link href="/turfs" />}>
                {t("home.ctaBook")}
              </Button>
              <Button size="lg" variant="outline" render={<Link href="/matches" />}>
                {t("home.ctaFindMatch")}
              </Button>
            </div>
          </div>
          <HeroAnimation className="hero-animation h-[280px] sm:h-[380px] md:h-[500px]" />
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 pb-20">
        <div className="grid gap-4 sm:grid-cols-3">
          {featureMeta.map((f) => (
            <div
              key={f.titleKey}
              className="rounded-lg border border-border bg-card p-5 shadow-low"
            >
              <div className="mb-3 inline-flex size-10 items-center justify-center rounded-md bg-primary/15 text-primary">
                <f.icon className="size-5" aria-hidden />
              </div>
              <h2 className="font-heading text-base font-semibold">{t(f.titleKey)}</h2>
              <p className="mt-1 text-sm text-muted-foreground">{t(f.descKey)}</p>
            </div>
          ))}
        </div>
      </section>
    </>
  )
}
