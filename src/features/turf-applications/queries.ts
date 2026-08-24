import "server-only"

import { desc, eq } from "drizzle-orm"

import { db } from "@/db"
import { turfApplications, turfs } from "@/db/schema"

export type ApplicationFilter = "pending" | "approved" | "rejected" | "all"

export async function listTurfApplications(filter: ApplicationFilter) {
  const base = db
    .select({
      id: turfApplications.id,
      turfName: turfApplications.turfName,
      contactName: turfApplications.contactName,
      phone: turfApplications.phone,
      email: turfApplications.email,
      city: turfApplications.city,
      area: turfApplications.area,
      address: turfApplications.address,
      notes: turfApplications.notes,
      coords: turfApplications.coords,
      status: turfApplications.status,
      turfId: turfApplications.turfId,
      turfSlug: turfs.slug,
      reviewedAt: turfApplications.reviewedAt,
      createdAt: turfApplications.createdAt,
    })
    .from(turfApplications)
    .leftJoin(turfs, eq(turfs.id, turfApplications.turfId))

  const rows =
    filter === "all"
      ? await base.orderBy(desc(turfApplications.createdAt))
      : await base
          .where(eq(turfApplications.status, filter))
          .orderBy(desc(turfApplications.createdAt))
  return rows
}
