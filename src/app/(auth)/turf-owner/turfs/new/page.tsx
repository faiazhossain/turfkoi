import { redirect } from "next/navigation"

import { getCurrentUser } from "@/lib/auth"
import { TurfForm } from "@/components/turfs"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"

export default async function NewTurfPage() {
  const user = await getCurrentUser()
  if (!user) redirect("/login")
  if (!user.roles.includes("turf_owner")) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-16">
        <p className="text-sm text-muted-foreground">
          You need the turf_owner role to create turfs.
        </p>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-12">
      <Card>
        <CardHeader>
          <CardTitle className="font-heading text-2xl">List a new turf</CardTitle>
          <CardDescription>
            Turfs are unverified until an admin approves them (SS35). Photos can
            be added after the turf is created.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <TurfForm mode="create" />
        </CardContent>
      </Card>
    </div>
  )
}
