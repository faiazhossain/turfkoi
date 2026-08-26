import type { Metadata } from "next"
import Link from "next/link"

import { Button } from "@/components/ui/button"
import { HeroAnimation } from "@/components/home/hero-animation"
import { HeroBackdrop } from "@/components/home/hero-backdrop"
import { StatsStrip } from "@/components/home/stats-strip"
import { FeaturesSection } from "@/components/home/features-section"
import { AudienceSection } from "@/components/home/audience-section"
import { TrustStrip } from "@/components/home/trust-strip"
import { CtaBanner } from "@/components/home/cta-banner"
import { StatusBadge } from "@/components/shared"
import { buildMetadata } from "@/i18n/metadata"
import { getT } from "@/i18n/server"

export async function generateMetadata(): Promise<Metadata> {
  return buildMetadata({ descriptionKey: "metadata.homeDescription" })
}

export default async function HomePage() {
  const t = await getT()
  return (
    <>
      <section className="relative py-16 md:py-24">
        <HeroBackdrop />
        <div className="mx-auto max-w-6xl px-4">
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
              <StatsStrip />
            </div>
            <HeroAnimation className="hero-animation h-[280px] sm:h-[380px] md:h-[500px]" />
          </div>
        </div>
      </section>

      <FeaturesSection />
      <AudienceSection />
      <TrustStrip />
      <CtaBanner />
    </>
  )
}
