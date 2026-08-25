import type { Metadata } from "next"

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { SeedTurfForm } from "@/components/admin"
import { getT } from "@/i18n/server"
import { buildMetadata } from "@/i18n/metadata"

export async function generateMetadata(): Promise<Metadata> {
  return buildMetadata({ titleKey: "metadata.adminSeedTurfTitle" })
}

/**
 * Admin concierge onboarding: seed a basic turf listing now, invite the
 * real owner to claim and complete it later (see docs/FEATURES.md).
 */
export default async function AdminSeedTurfPage() {
  const t = await getT()
  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <h2 className="font-heading text-lg font-semibold">{t("admin.seed.title")}</h2>
      <Card>
        <CardHeader>
          <CardTitle className="font-heading text-base">{t("admin.seed.basicsCardTitle")}</CardTitle>
          <CardDescription>{t("admin.seed.basicsCardDesc")}</CardDescription>
        </CardHeader>
        <CardContent>
          <SeedTurfForm />
        </CardContent>
      </Card>
    </div>
  )
}
