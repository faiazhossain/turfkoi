import Link from "next/link"
import { BuildingIcon, ShieldIcon, UserIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { getT } from "@/i18n/server"

import { Reveal } from "./reveal"

const audience = [
  {
    icon: UserIcon,
    titleKey: "home.audiencePlayersTitle",
    descKey: "home.audiencePlayersDesc",
    ctaKey: "home.audiencePlayersCta",
    href: "/register",
  },
  {
    icon: ShieldIcon,
    titleKey: "home.audienceTeamsTitle",
    descKey: "home.audienceTeamsDesc",
    ctaKey: "home.audienceTeamsCta",
    href: "/register",
  },
  {
    icon: BuildingIcon,
    titleKey: "home.audienceOwnersTitle",
    descKey: "home.audienceOwnersDesc",
    ctaKey: "home.audienceOwnersCta",
    href: "/own-a-turf",
  },
]

export async function AudienceSection() {
  const t = await getT()

  return (
    <section className="mx-auto max-w-6xl px-4 py-16 md:py-24">
      <Reveal className="mx-auto max-w-2xl text-center">
        <h2 className="text-3xl font-bold tracking-tight md:text-4xl">
          {t("home.audienceTitle")}
        </h2>
      </Reveal>

      <div className="mt-12 grid gap-4 md:grid-cols-3">
        {audience.map((a, i) => (
          <Reveal key={a.titleKey} delay={i * 0.1} className="h-full">
            <article className="flex h-full flex-col rounded-lg border border-border bg-card p-6 shadow-low">
              <div className="mb-4 inline-flex size-11 items-center justify-center rounded-md bg-primary/15 text-primary">
                <a.icon className="size-5" aria-hidden />
              </div>
              <h3 className="font-heading text-lg font-semibold">
                {t(a.titleKey)}
              </h3>
              <p className="mt-1.5 flex-1 text-sm leading-relaxed text-muted-foreground">
                {t(a.descKey)}
              </p>
              <Button
                variant="outline"
                size="sm"
                className="mt-5 self-start"
                render={<Link href={a.href} />}
              >
                {t(a.ctaKey)}
              </Button>
            </article>
          </Reveal>
        ))}
      </div>
    </section>
  )
}
