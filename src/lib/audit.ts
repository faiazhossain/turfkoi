import "server-only"

import { db } from "@/db"
import { auditLogs } from "@/db/schema"

/**
 * Append a row to the platform audit trail (`audit_logs`). Every admin money
 * decision (payment verify/reject, refund, claim decision, suspension,
 * dispute resolution, payout) should record who did what to which resource —
 * the table was built for exactly this but no platform code wrote to it.
 *
 * Best-effort by convention: callers fire-and-forget with `.catch(() => {})`
 * so a logging failure never blocks the financial action it describes.
 */
export async function logAudit(entry: {
  actorId: string | null
  action: string
  resourceType: string
  resourceId: string
  before?: unknown
  after?: unknown
}): Promise<void> {
  await db.insert(auditLogs).values({
    actorId: entry.actorId,
    action: entry.action,
    resourceType: entry.resourceType,
    resourceId: entry.resourceId,
    before: (entry.before ?? null) as never,
    after: (entry.after ?? null) as never,
  })
}
