import type { Metadata, Viewport } from "next"
import type { ReactNode } from "react"
import { Geist, Geist_Mono, Noto_Sans_Bengali } from "next/font/google"

import "./globals.css"
import { Providers } from "@/components/providers"
import { SiteHeader } from "@/components/layout/site-header"
import { SiteFooter } from "@/components/layout/site-footer"
import { MobileNav } from "@/components/layout/mobile-nav"

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

export const metadata: Metadata = {
  title: {
    default: "Turfkoi - Book a turf. Find an opponent. Play.",
    template: "%s | Turfkoi",
  },
  description:
    "Book football turfs in Bangladesh, find an opposing team, fill missing roster spots, and play. Prices in Taka, payments via bKash.",
  applicationName: "Turfkoi",
}

export const viewport: Viewport = {
  themeColor: "#080B10",
}

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} ${bengali.variable}`}
    >
      <body className="flex min-h-dvh flex-col bg-background text-foreground">
        <Providers>
          <SiteHeader />
          <main className="flex-1">{children}</main>
          <SiteFooter />
          <MobileNav />
        </Providers>
      </body>
    </html>
  )
}
