"use server"

import { revalidatePath } from "next/cache"
import { headers } from "next/headers"
import { and, eq } from "drizzle-orm"

import { db } from "@/db"
import { isUniqueViolation } from "@/db/errors"
import { turfApplications, turfs, users } from "@/db/schema"
import { getCurrentUser } from "@/lib/auth"
import { rateLimit } from "@/lib/ratelimit"
import { createNotifications, notifyAdmins } from "@/features/notifications/create"

import {
  approveApplicationSchema,
  rejectApplicationSchema,
  turfApplicationSchema,
  type ApproveApplicationValues,
  type TurfApplicationValues,
} from "./schemas"

export type ActionResult =
  | { ok: true; id?: string }
  | { ok: false; error: string }

// Local mirror of the admin gate in features/admin/actions.ts ("use server"
// modules export only actions, so it can't be imported from there).
async function adminActor(): Promise<
  { ok: true; id: string } | { ok: false; error: string }
> {
  const user = await getCurrentUser()
  if (!user) return { ok: false, error: "You are not signed in." }
  if (!user.roles.includes("admin")) {
    return { ok: false, error: "Admins only." }
  }
  return { ok: true, id: user.id }
}

/**
 * Resolve who to notify about an application outcome: the signed-in
 * submitter if there was one, else an account matching the contact email.
 * Anonymous submitters with no matching account get the claim-invite email
 * path instead — returns null there.
 */
async function resolveApplicantRecipient(
  submittedBy: string | null,
  email: string | null
): Promise<string | null> {
  if (submittedBy) return submittedBy
  if (!email) return null
  const rows = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, email))
    .limit(1)
  return rows[0]?.id ?? null
}

/**
 * Public application submit. Rate-limited per IP (5/hour) since this needs
 * no account — enough for an eager owner, useless for a bot.
 */
export async function submitTurfApplicationAction(
  input: TurfApplicationValues
): Promise<ActionResult> {
  const parsed = turfApplicationSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid" }
  }

  const h = await headers()
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown"
  const allow = await rateLimit(`turf-application:ip:${ip}`, 5, 3600)
  if (!allow) {
    return {
      ok: false,
      error: "Too many applications. Try again later.",
    }
  }

  const { coords, ...rest } = parsed.data
  // Stamp the submitter when they're signed in so approve/reject can notify
  // them in-app (anonymous submissions still work — see the email fallback).
  const user = await getCurrentUser()
  const [created] = await db
    .insert(turfApplications)
    .values({ ...rest, coords: coords ?? null, submittedBy: user?.id ?? null })
    .returning({ id: turfApplications.id })

  // Surface the application in every admin's notification bell.
  await notifyAdmins({
    type: "turf_application.submitted",
    payload: {
      turfName: parsed.data.turfName,
      contactName: parsed.data.contactName,
      city: parsed.data.city ?? null,
    },
    entityType: "turf_application",
    entityId: created.id,
  })

  revalidatePath("/admin/applications")
  return { ok: true, id: created.id }
}

/**
 * Approve an application: seed the (unowned, unverified) turf from the
 * admin-verified values, then flip the application pending -> approved.
 * Like seedTurfAction, the turf stays invisible until the owner claims via
 * an invite (minted afterwards from the admin queue with InvitePanel).
 */
export async function approveTurfApplicationAction(
  input: ApproveApplicationValues
): Promise<ActionResult> {
  const parsed = approveApplicationSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid" }
  }
  const actor = await adminActor()
  if (!actor.ok) return actor

  const appRows = await db
    .select({
      id: turfApplications.id,
      status: turfApplications.status,
      submittedBy: turfApplications.submittedBy,
      email: turfApplications.email,
    })
    .from(turfApplications)
    .where(eq(turfApplications.id, parsed.data.applicationId))
    .limit(1)
  const app = appRows[0]
  if (!app) return { ok: false, error: "Application not found." }
  if (app.status !== "pending") {
    return { ok: false, error: "This application was already handled." }
  }

  const { applicationId, coords, ...turfValues } = parsed.data
  let turfId: string
  try {
    const [created] = await db
      .insert(turfs)
      .values({ ...turfValues, coords, ownerId: null, isVerified: false })
      .returning({ id: turfs.id })
    turfId = created.id
  } catch (err) {
    if (isUniqueViolation(err)) {
      return { ok: false, error: "That slug is already taken." }
    }
    throw err
  }

  // Conditional flip keeps a double-approve race from double-writing status
  // (a concurrently seeded duplicate turf would simply surface in /admin/turfs
  // as an unowned duplicate awaiting claim).
  const flipped = await db
    .update(turfApplications)
    .set({
      status: "approved",
      turfId,
      reviewedBy: actor.id,
      reviewedAt: new Date(),
    })
    .where(
      and(
        eq(turfApplications.id, applicationId),
        eq(turfApplications.status, "pending")
      )
    )
    .returning({ id: turfApplications.id })
  if (flipped.length === 0) {
    return { ok: false, error: "This application was already handled." }
  }

  // Tell the applicant the good news (in-app when we can resolve an account).
  const recipient = await resolveApplicantRecipient(app.submittedBy, app.email)
  if (recipient) {
    await createNotifications(
      {
        type: "turf_application.approved",
        payload: { turfName: parsed.data.name, slug: parsed.data.slug },
        entityType: "turf",
        entityId: turfId,
      },
      [recipient]
    )
  }

  revalidatePath("/admin/applications")
  revalidatePath("/admin/turfs")
  return { ok: true, id: turfId }
}

/**
 * Reject an application. Rows are kept (audit + re-contact later), just
 * marked rejected.
 */
export async function rejectTurfApplicationAction(input: {
  applicationId: string
}): Promise<ActionResult> {
  const parsed = rejectApplicationSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: "Invalid application." }
  const actor = await adminActor()
  if (!actor.ok) return actor

  const appRows = await db
    .select({
      id: turfApplications.id,
      status: turfApplications.status,
      turfName: turfApplications.turfName,
      submittedBy: turfApplications.submittedBy,
      email: turfApplications.email,
    })
    .from(turfApplications)
    .where(eq(turfApplications.id, parsed.data.applicationId))
    .limit(1)
  const app = appRows[0]
  if (!app) return { ok: false, error: "Application not found." }
  if (app.status !== "pending") {
    return { ok: false, error: "This application was already handled." }
  }

  const flipped = await db
    .update(turfApplications)
    .set({ status: "rejected", reviewedBy: actor.id, reviewedAt: new Date() })
    .where(
      and(
        eq(turfApplications.id, parsed.data.applicationId),
        eq(turfApplications.status, "pending")
      )
    )
    .returning({ id: turfApplications.id })
  if (flipped.length === 0) {
    return { ok: false, error: "This application was already handled." }
  }

  const recipient = await resolveApplicantRecipient(app.submittedBy, app.email)
  if (recipient) {
    await createNotifications(
      {
        type: "turf_application.rejected",
        payload: { turfName: app.turfName },
        entityType: "turf_application",
        entityId: app.id,
      },
      [recipient]
    )
  }

  revalidatePath("/admin/applications")
  return { ok: true }
}
