import Link from "next/link"

import { Input } from "@/components/ui/input"
import { StatusBadge } from "@/components/shared"
import { RoleToggle, UserStatusToggle } from "@/components/admin"
import { listUsers } from "@/features/admin/queries"
import type { userRole } from "@/db/schema"

type Role = (typeof userRole.enumValues)[number]
const ALL_ROLES: Role[] = ["admin", "turf_owner", "team_owner", "player"]

export default async function AdminUsersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>
}) {
  const { q } = await searchParams
  const users = await listUsers(q)

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-heading text-lg font-semibold">Users</h2>
        <form className="flex items-center gap-2">
          <Input
            name="q"
            defaultValue={q ?? ""}
            placeholder="Search by phone"
            className="w-56"
          />
          <button
            type="submit"
            className="rounded-lg border border-border px-3 py-1.5 text-sm font-medium hover:bg-muted"
          >
            Search
          </button>
        </form>
      </div>

      {users.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
          No users match.
        </p>
      ) : (
        <ul className="space-y-2">
          {users.map((u) => (
            <li
              key={u.id}
              className="flex flex-wrap items-start justify-between gap-3 rounded-lg border border-border bg-card p-4"
            >
              <div className="min-w-0">
                <p className="font-heading font-medium">
                  {u.name ?? "Unnamed"}
                  {u.status !== "active" ? (
                    <StatusBadge status="warning" showIcon={false} className="ml-2">
                      {u.status}
                    </StatusBadge>
                  ) : null}
                </p>
                <p className="font-mono text-xs text-muted-foreground">{u.phone}</p>
                {u.email ? (
                  <p className="text-xs text-muted-foreground">{u.email}</p>
                ) : null}
                <div className="mt-2 flex flex-wrap items-center gap-1">
                  {ALL_ROLES.map((role) => (
                    <RoleToggle
                      key={role}
                      userId={u.id}
                      role={role}
                      enabled={u.roles.includes(role)}
                    />
                  ))}
                </div>
              </div>
              <UserStatusToggle userId={u.id} status={u.status} />
            </li>
          ))}
        </ul>
      )}
      <p className="text-xs text-muted-foreground">
        <Link href="/admin" className="hover:underline">
          ← Back to overview
        </Link>
      </p>
    </div>
  )
}

export const dynamic = "force-dynamic"
