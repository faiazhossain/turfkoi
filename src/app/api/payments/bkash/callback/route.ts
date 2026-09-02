import { NextResponse } from "next/server"

/**
 * User-facing redirect target after the user completes (or abandons) the bKash
 * checkout. The server-to-server webhook is the source of truth for state
 * transitions; this route only decides where to send the user next.
 *
 * bKash appends `payment_status` (or `status`) + `paymentID` to the callback
 * URL. We map that to a query flag on the booking detail page.
 */
export async function GET(req: Request) {
  const url = new URL(req.url)
  const bookingId = url.searchParams.get("bookingId")
  const purpose = url.searchParams.get("purpose")
  const status =
    url.searchParams.get("payment_status") ??
    url.searchParams.get("status") ??
    ""

  const success =
    status === "Completed" || status === "completed" || status === "success"

  // Wallet top-ups bounce back to the wallet page, not a booking.
  if (purpose === "wallet") {
    const target = new URL("/app/wallet", url.origin)
    target.searchParams.set("topup", success ? "success" : "failed")
    return NextResponse.redirect(target)
  }

  if (!bookingId) {
    return NextResponse.redirect(new URL("/app", url.origin))
  }

  const target = new URL(`/bookings/${bookingId}`, url.origin)
  target.searchParams.set("payment", success ? "success" : "failed")
  return NextResponse.redirect(target)
}
