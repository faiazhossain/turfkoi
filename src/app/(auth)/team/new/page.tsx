import Link from "next/link"
import { redirect } from "next/navigation"

import { getCurrentUser } from "@/lib/auth"
import { TeamForm } from "@/components/teams/team-form"

export default async function NewTeamPage() {
  const user = await getCurrentUser()
  if (!user) redirect("/login")

  return (
    <div className="mx-auto max-w-lg space-y-6 px-4 py-12">
      <nav className="text-sm text-muted-foreground">
        <Link href="/team" className="hover:text-foreground">
          Teams
        </Link>{" "}
        / <span className="text-foreground">New</span>
      </nav>
      <header>
        <h1 className="font-heading text-2xl font-semibold">Create a team</h1>
        <p className="text-sm text-muted-foreground">
          You&apos;ll be the team owner. You can transfer ownership later.
        </p>
      </header>
      <TeamForm mode="create" />
    </div>
  )
}
