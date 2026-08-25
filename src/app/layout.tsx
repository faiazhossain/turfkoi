import type { Metadata, Viewport } from "next"
import type { ReactNode } from "react"
import { Geist, Geist_Mono, Noto_Sans_Bengali } from "next/font/google"

import "./globals.css"
import { Providers } from "@/components/providers"
import { SiteHeader } from "@/components/layout/site-header"
import { SiteFooter } from "@/components/layout/site-footer"
import { MobileNav } from "@/components/layout/mobile-nav"
import { RouteTransitionOverlay } from "@/components/layout/route-transition-overlay"
import { I18nProvider } from "@/i18n/client"
import { getLocale, getT } from "@/i18n/server"

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
  display: "swap",
})

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
  display: "swap",
})

const bengali = Noto_Sans_Bengali({
  variable: "--font-bengali",
  subsets: ["bengali"],
  display: "swap",
})

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT()
  return {
    title: {
      default: t("metadata.rootTitle"),
      template: "%s | Turfkoi",
    },
    description: t("metadata.rootDescription"),
    applicationName: "Turfkoi",
  }
}

export const viewport: Viewport = {
  themeColor: "#080B10",
}

export default async function RootLayout({ children }: { children: ReactNode }) {
  const locale = await getLocale()
  return (
    <html
      lang={locale}
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} ${bengali.variable}`}
    >
      <body className="flex min-h-dvh flex-col bg-background text-foreground">
        <I18nProvider locale={locale}>
          <Providers>
            <SiteHeader />
            <main className="flex-1">{children}</main>
            <SiteFooter />
            <MobileNav />
            <RouteTransitionOverlay />
          </Providers>
        </I18nProvider>
      </body>
    </html>
  )
}
