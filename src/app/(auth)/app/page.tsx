import Link from "next/link"
import { CalendarDaysIcon } from "lucide-react"

import { getSession } from "@/lib/auth"
import { SignOutButton } from "@/components/auth/sign-out-button"
import { EmptyState, StatusBadge } from "@/components/shared"
import { listMyBookings } from "@/features/bookings/queries"

const STATUS_TONE: Record<string, "success" | "warning" | "neutral"> = {
  held: "warning",
  payment_pending: "warning",
  confirmed: "success",
  completed: "success",
  cancelled: "neutral",
  expired: "neutral",
  refunded: "neutral",
}

export default async function PlayerDashboardPage() {
  const session = await getSession()
  // Middleware redirects unauthenticated users to /login.
  if (!session?.user) return null

  const bookings = await listMyBookings(session.user.id, 10)

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

      <section className="space-y-3">
        <h2 className="font-heading text-lg font-semibold">Your bookings</h2>
        {bookings.length === 0 ? (
          <EmptyState
            icon={CalendarDaysIcon}
            title="No bookings yet"
            description="Browse turfs and book a slot to get started."
            action={
              <Link
                href="/turfs"
                className="text-sm font-medium text-primary hover:underline"
              >
                Find a turf →
              </Link>
            }
          />
        ) : (
          <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border">
            {bookings.map((b) => {
              const tone = STATUS_TONE[b.status] ?? "neutral"
              return (
                <li key={b.id}>
                  <Link
                    href={`/bookings/${b.id}`}
                    className="flex items-center justify-between gap-2 bg-card p-3 text-sm hover:bg-muted/40"
                  >
                    <div className="min-w-0">
                      <p className="truncate font-heading font-medium">
                        {b.turfName}
                      </p>
                      <p className="font-mono text-xs text-muted-foreground">
                        {b.date} · {b.slotStart.slice(0, 5)}–{b.slotEnd.slice(0, 5)}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      {b.totalAmount ? (
                        <span className="tabular-nums text-muted-foreground">
                          ৳{Number(b.totalAmount).toLocaleString()}
                        </span>
                      ) : null}
                      <StatusBadge status={tone} showIcon={false}>
                        {b.status.replace(/_/g, " ")}
                      </StatusBadge>
                    </div>
                  </Link>
                </li>
              )
            })}
          </ul>
        )}
      </section>

      <EmptyState
        title="Your matches will appear here"
        description="Nearby games, teams needing players, and your match history arrive in Phase 6 (Player matchmaking)."
      />
    </div>
  )
}
