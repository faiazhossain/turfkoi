import { NextResponse } from "next/server"

import { confirmPaymentAction } from "@/features/bookings/actions"
import { db } from "@/db"
import { transactions } from "@/db/schema"
import { eq } from "drizzle-orm"

/**
 * Dev-only mock bKash confirmation. Mirrors the Phase 1 OTP mock pattern:
 * when bKash creds aren't configured, the payment URL returned by
 * `bkashProvider.createPayment` points here, and a GET (the user "clicking
 * confirm" in the mock checkout) flips the transaction to success.
 *
 * Hard-blocked in production — the route throws 404 if NODE_ENV is production.
 */
export const dynamic = "force-dynamic"

export async function GET(req: Request) {
  if (process.env.NODE_ENV === "production") {
    return new NextResponse("Not Found", { status: 404 })
  }

  const url = new URL(req.url)
  const ref = url.searchParams.get("ref")
  if (!ref) {
    return NextResponse.json({ error: "missing ref" }, { status: 400 })
  }

  // Confirm the transaction exists + is pending, then mark it success.
  const txn = await db
    .select({ bookingId: transactions.bookingId, status: transactions.status })
    .from(transactions)
    .where(eq(transactions.providerReference, ref))
    .limit(1)
  if (!txn[0]) {
    return NextResponse.json({ error: "unknown ref" }, { status: 404 })
  }

  await confirmPaymentAction(ref)

  // Redirect to the booking detail page with the success flag.
  const target = new URL(`/bookings/${txn[0].bookingId}`, url.origin)
  target.searchParams.set("payment", "success")
  return NextResponse.redirect(target)
}
