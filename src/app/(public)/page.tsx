import Link from "next/link"
import { CalendarCheckIcon, SwordsIcon, UsersIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { StatusBadge } from "@/components/shared"

const features = [
  {
    icon: CalendarCheckIcon,
    title: "Book a turf",
    desc: "Browse turfs near you, pick a slot, and pay by bKash. A transparent fee is locked at checkout - never changed after.",
  },
  {
    icon: SwordsIcon,
    title: "Find an opponent",
    desc: "Publish your match and let rival teams accept. No more scrambling on WhatsApp to fill a booked slot.",
  },
  {
    icon: UsersIcon,
    title: "Fill your roster",
    desc: "Short on players? Solo players nearby can request to join your match as guests for the game.",
  },
]

export default function HomePage() {
  return (
    <>
      <section className="mx-auto max-w-6xl px-4 py-16 md:py-24">
        <StatusBadge status="primary" className="mb-4">
          Made for turf sports in Bangladesh
        </StatusBadge>
        <h1 className="max-w-3xl text-4xl font-bold leading-tight tracking-tight md:text-5xl">
          Book a turf. <span className="text-primary">Find an opponent.</span> Fill the
          gap. Play.
        </h1>
        <p className="mt-4 max-w-xl text-base text-muted-foreground">
          Turfkoi brings turf booking, team matchmaking, and filling missing roster spots
          into one place. Prices in Taka, payments via bKash.
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <Button size="lg" render={<Link href="/turfs" />}>
            Book a turf
          </Button>
          <Button size="lg" variant="outline" render={<Link href="/matches" />}>
            Find a match
          </Button>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 pb-20">
        <div className="grid gap-4 sm:grid-cols-3">
          {features.map((f) => (
            <div
              key={f.title}
              className="rounded-lg border border-border bg-card p-5 shadow-low"
            >
              <div className="mb-3 inline-flex size-10 items-center justify-center rounded-md bg-primary/15 text-primary">
                <f.icon className="size-5" aria-hidden />
              </div>
              <h2 className="font-heading text-base font-semibold">{f.title}</h2>
              <p className="mt-1 text-sm text-muted-foreground">{f.desc}</p>
            </div>
          ))}
        </div>
      </section>
    </>
  )
}
