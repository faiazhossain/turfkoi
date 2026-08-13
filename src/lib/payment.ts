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

export interface PaymentProvider {
  createPayment(input: CreatePaymentInput): Promise<PaymentResult>
  /** H3: verify BOTH signature and source-IP allowlist. */
  verifyWebhook(
    payload: unknown,
    headers: Record<string, string>
  ): Promise<{ verified: boolean; providerReference?: string }>
}

/**
 * bKash provider (audit B6: MVP is bKash-only). The grant-token -> redirect ->
 * callback flow and webhook signature + IP allowlist (audit H3) are wired in
 * Phase 3 (Booking & payments).
 */
export const bkashProvider: PaymentProvider = {
  async createPayment() {
    throw new Error("bkashProvider.createPayment: not implemented (Phase 3)")
  },
  async verifyWebhook() {
    throw new Error("bkashProvider.verifyWebhook: not implemented (Phase 3)")
  },
}

export const providers: Record<PaymentProviderName, PaymentProvider> = {
  bkash: bkashProvider,
  nagad: bkashProvider, // Post-MVP
  card: bkashProvider, // Post-MVP
}
