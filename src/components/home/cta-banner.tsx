import Image from "next/image"
import Link from "next/link"

import { Button } from "@/components/ui/button"
import { getT } from "@/i18n/server"

import { Reveal } from "./reveal"

/**
 * Final CTA. The brand logo is the card itself: a full-card watermark at low
 * opacity behind the copy, so the brand shows through lightly while the
 * headline/buttons overlay it. Served through next/image (auto WebP/AVIF,
 * lazy, below the fold) so the 1.1 MB source PNG ships at a few KB.
 */
export async function CtaBanner() {
  const t = await getT()

  return (
    <section className="mx-auto max-w-6xl px-4 pb-20 md:pb-28">
      <Reveal>
        <div className="relative overflow-hidden rounded-xl border border-dt-line bg-linear-to-br from-dt-green/12 via-dt-card to-dt-blue/12 px-6 py-14 text-center shadow-med md:py-20">
          <div
            aria-hidden
            className="pointer-events-none absolute -top-24 left-1/2 size-[420px] -translate-x-1/2 rounded-full"
            style={{
              background:
                "radial-gradient(circle at center, rgb(0 230 118 / 0.08), transparent 65%)",
            }}
          />
          {/* Full-card brand watermark */}
          <div aria-hidden className="pointer-events-none absolute inset-0">
            <Image
              src="/brand-logo-white.png"
              alt=""
              fill
              quality={70}
              sizes="(max-width: 768px) 100vw, 1152px"
              className="scale-110 object-contain opacity-[0.07] blur-[2px]"
            />
            {/* Fade the watermark toward the edges so the card border stays clean */}
            <div
              className="absolute inset-0"
              style={{
                background:
                  "radial-gradient(ellipse 90% 85% at 50% 50%, transparent 55%, rgb(8 11 16 / 0.9) 100%)",
              }}
            />
          </div>
          <div className="relative">
            <h2 className="text-3xl font-bold tracking-tight md:text-4xl">
              {t("home.ctaBannerTitle")}
            </h2>
            <p className="mx-auto mt-3 max-w-md text-dt-dim">
              {t("home.ctaBannerBody")}
            </p>
            <div className="mt-8 flex flex-wrap justify-center gap-3">
              <Button size="lg" render={<Link href="/register" />}>
                {t("home.ctaBannerPrimary")}
              </Button>
              <Button size="lg" variant="outline" render={<Link href="/turfs" />}>
                {t("home.ctaBannerSecondary")}
              </Button>
            </div>
          </div>
        </div>
      </Reveal>
    </section>
  )
}
