import { redirect } from "next/navigation"
import type { Metadata } from "next"

import { getCurrentUser } from "@/lib/auth"
import { TurfForm } from "@/components/turfs"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { getT } from "@/i18n/server"
import { buildMetadata } from "@/i18n/metadata"

export async function generateMetadata(): Promise<Metadata> {
  return buildMetadata({ titleKey: "metadata.turfOwnerNewTitle" })
}

export default async function NewTurfPage() {
  const t = await getT()
  const user = await getCurrentUser()
  if (!user) redirect("/login")
  if (!user.roles.includes("turf_owner")) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-16">
        <p className="text-sm text-muted-foreground">
          {t("turfOwner.needRole")}
        </p>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-12">
      <Card>
        <CardHeader>
          <CardTitle className="font-heading text-2xl">
            {t("turfOwner.newTurfTitle")}
          </CardTitle>
          <CardDescription>{t("turfOwner.newTurfDesc")}</CardDescription>
        </CardHeader>
        <CardContent>
          <TurfForm mode="create" />
        </CardContent>
      </Card>
    </div>
  )
}
