import type { Metadata } from "next"

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { TurfApplicationForm } from "@/components/turf-applications/turf-application-form"

export const metadata: Metadata = {
  title: "List your turf | Turfkoi",
  description:
    "Apply to list your turf on Turfkoi. We review every listing and send you a claim link to manage slots, pricing, and bookings.",
}

/**
 * Supply-side funnel entry (Option C): owners apply, admins approve, and the
 * existing turf-claims invite flow takes over from there.
 */
export default function OwnATurfPage() {
  return (
    <div className="mx-auto flex max-w-md flex-col gap-6 px-4 py-16">
      <Card>
        <CardHeader>
          <CardTitle className="font-heading text-2xl">List your turf</CardTitle>
          <CardDescription>
            Tell us about your turf. We review every listing by hand, then send
            you a claim link to set up slots, pricing, and photos — free.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <TurfApplicationForm />
        </CardContent>
      </Card>
    </div>
  )
}
