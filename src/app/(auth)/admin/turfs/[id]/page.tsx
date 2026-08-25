import Link from "next/link"
import { notFound } from "next/navigation"

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
          className="text-muted-foreground hover:text-foreground"
        >
          ← All turfs
        </Link>
        <div className="flex items-center gap-2">
          <Link
            href={`/turfs/${turf.slug}`}
            className="text-primary hover:underline"
          >
            Public view
          </Link>
          {turf.ownerId === null ? (
            <StatusBadge status="neutral" showIcon={false}>
              awaiting claim
            </StatusBadge>
          ) : turf.isVerified ? (
            <StatusBadge status="success" showIcon={false}>
              verified
            </StatusBadge>
          ) : (
            <StatusBadge status="warning" showIcon={false}>
              pending
            </StatusBadge>
          )}
          {!turf.isActive ? (
            <StatusBadge status="neutral" showIcon={false}>
              inactive
            </StatusBadge>
          ) : null}
        </div>
      </nav>

      <div>
        <h2 className="font-heading text-2xl font-semibold">{turf.name}</h2>
        <p className="text-sm text-muted-foreground">
          {[turf.area, turf.city].filter(Boolean).join(", ") || "Location TBD"}
          {" · "}
          {turfFormatLabel(turf.format)}
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="font-heading text-lg">
            Status and owner
          </CardTitle>
          <CardDescription>
            Verification and visibility apply to the public listing and the
            booking flow immediately.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="text-muted-foreground">Owner:</span>
            {ownerPhone ? (
              <span className="font-medium">{ownerPhone}</span>
            ) : (
              <span className="text-muted-foreground">
                No owner yet — invite below to hand it over.
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
          <TabsTrigger value="edit">Details</TabsTrigger>
          <TabsTrigger value="slots">Slots ({slots.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="edit" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="font-heading text-lg">
                Turf details
              </CardTitle>
              <CardDescription>
                Changes appear on the public page after saving.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <TurfForm mode="edit" turfId={turf.id} defaultValues={formDefaults} />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="font-heading text-lg">Photos</CardTitle>
              <CardDescription>
                Added photos appear immediately — no save needed.
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
                Generate availability
              </CardTitle>
              <CardDescription>
                Bulk-create slots across a date range. Individual slots can be
                overridden below.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <GenerateSlotsForm turfId={turf.id} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="font-heading text-lg">
                Slots · next 14 days
              </CardTitle>
              <CardDescription>
                Edit price or set maintenance / blocked. Booked slots are
                immutable here — the booking flow owns them.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <SlotGrid turfId={turf.id} slots={slots} />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <Card>
        <CardHeader>
          <CardTitle className="font-heading text-lg">Danger zone</CardTitle>
          <CardDescription>
            Deletion is permanent and blocked once a turf has bookings.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {bookingCount === 0 ? (
            <DeleteTurfControl turfId={turf.id} name={turf.name} />
          ) : (
            <p className="text-sm text-muted-foreground">
              This turf has {bookingCount} booking
              {bookingCount === 1 ? "" : "s"} — booking history can&apos;t be
              deleted. Deactivate the turf instead.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

export const dynamic = "force-dynamic"
