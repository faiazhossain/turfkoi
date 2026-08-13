import { NextResponse } from "next/server"

import { bkashProvider } from "@/lib/payment"
import { rateLimit } from "@/lib/ratelimit"
import { confirmPaymentAction } from "@/features/bookings/actions"

/**
 * bKash server-to-server webhook (H3: signature + IP allowlist).
 *
 * The verifier is in @/lib/payment. On verified + providerReference present,
 * we hand off to confirmPaymentAction — which is idempotent, so duplicate or
 * out-of-order webhooks collapse to a no-op.
 *
 * Rate-limited per source IP to blunt a flood of forged attempts.
 */
export async function POST(req: Request) {
  const raw = await req.text()
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    req.headers.get("x-real-ip") ??
    "unknown"

  const allowed = await rateLimit(`bkash:webhook:${ip}`, 30, 60)
  if (!allowed) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 })
  }

  const verified = await bkashProvider.verifyWebhook(
    raw,
    {
      "x-bkash-signature": req.headers.get("x-bkash-signature") ?? "",
      "x-signature": req.headers.get("x-signature") ?? "",
      "bkash-signature": req.headers.get("bkash-signature") ?? "",
    },
    ip
  )

  if (!verified.verified || !verified.providerReference) {
    return NextResponse.json({ error: "unverified" }, { status: 401 })
  }

  // Parse the body for status. bKash sends payment_status=Completed on success.
  let parsed: { providerReference?: string; status?: string; payment_status?: string }
  try {
    parsed = JSON.parse(raw)
  } catch {
    parsed = { providerReference: verified.providerReference }
  }

  const success =
    parsed.status === "success" ||
    parsed.payment_status === "Completed" ||
    parsed.payment_status === "completed"

  if (!success) {
    // Payment failed — the callback route will redirect to the retry screen.
    return NextResponse.json({ ok: true, status: "ignored" })
  }

  await confirmPaymentAction(verified.providerReference)
  return NextResponse.json({ ok: true })
}
