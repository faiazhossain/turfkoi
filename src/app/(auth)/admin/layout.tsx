import { redirect } from "next/navigation"

import { EmptyState } from "@/components/shared"
import { AdminSubNav } from "@/components/admin"
import { getCurrentUser } from "@/lib/auth"

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const user = await getCurrentUser()
  if (!user) redirect("/login")
  if (!user.roles.includes("admin")) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-16">
        <EmptyState
          title="Not an admin"
          description="You need the admin role to view this page."
        />
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-12">
      <header className="mb-6">
        <h1 className="font-heading text-2xl font-semibold">Admin</h1>
        <p className="text-sm text-muted-foreground">
          Payouts, refunds, disputes, and oversight.
        </p>
      </header>
      <AdminSubNav />
      {children}
    </div>
  )
}
