import { CalendarCheckIcon, SwordsIcon, UsersIcon } from "lucide-react"

import { getT } from "@/i18n/server"

import { Reveal } from "./reveal"

const featureMeta = [
  {
    step: "1",
    icon: CalendarCheckIcon,
    titleKey: "home.featureBookTitle",
    descKey: "home.featureBookDesc",
    accentClass: "bg-primary/15 text-primary",
  },
  {
    step: "2",
    icon: SwordsIcon,
    titleKey: "home.featureOpponentTitle",
    descKey: "home.featureOpponentDesc",
    accentClass: "bg-secondary/15 text-secondary",
  },
  {
    step: "3",
    icon: UsersIcon,
    titleKey: "home.featureRosterTitle",
    descKey: "home.featureRosterDesc",
    accentClass: "bg-warning/15 text-warning",
  },
]

export async function FeaturesSection() {
  const t = await getT()

  return (
    <section className="mx-auto max-w-6xl px-4 pb-16 md:pb-24">
      <Reveal className="mx-auto max-w-2xl text-center">
        <h2 className="text-3xl font-bold tracking-tight md:text-4xl">
          {t("home.featuresTitle")}
        </h2>
        <p className="mt-3 text-muted-foreground">{t("home.featuresSubtitle")}</p>
      </Reveal>

      <div className="mt-12 grid gap-4 sm:grid-cols-3">
        {featureMeta.map((f, i) => (
          <Reveal key={f.titleKey} delay={i * 0.1} className="h-full">
            <article className="group h-full rounded-lg border border-border bg-card p-5 shadow-low transition-transform duration-300 ease-out hover:-translate-y-1 motion-safe:hover:shadow-med">
              <div className="mb-3 flex items-center justify-between">
                <div
                  className={`inline-flex size-10 items-center justify-center rounded-md ${f.accentClass}`}
                >
                  <f.icon className="size-5" aria-hidden />
                </div>
                <span className="font-heading text-3xl font-bold text-muted-foreground/25">
                  {f.step}
                </span>
              </div>
              <h3 className="font-heading text-base font-semibold">
                {t(f.titleKey)}
              </h3>
              <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                {t(f.descKey)}
              </p>
            </article>
          </Reveal>
        ))}
      </div>
    </section>
  )
}
