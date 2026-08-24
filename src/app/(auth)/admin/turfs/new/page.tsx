import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { SeedTurfForm } from "@/components/admin"

/**
 * Admin concierge onboarding: seed a basic turf listing now, invite the
 * real owner to claim and complete it later (see docs/FEATURES.md).
 */
export default function AdminSeedTurfPage() {
  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <h2 className="font-heading text-lg font-semibold">Seed a turf</h2>
      <Card>
        <CardHeader>
          <CardTitle className="font-heading text-base">Turf basics</CardTitle>
          <CardDescription>
            Capture just enough to identify the turf — the owner adds photos,
            slots, and pricing after claiming. Seeded turfs stay hidden from
            the public site until then.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <SeedTurfForm />
        </CardContent>
      </Card>
    </div>
  )
}
