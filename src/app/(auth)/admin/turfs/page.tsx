import type { Metadata } from "next"
import Link from "next/link"
import { PencilIcon } from "lucide-react"

import { StatusBadge } from "@/components/shared"
import { Button } from "@/components/ui/button"
import {
  InvitePanel,
  TurfActiveToggle,
  UnverifyTurfButton,
  VerifyTurfButton,
} from "@/components/admin"
import { listTurfsAdmin } from "@/features/admin/queries"
import { turfFormatLabel } from "@/features/turfs/formats"
import { getT } from "@/i18n/server"
import { buildMetadata } from "@/i18n/metadata"

export async function generateMetadata(): Promise<Metadata> {
  return buildMetadata({ titleKey: "metadata.adminTurfsTitle" })
}

export default async function AdminTurfsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: "pending" | "verified" | "awaiting" | "all" }>
}) {
  const t = await getT()
  const { status } = await searchParams
  const filter = status ?? "all"
  const turfs = await listTurfsAdmin(filter)

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-3">
          <h2 className="font-heading text-lg font-semibold">{t("admin.turfs.title")}</h2>
          <Link
            href="/admin/turfs/new"
            className="rounded-lg border border-border px-3 py-1.5 text-sm hover:bg-muted/50"
          >
            {t("admin.turfs.seedTurf")}
          </Link>
        </div>
        <div className="flex gap-1 text-sm">
          {(["all", "pending", "verified", "awaiting"] as const).map((f) => (
            <Link
              key={f}
              href={`/admin/turfs?status=${f}`}
              className={
                "rounded-lg border px-3 py-1.5 " +
                (filter === f
                  ? "border-border bg-muted text-foreground"
                  : "border-transparent text-muted-foreground hover:bg-muted/50")
              }
            >
              {t(`admin.turfs.filters.${f}`)}
            </Link>
          ))}
        </div>
      </div>

      {turfs.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
          {t("admin.turfs.empty")}
        </p>
      ) : (
        <ul className="space-y-2">
          {turfs.map((trf) => (
            <li
              key={trf.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-card p-4"
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <Link
                    href={`/admin/turfs/${trf.id}`}
                    className="truncate font-heading font-medium hover:underline"
                  >
                    {trf.name}
                  </Link>
                  <Link
                    href={`/turfs/${trf.slug}`}
                    className="text-xs text-muted-foreground hover:text-foreground hover:underline"
                  >
                    {t("admin.turfs.viewPublic")}
                  </Link>
                  {trf.ownerId === null ? (
                    <StatusBadge status="neutral" showIcon={false}>
                      {t("admin.turfs.badges.awaitingClaim")}
                    </StatusBadge>
                  ) : trf.isVerified ? (
                    <StatusBadge status="success" showIcon={false}>
                      {t("admin.turfs.badges.verified")}
                    </StatusBadge>
                  ) : (
                    <StatusBadge status="warning" showIcon={false}>
                      {t("admin.turfs.badges.pending")}
                    </StatusBadge>
                  )}
                  {!trf.isActive ? (
                    <StatusBadge status="neutral" showIcon={false}>
                      {t("turfs.inactive")}
                    </StatusBadge>
                  ) : null}
                </div>
                <p className="truncate text-xs text-muted-foreground">
                  {[trf.area, trf.city].filter(Boolean).join(", ") || t("turfs.locationTbd")}
                  {" · "}
                  {turfFormatLabel(trf.format)}
                  {" · "}
                  {trf.ownerId
                    ? t("admin.turfs.owner", { phone: trf.ownerPhone ?? "" })
                    : t("admin.turfs.noOwnerYet")}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-1">
                <Button
                  variant="ghost"
                  size="icon-xs"
                  aria-label={t("admin.turfs.editAria", { name: trf.name })}
                  title={t("admin.turfs.edit")}
                  render={<Link href={`/admin/turfs/${trf.id}`} />}
                >
                  <PencilIcon aria-hidden />
                </Button>
                {trf.ownerId === null ? (
                  <InvitePanel turfId={trf.id} defaultPhone={trf.applicantPhone ?? ""} />
                ) : !trf.isVerified ? (
                  <VerifyTurfButton turfId={trf.id} />
                ) : (
                  <UnverifyTurfButton turfId={trf.id} />
                )}
                <TurfActiveToggle turfId={trf.id} isActive={trf.isActive} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

export const dynamic = "force-dynamic"
