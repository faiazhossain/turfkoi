import { getSession } from "@/lib/auth"
import { SignOutButton } from "@/components/auth/sign-out-button"
import { EmptyState, StatusBadge } from "@/components/shared"

export default async function PlayerDashboardPage() {
  const session = await getSession()
  // Middleware redirects unauthenticated users to /login.
  if (!session?.user) return null

  return (
    <div className="mx-auto max-w-6xl space-y-6 px-4 py-16">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-heading text-2xl font-semibold">Player dashboard</h1>
          <p className="text-sm text-muted-foreground">{session.user.phone}</p>
        </div>
        <div className="flex items-center gap-2">
          {session.user.name ? (
            <StatusBadge status="success">Signed in</StatusBadge>
          ) : (
            <StatusBadge status="warning">Complete your profile</StatusBadge>
          )}
          <SignOutButton />
        </div>
      </div>
      <EmptyState
        title="Your matches will appear here"
        description="Nearby games, teams needing players, and your match history arrive in Phase 6 (Player matchmaking)."
      />
    </div>
  )
}
