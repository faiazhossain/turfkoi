import type { Metadata } from "next"

import { buildMetadata } from "@/i18n/metadata"
import { getT } from "@/i18n/server"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { TurfApplicationForm } from "@/components/turf-applications/turf-application-form"

export async function generateMetadata(): Promise<Metadata> {
  return buildMetadata({
    titleKey: "metadata.ownATurfTitle",
    descriptionKey: "metadata.ownATurfDescription",
  })
}

/**
 * Supply-side funnel entry (Option C): owners apply, admins approve, and the
 * existing turf-claims invite flow takes over from there.
 */
export default async function OwnATurfPage() {
  const t = await getT()
  return (
    <div className="mx-auto flex max-w-md flex-col gap-6 px-4 py-16">
      <Card>
        <CardHeader>
          <CardTitle className="font-heading text-2xl">{t("ownATurf.title")}</CardTitle>
          <CardDescription>{t("ownATurf.desc")}</CardDescription>
        </CardHeader>
        <CardContent>
          <TurfApplicationForm />
        </CardContent>
      </Card>
    </div>
  )
}
