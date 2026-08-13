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
  const status =
    url.searchParams.get("payment_status") ??
    url.searchParams.get("status") ??
    ""

  if (!bookingId) {
    return NextResponse.redirect(new URL("/app", url.origin))
  }

  const success =
    status === "Completed" || status === "completed" || status === "success"

  const target = new URL(`/bookings/${bookingId}`, url.origin)
  target.searchParams.set("payment", success ? "success" : "failed")
  return NextResponse.redirect(target)
}
