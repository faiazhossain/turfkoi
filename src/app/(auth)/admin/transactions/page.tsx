import type { Metadata } from "next"

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { StatusBadge } from "@/components/shared"
import { listTransactionsAdmin } from "@/features/admin/queries"
import { getT } from "@/i18n/server"
import { buildMetadata } from "@/i18n/metadata"

export async function generateMetadata(): Promise<Metadata> {
  return buildMetadata({ titleKey: "metadata.adminTransactionsTitle" })
}

const TONE: Record<string, "success" | "warning" | "neutral" | "danger" | "info"> = {
  created: "neutral",
  pending: "warning",
  success: "success",
  failed: "danger",
  cancelled: "neutral",
  refunded: "neutral",
  partially_refunded: "info",
}

export default async function AdminTransactionsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>
}) {
  const t = await getT()
  const { status } = await searchParams
  const txns = await listTransactionsAdmin({
    status: status === "failed" ? "failed" : status,
    limit: 100,
  })

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-heading text-lg font-semibold">{t("admin.txns.title")}</h2>
        <form className="flex items-center gap-2 text-sm">
          <select
            name="status"
            defaultValue={status ?? ""}
            className="rounded-lg border border-dt-line bg-dt-bg px-2 py-1.5"
          >
            <option value="">{t("admin.allStatuses")}</option>
            {[
              "created",
              "pending",
              "success",
              "failed",
              "cancelled",
              "refunded",
              "partially_refunded",
            ].map((s) => (
              <option key={s} value={s}>
                {t(`admin.txns.status.${s}`)}
              </option>
            ))}
          </select>
          <button
            type="submit"
            className="rounded-lg border border-dt-line px-3 py-1.5 font-medium hover:bg-dt-card2"
          >
            {t("admin.filter")}
          </button>
        </form>
      </div>
      {txns.length === 0 ? (
        <p className="rounded-lg border border-dashed border-dt-line p-6 text-center text-sm text-dt-dim">
          {t("admin.txns.empty")}
        </p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("admin.txns.colPayer")}</TableHead>
              <TableHead>{t("admin.txns.colAmount")}</TableHead>
              <TableHead>{t("admin.txns.colFee")}</TableHead>
              <TableHead>{t("admin.txns.colProvider")}</TableHead>
              <TableHead>{t("admin.txns.colStatus")}</TableHead>
              <TableHead>{t("admin.txns.colRef")}</TableHead>
              <TableHead>{t("admin.txns.colWhen")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {txns.map((txn) => (
              <TableRow key={txn.id}>
                <TableCell className="font-mono text-xs">{txn.payerPhone}</TableCell>
                <TableCell className="tabular-nums">
                  ৳{Number(txn.amount).toLocaleString()}
                </TableCell>
                <TableCell className="tabular-nums text-dt-dim">
                  ৳{Number(txn.platformFee).toLocaleString()}
                </TableCell>
                <TableCell className="text-xs">{txn.provider}</TableCell>
                <TableCell>
                  <StatusBadge status={TONE[txn.status] ?? "neutral"} showIcon={false}>
                    {t(`admin.txns.status.${txn.status}`)}
                  </StatusBadge>
                </TableCell>
                <TableCell className="font-mono text-xs text-dt-dim">
                  {txn.providerReference ?? "—"}
                </TableCell>
                <TableCell className="font-mono text-xs">
                  {txn.createdAt.toISOString().slice(0, 16)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  )
}

export const dynamic = "force-dynamic"
