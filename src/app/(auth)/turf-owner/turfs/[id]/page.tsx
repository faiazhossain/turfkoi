import Link from "next/link"
import { notFound, redirect } from "next/navigation"
import type { Metadata } from "next"

import { getCurrentUser } from "@/lib/auth"
import { getT } from "@/i18n/server"
import { buildMetadata } from "@/i18n/metadata"
import { can } from "@/lib/capabilities"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs"
import { Button } from "@/components/ui/button"
import { StatusBadge } from "@/components/shared"
import {
  GenerateSlotsForm,
  SlotGrid,
  TurfForm,
} from "@/components/turfs"
import { TurfPhotoGallery } from "@/components/turfs/turf-photo-gallery"
import { getTurfById, listTurfSlots, listTurfPhotos } from "@/features/turfs/queries"
import type { TurfFormValues } from "@/features/turfs/schemas"

interface PageProps {
  params: Promise<{ id: string }>
}

export async function generateMetadata(): Promise<Metadata> {
  return buildMetadata({ titleKey: "metadata.turfOwnerEditTitle" })
}

export default async function EditTurfPage({ params }: PageProps) {
  const { id } = await params
  const t = await getT()
  const user = await getCurrentUser()
  if (!user) redirect("/login")

  const turf = await getTurfById(id)
  if (!turf) notFound()
  if (!can(user, "turf.update", { ownerId: turf.ownerId })) {
    notFound()
  }

  const today = new Date()
  const fromDate = today.toISOString().slice(0, 10)
  const toDate = new Date(today.getTime() + 14 * 86400000)
    .toISOString()
    .slice(0, 10)
  const slots = await listTurfSlots(turf.id, { from: fromDate, to: toDate })
  const photos = await listTurfPhotos(turf.id)

  const formDefaults: Partial<TurfFormValues> = {
    name: turf.name,
    slug: turf.slug,
    description: turf.description ?? "",
    coords: turf.coords ?? { lat: 23.8103, lng: 90.4125 },
    format: turf.format,
    city: turf.city ?? "",
    area: turf.area ?? "",
    address: turf.address ?? "",
    cancellationPolicy: turf.cancellationPolicy,
    cancellationPolicyConfig: (turf.cancellationPolicyConfig ?? undefined) as
      | TurfFormValues["cancellationPolicyConfig"]
      | undefined,
    facilities: (turf.facilities ?? {}) as TurfFormValues["facilities"],
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6 px-4 py-12">
      <nav className="flex items-center justify-between text-sm">
        <Link
          href="/turf-owner"
          className="text-muted-foreground hover:text-foreground"
        >
          ← {t("turfOwner.backToDashboard")}
        </Link>
        <div className="flex items-center gap-2">
          <Link
            href={`/turfs/${turf.slug}`}
            className="text-primary hover:underline"
          >
            {t("turfOwner.publicView")}
          </Link>
          {turf.isVerified ? (
            <StatusBadge status="success" showIcon={false}>
              {t("turfOwner.verified")}
            </StatusBadge>
          ) : (
            <StatusBadge status="warning" showIcon={false}>
              {t("turfOwner.pendingVerification")}
            </StatusBadge>
          )}
        </div>
      </nav>

      <h1 className="font-heading text-2xl font-semibold">{turf.name}</h1>

      <Tabs defaultValue="edit">
        <TabsList>
          <TabsTrigger value="edit">{t("turfOwner.tabDetails")}</TabsTrigger>
          <TabsTrigger value="slots">
            {t("turfOwner.tabSlots", { count: slots.length })}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="edit" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="font-heading text-lg">
                {t("turfOwner.turfDetails")}
              </CardTitle>
              <CardDescription>
                {t("turfOwner.detailsDesc")}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <TurfForm mode="edit" turfId={turf.id} defaultValues={formDefaults} />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="font-heading text-lg">
                {t("turfOwner.photos")}
              </CardTitle>
              <CardDescription>
                {t("turfOwner.photosDesc")}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <TurfPhotoGallery turfId={turf.id} photos={photos} />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="slots" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="font-heading text-lg">
                {t("turfOwner.generateAvailability")}
              </CardTitle>
              <CardDescription>
                {t("turfOwner.generateDesc")}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <GenerateSlotsForm turfId={turf.id} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="font-heading text-lg">
                {t("turfOwner.slotsNext14")}
              </CardTitle>
              <CardDescription>
                {t("turfOwner.slotsDesc")}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <SlotGrid turfId={turf.id} slots={slots} />
              <Button
                variant="ghost"
                size="sm"
                className="mt-4"
                render={<Link href="/turf-owner">{t("turfOwner.done")}</Link>}
              >
                {t("turfOwner.done")}
              </Button>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
