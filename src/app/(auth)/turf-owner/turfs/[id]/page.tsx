import Link from "next/link"
import { notFound, redirect } from "next/navigation"

import { getCurrentUser } from "@/lib/auth"
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
import { getTurfById, listTurfSlots } from "@/features/turfs/queries"
import type { TurfFormValues } from "@/features/turfs/schemas"

interface PageProps {
  params: Promise<{ id: string }>
}

export default async function EditTurfPage({ params }: PageProps) {
  const { id } = await params
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
    photos: turf.photos,
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6 px-4 py-12">
      <nav className="flex items-center justify-between text-sm">
        <Link
          href="/turf-owner"
          className="text-muted-foreground hover:text-foreground"
        >
          ← Back to dashboard
        </Link>
        <div className="flex items-center gap-2">
          <Link
            href={`/turfs/${turf.slug}`}
            className="text-primary hover:underline"
          >
            Public view
          </Link>
          {turf.isVerified ? (
            <StatusBadge status="success" showIcon={false}>
              Verified
            </StatusBadge>
          ) : (
            <StatusBadge status="warning" showIcon={false}>
              Pending verification
            </StatusBadge>
          )}
        </div>
      </nav>

      <h1 className="font-heading text-2xl font-semibold">{turf.name}</h1>

      <Tabs defaultValue="edit">
        <TabsList>
          <TabsTrigger value="edit">Details</TabsTrigger>
          <TabsTrigger value="slots">Slots ({slots.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="edit">
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
        </TabsContent>

        <TabsContent value="slots" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="font-heading text-lg">
                Generate availability
              </CardTitle>
              <CardDescription>
                Bulk-create slots across a date range. You can override
                individual slots below.
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
                immutable here — the booking flow owns them (Phase 3).
              </CardDescription>
            </CardHeader>
            <CardContent>
              <SlotGrid turfId={turf.id} slots={slots} />
              <Button
                variant="ghost"
                size="sm"
                className="mt-4"
                render={<Link href="/turf-owner">Done</Link>}
              >
                Done
              </Button>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
