import Link from "next/link"
import { notFound } from "next/navigation"
import { AlertTriangleIcon } from "lucide-react"

import { StatusBadge } from "@/components/shared"
import {
  DeleteTurfControl,
  InvitePanel,
  OwnerLoginCodePanel,
  TurfActiveToggle,
  UnverifyTurfButton,
  VerifyTurfButton,
} from "@/components/admin"
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
import { GenerateSlotsForm, SlotGrid, TurfForm } from "@/components/turfs"
import { TurfPhotoGallery } from "@/components/turfs/turf-photo-gallery"
import { getTurfAdminDetail } from "@/features/admin/queries"
import { listTurfSlots, listTurfPhotos } from "@/features/turfs/queries"
import { turfFormatLabel } from "@/features/turfs/formats"
import type { TurfFormValues } from "@/features/turfs/schemas"
import { getT } from "@/i18n/server"

interface PageProps {
  params: Promise<{ id: string }>
}

/**
 * Admin turf cockpit: everything an admin can do to one turf on one page.
 * The admin layout gates this route; the edit/slot/photo actions all route
 * through can() with the turf's ownerId, which admins pass — so the shared
 * owner components are reused as-is.
 */
export default async function AdminTurfCockpitPage({ params }: PageProps) {
  const { id } = await params
  const t = await getT()
  const detail = await getTurfAdminDetail(id)
  if (!detail) notFound()
  const { turf, ownerPhone, bookingCount } = detail

  const today = new Date()
  const fromDate = today.toISOString().slice(0, 10)
  const toDate = new Date(today.getTime() + 14 * 86400000)
    .toISOString()
    .slice(0, 10)
  const [slots, photos] = await Promise.all([
    listTurfSlots(turf.id, { from: fromDate, to: toDate }),
    listTurfPhotos(turf.id),
  ])

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
    <div className="space-y-6">
      <nav className="flex flex-wrap items-center justify-between gap-2 text-sm">
        <Link
          href="/admin/turfs"
          className="text-dt-dim hover:text-dt-txt"
        >
          ← {t("admin.cockpit.allTurfs")}
        </Link>
        <div className="flex items-center gap-2">
          <Link
            href={`/turfs/${turf.slug}`}
            className="text-dt-green hover:underline"
          >
            {t("turfOwner.publicView")}
          </Link>
          {turf.ownerId === null ? (
            <StatusBadge status="neutral" showIcon={false}>
              {t("admin.turfs.badges.awaitingClaim")}
            </StatusBadge>
          ) : turf.isVerified ? (
            <StatusBadge status="success" showIcon={false}>
              {t("admin.turfs.badges.verified")}
            </StatusBadge>
          ) : (
            <StatusBadge status="warning" showIcon={false}>
              {t("admin.turfs.badges.pending")}
            </StatusBadge>
          )}
          {!turf.isActive ? (
            <StatusBadge status="neutral" showIcon={false}>
              {t("turfs.inactive")}
            </StatusBadge>
          ) : null}
        </div>
      </nav>

      <div>
        <h2 className="font-heading text-2xl font-semibold">{turf.name}</h2>
        <p className="text-sm text-dt-dim">
          {[turf.area, turf.city].filter(Boolean).join(", ") ||
            t("turfs.locationTbd")}
          {" · "}
          {turfFormatLabel(turf.format)}
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="font-heading text-lg">
            {t("admin.cockpit.statusAndOwner")}
          </CardTitle>
          <CardDescription>
            {t("admin.cockpit.statusDesc")}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="text-dt-dim">
              {t("admin.cockpit.ownerLabel")}
            </span>
            {ownerPhone ? (
              <span className="font-medium">{ownerPhone}</span>
            ) : (
              <span className="text-dt-dim">
                {t("admin.cockpit.noOwnerInvite")}
              </span>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-1">
            {turf.ownerId === null ? (
              <InvitePanel turfId={turf.id} defaultPhone="" />
            ) : !turf.isVerified ? (
              <VerifyTurfButton turfId={turf.id} />
            ) : (
              <UnverifyTurfButton turfId={turf.id} />
            )}
            <TurfActiveToggle turfId={turf.id} isActive={turf.isActive} />
          </div>
          {turf.ownerId !== null && ownerPhone ? (
            <OwnerLoginCodePanel turfId={turf.id} ownerPhone={ownerPhone} />
          ) : null}
        </CardContent>
      </Card>

      <Tabs defaultValue="edit">
        <TabsList>
          <TabsTrigger value="edit">{t("turfOwner.tabDetails")}</TabsTrigger>
          <TabsTrigger value="slots">
            {t("admin.cockpit.slotsCount", { count: slots.length })}
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
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <Card className="bg-destructive/10 ring-destructive/40">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 font-heading text-lg text-destructive">
            <AlertTriangleIcon className="size-4" aria-hidden />
            {t("admin.cockpit.dangerZone")}
          </CardTitle>
          <CardDescription>
            {t("admin.cockpit.dangerDesc")}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {bookingCount === 0 ? (
            <DeleteTurfControl turfId={turf.id} name={turf.name} />
          ) : (
            <p className="text-sm text-dt-dim">
              {t("admin.cockpit.bookingHistoryBlocked")}
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

export const dynamic = "force-dynamic"
