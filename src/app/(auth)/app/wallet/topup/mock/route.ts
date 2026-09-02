import { NextResponse } from "next/server"

import { confirmWalletTopUpAction } from "@/features/wallet/actions"

/**
 * Dev-only mock bKash confirmation for wallet top-ups (mirrors the booking
 * mock at /bookings/[id]/pay/mock): the paymentUrl returned by
 * initiateWalletTopUpAction points here, and a GET flips the pending entry
 * to success. Hard-blocked in production.
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

  const res = await confirmWalletTopUpAction(ref)

  const target = new URL("/app/wallet", url.origin)
  target.searchParams.set("topup", res.ok ? "success" : "failed")
  return NextResponse.redirect(target)
}
