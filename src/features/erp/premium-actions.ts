"use server"

import { revalidatePath } from "next/cache"
import { and, eq } from "drizzle-orm"
import { z } from "zod"

import { db } from "@/db"
import { erpPremiumRequests } from "@/db/schema"
import { getCurrentUser } from "@/lib/auth"
import { can } from "@/lib/capabilities"
import { createNotifications } from "@/features/notifications/create"
import { confirmAsset } from "@/features/images/service"

import { planForMonths } from "./premium-plans"
import {
  getPendingPremiumRequest,
  grantPremium,
} from "./premium"

export type PremiumActionResult =
  | { ok: true }
  | { ok: false; error: string }

const requestSchema = z.object({
  months: z.coerce.number().int().refine(
    (m) => planForMonths(m) !== null,
    "erp.premium.invalidPlan"
  ),
  method: z.enum(["bkash", "nagad", "rocket"]),
  senderNumber: z
    .string()
    .regex(/^01\d{9}$/, "erp.premium.invalidSenderNumber"),
  transactionId: z.string().min(4).max(60),
  ownerNote: z.string().max(300).optional(),
  receiptPublicId: z
    .string()
    .regex(/^[a-zA-Z0-9/_-]+$/, "images.errors.invalidRef")
    .optional(),
})

/** Owner submits a payment claim. Amount is set SERVER-side from the plan —
 * the client never dictates money. Receipt asset is verified before persist. */
export async function createPremiumRequestAction(
  input: z.input<typeof requestSchema>
): Promise<PremiumActionResult> {
  const parsed = requestSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "errors.invalid" }
  }
  const user = await getCurrentUser()
  if (!user) return { ok: false, error: "errors.notSignedIn" }
  if (!can(user, "erp.read", { ownerId: user.id })) {
    return { ok: false, error: "errors.noPermission" }
  }

  const existing = await getPendingPremiumRequest(user.id)
  if (existing) return { ok: false, error: "erp.premium.pendingExists" }

  const plan = planForMonths(parsed.data.months)!

  // Receipt (optional): must exist in the owner's receipts folder.
  if (parsed.data.receiptPublicId) {
    const confirm = await confirmAsset(
      "receipt",
      user.id,
      parsed.data.receiptPublicId
    )
    if (!confirm.ok) return { ok: false, error: "erp.premium.receiptInvalid" }
  }

  await db.insert(erpPremiumRequests).values({
    ownerId: user.id,
    months: parsed.data.months,
    amount: plan.amountBdt.toFixed(2),
    method: parsed.data.method,
    senderNumber: parsed.data.senderNumber,
    transactionId: parsed.data.transactionId,
    receiptPublicId: parsed.data.receiptPublicId ?? null,
    ownerNote: parsed.data.ownerNote || null,
  })

  revalidatePath("/turf-owner/erp/premium")
  revalidatePath("/admin/erp-premium")
  return { ok: true }
}

const reviewSchema = z.object({
  id: z.string().uuid("errors.invalid"),
  approve: z.boolean(),
  rejectReason: z.string().max(300).optional(),
})

async function requireAdmin() {
  const user = await getCurrentUser()
  if (!user || !user.roles.includes("admin")) return null
  return user
}

/** Admin approves a payment claim → premium granted + owner notified. */
export async function reviewPremiumRequestAction(
  input: z.input<typeof reviewSchema>
): Promise<PremiumActionResult> {
  const parsed = reviewSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: "errors.invalid" }
  const admin = await requireAdmin()
  if (!admin) return { ok: false, error: "errors.noPermission" }
  if (!parsed.data.approve && !parsed.data.rejectReason) {
    return { ok: false, error: "erp.premium.rejectReasonRequired" }
  }

  const [request] = await db
    .select()
    .from(erpPremiumRequests)
    .where(
      and(
        eq(erpPremiumRequests.id, parsed.data.id),
        eq(erpPremiumRequests.status, "pending")
      )
    )
    .limit(1)
  if (!request) return { ok: false, error: "erp.premium.requestNotFound" }

  if (parsed.data.approve) {
    await grantPremium(request.ownerId, request.months, admin.id)
    await createNotifications(
      {
        type: "erp.premium_approved",
        payload: { months: request.months },
      },
      [request.ownerId]
    )
  } else {
    await createNotifications(
      {
        type: "erp.premium_rejected",
        payload: { reason: parsed.data.rejectReason ?? "" },
      },
      [request.ownerId]
    )
  }

  await db
    .update(erpPremiumRequests)
    .set({
      status: parsed.data.approve ? "approved" : "rejected",
      rejectReason: parsed.data.rejectReason ?? null,
      reviewedBy: admin.id,
      reviewedAt: new Date(),
    })
    .where(eq(erpPremiumRequests.id, request.id))

  revalidatePath("/admin/erp-premium")
  revalidatePath("/turf-owner/erp/premium")
  revalidatePath("/turf-owner/erp")
  return { ok: true }
}

const grantSchema = z.object({
  ownerId: z.string().uuid("errors.invalid"),
  months: z.coerce.number().int().min(1).max(36),
})

/** Admin manually grants/extends premium without a payment claim. */
export async function adminGrantPremiumAction(
  input: z.input<typeof grantSchema>
): Promise<PremiumActionResult> {
  const parsed = grantSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: "errors.invalid" }
  const admin = await requireAdmin()
  if (!admin) return { ok: false, error: "errors.noPermission" }

  const until = await grantPremium(parsed.data.ownerId, parsed.data.months, admin.id)
  await createNotifications(
    { type: "erp.premium_approved", payload: { months: parsed.data.months } },
    [parsed.data.ownerId]
  )
  revalidatePath("/admin/erp-premium")
  revalidatePath("/turf-owner/erp")
  void until
  return { ok: true }
}
