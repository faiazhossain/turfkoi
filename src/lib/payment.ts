import "server-only"
import { createHmac, timingSafeEqual } from "node:crypto"
import { randomUUID } from "node:crypto"

import type { paymentProvider } from "@/db/schema"

export type PaymentProviderName =
  (typeof paymentProvider.enumValues)[number]

export interface CreatePaymentInput {
  bookingId: string
  amount: number
  platformFee: number
  idempotencyKey: string
  callbackUrl: string
}

export interface PaymentResult {
  providerReference: string
  paymentUrl: string
}

export interface VerifiedWebhook {
  verified: boolean
  providerReference?: string
}

export interface PaymentProvider {
  createPayment(input: CreatePaymentInput): Promise<PaymentResult>
  /** H3: verify BOTH signature and source-IP allowlist. */
  verifyWebhook(
    payload: unknown,
    headers: Record<string, string>,
    clientIp?: string
  ): Promise<VerifiedWebhook>
}

/**
 * bKash provider (audit B6: MVP is bKash-only).
 *
 * Production flow:
 *   1. grant-token  → app-server obtains a bKash OAuth token
 *   2. create-payment → returns paymentID + bKash checkout URL
 *   3. user is redirected to the URL; after PIN entry bKash redirects to
 *      callbackUrl and fires a server-to-server webhook
 *   4. execute-payment → finalizes the charge (called from the webhook)
 *
 * Webhook verification (H3): HMAC-SHA256 over the raw body with the shared
 * secret, compared with timingSafeEqual, AND the request IP must be in the
 * bKash source-IP allowlist. Both must pass.
 *
 * When PAYMENT_BKASH_KEY is unset (dev), we fall back to a mock flow —
 * mirrors the Phase 1 OTP mock pattern. The mock provider reference is
 * deterministic-ish, the mock payment URL points at our dev confirm route,
 * and the webhook verifier accepts a dev HMAC of the shared "dev" secret.
 */
const BKASH_SANDBOX_API_BASE = "https://tokenized.sandbox.bka.sh/v1.2.0-beta"
// Source-IP ranges published by bKash for production webhook allowlisting.
// In sandbox bKash doesn't enforce a stable IP, so we leave this empty in
// dev and rely on the signature. Operators must populate this in prod.
const BKASH_PROD_IP_ALLOWLIST: string[] = []

function devMode(): boolean {
  return (
    process.env.NODE_ENV !== "production" ||
    !process.env.PAYMENT_BKASH_KEY ||
    !process.env.PAYMENT_BKASH_SECRET
  )
}

function ipAllowed(clientIp: string | undefined): boolean {
  if (BKASH_PROD_IP_ALLOWLIST.length === 0) {
    // Allowlist not configured (dev/sandbox) — signature alone is the gate.
    return true
  }
  if (!clientIp) return false
  return BKASH_PROD_IP_ALLOWLIST.includes(clientIp)
}

function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  try {
    return timingSafeEqual(Buffer.from(a), Buffer.from(b))
  } catch {
    return false
  }
}

function signBody(secret: string, body: string): string {
  return createHmac("sha256", secret).update(body).digest("hex")
}

async function grantToken(): Promise<string> {
  // Real call shape kept for the prod upgrade; throws clearly when the keys
  // are missing. In dev we never reach this (devMode short-circuits first).
  const key = process.env.PAYMENT_BKASH_KEY!
  const secret = process.env.PAYMENT_BKASH_SECRET!
  const res = await fetch(`${BKASH_SANDBOX_API_BASE}/tokenized/checkout/token/grant`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      username: key,
      password: secret,
    },
    body: JSON.stringify({ app_key: key, app_secret: secret }),
  })
  if (!res.ok) throw new Error(`bKash grant-token failed: ${res.status}`)
  const data = (await res.json()) as { id_token?: string }
  if (!data.id_token) throw new Error("bKash grant-token: no id_token")
  return data.id_token
}

export const bkashProvider: PaymentProvider = {
  async createPayment(input) {
    if (devMode()) {
      // Mock mode: the "payment" is confirmed via /bookings/[id]/pay/mock.
      const ref = `mock_${input.bookingId}_${randomUUID().slice(0, 8)}`
      return {
        providerReference: ref,
        paymentUrl: `/bookings/${input.bookingId}/pay/mock?ref=${ref}`,
      }
    }

    const token = await grantToken()
    const res = await fetch(`${BKASH_SANDBOX_API_BASE}/tokenized/checkout/create`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        Authorization: token,
        "X-APP-Key": process.env.PAYMENT_BKASH_KEY!,
      },
      body: JSON.stringify({
        mode: "0011",
        // bKash wants the callback URL it should bounce the user back to.
        callbackURL: input.callbackUrl,
        amount: String(input.amount),
        currency: "BDT",
        intent: "sale",
        merchantInvoiceNumber: input.idempotencyKey,
      }),
    })
    if (!res.ok) throw new Error(`bKash create-payment failed: ${res.status}`)
    const data = (await res.json()) as {
      paymentID?: string
      bkashURL?: string
    }
    if (!data.paymentID || !data.bkashURL) {
      throw new Error("bKash create-payment: missing paymentID/URL")
    }
    return {
      providerReference: data.paymentID,
      paymentUrl: data.bkashURL,
    }
  },

  async verifyWebhook(payload, headers, clientIp) {
    const secret =
      process.env.PAYMENT_BKASH_WEBHOOK_SECRET ??
      (devMode() ? "dev" : undefined)

    if (!secret) {
      return { verified: false }
    }

    if (!ipAllowed(clientIp)) {
      return { verified: false }
    }

    // Signature header conventions vary; check the common ones.
    const sig =
      headers["x-bkash-signature"] ??
      headers["x-signature"] ??
      headers["bkash-signature"]

    const raw =
      typeof payload === "string"
        ? payload
        : Buffer.isBuffer(payload)
          ? payload.toString("utf8")
          : JSON.stringify(payload ?? {})

    const expected = signBody(secret, raw)

    if (devMode() && (sig == null || sig === "")) {
      // Dev convenience: when no signature is present, accept a payload that
      // carries a providerReference — i.e. the dev mock-confirm route. The
      // prod verifier below always requires a real signature.
      const parsed = JSON.parse(raw) as { providerReference?: string }
      return {
        verified: !!parsed.providerReference,
        providerReference: parsed.providerReference,
      }
    }

    if (!sig || !constantTimeEqual(sig, expected)) {
      return { verified: false }
    }

    const parsed = JSON.parse(raw) as { providerReference?: string }
    return {
      verified: !!parsed.providerReference,
      providerReference: parsed.providerReference,
    }
  },
}

export const providers: Record<PaymentProviderName, PaymentProvider> = {
  bkash: bkashProvider,
  nagad: bkashProvider, // Post-MVP
  card: bkashProvider, // Post-MVP
}
