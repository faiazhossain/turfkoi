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
  const { status } = await searchParams
  const txns = await listTransactionsAdmin({
    status: status === "failed" ? "failed" : status,
    limit: 100,
  })

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-heading text-lg font-semibold">Transactions</h2>
        <form className="flex items-center gap-2 text-sm">
          <select
            name="status"
            defaultValue={status ?? ""}
            className="rounded-lg border border-border bg-background px-2 py-1.5"
          >
            <option value="">All statuses</option>
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
                {s.replace(/_/g, " ")}
              </option>
            ))}
          </select>
          <button
            type="submit"
            className="rounded-lg border border-border px-3 py-1.5 font-medium hover:bg-muted"
          >
            Filter
          </button>
        </form>
      </div>
      {txns.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
          No transactions match.
        </p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Payer</TableHead>
              <TableHead>Amount</TableHead>
              <TableHead>Fee</TableHead>
              <TableHead>Provider</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Ref</TableHead>
              <TableHead>When</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {txns.map((t) => (
              <TableRow key={t.id}>
                <TableCell className="font-mono text-xs">{t.payerPhone}</TableCell>
                <TableCell className="tabular-nums">
                  ৳{Number(t.amount).toLocaleString()}
                </TableCell>
                <TableCell className="tabular-nums text-muted-foreground">
                  ৳{Number(t.platformFee).toLocaleString()}
                </TableCell>
                <TableCell className="text-xs">{t.provider}</TableCell>
                <TableCell>
                  <StatusBadge status={TONE[t.status] ?? "neutral"} showIcon={false}>
                    {t.status.replace(/_/g, " ")}
                  </StatusBadge>
                </TableCell>
                <TableCell className="font-mono text-xs text-muted-foreground">
                  {t.providerReference ?? "—"}
                </TableCell>
                <TableCell className="font-mono text-xs">
                  {t.createdAt.toISOString().slice(0, 16)}
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
