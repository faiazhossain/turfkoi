import type { Metadata } from "next"
import Link from "next/link"

import { Input } from "@/components/ui/input"
import { StatusBadge } from "@/components/shared"
import { RoleToggle, UserStatusToggle } from "@/components/admin"
import { listUsers } from "@/features/admin/queries"
import type { userRole } from "@/db/schema"
import { getT } from "@/i18n/server"
import { buildMetadata } from "@/i18n/metadata"

export async function generateMetadata(): Promise<Metadata> {
  return buildMetadata({ titleKey: "metadata.adminUsersTitle" })
}

type Role = (typeof userRole.enumValues)[number]
const ALL_ROLES: Role[] = ["admin", "turf_owner", "team_owner", "player"]

export default async function AdminUsersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>
}) {
  const t = await getT()
  const { q } = await searchParams
  const users = await listUsers(q)

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-heading text-lg font-semibold">{t("admin.users.title")}</h2>
        <form className="flex items-center gap-2">
          <Input
            name="q"
            defaultValue={q ?? ""}
            placeholder={t("admin.searchByPhone")}
            className="w-56"
          />
          <button
            type="submit"
            className="rounded-lg border border-dt-line px-3 py-1.5 text-sm font-medium hover:bg-dt-card2"
          >
            {t("common.search")}
          </button>
        </form>
      </div>

      {users.length === 0 ? (
        <p className="rounded-lg border border-dashed border-dt-line p-6 text-center text-sm text-dt-dim">
          {t("admin.users.empty")}
        </p>
      ) : (
        <ul className="space-y-2">
          {users.map((u) => (
            <li
              key={u.id}
              className="flex flex-wrap items-start justify-between gap-3 rounded-lg border border-dt-line bg-dt-card p-4"
            >
              <div className="min-w-0">
                <p className="font-heading font-medium">
                  {u.name ?? t("admin.users.unnamed")}
                  {u.status !== "active" ? (
                    <StatusBadge status="warning" showIcon={false} className="ml-2">
                      {t(`admin.users.status.${u.status}`)}
                    </StatusBadge>
                  ) : null}
                </p>
                <p className="font-mono text-xs text-dt-dim">{u.phone}</p>
                {u.email ? (
                  <p className="text-xs text-dt-dim">{u.email}</p>
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
      <p className="text-xs text-dt-dim">
        <Link href="/admin" className="hover:underline">
          {t("admin.backToOverview")}
        </Link>
      </p>
    </div>
  )
}

export const dynamic = "force-dynamic"
