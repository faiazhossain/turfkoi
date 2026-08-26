import { Resend } from "resend"

export interface EmailProvider {
  sendOtp(email: string, code: string): Promise<void>
  sendTurfClaimInvite(
    email: string,
    turfName: string,
    claimUrl: string,
    expiresAt: Date,
    otp?: string
  ): Promise<void>
}

/**
 * Mock provider. Logs the code instead of sending. Active whenever
 * RESEND_API_KEY is unset (dev, CI, tests) so local flows never need a real
 * send. In production without a key it throws - a silent no-op would trap
 * users in a register/reset loop they can never complete.
 */
export const mockEmailProvider: EmailProvider = {
  async sendOtp(email, code) {
    if (process.env.NODE_ENV !== "production") {
      console.info(`[mock-email] OTP for ${email}: ${code}`)
      return
    }
    throw new Error("[email] RESEND_API_KEY is not set - cannot send OTP")
  },
  async sendTurfClaimInvite(email, turfName, claimUrl, expiresAt, otp) {
    if (process.env.NODE_ENV !== "production") {
      console.info(
        `[mock-email] claim invite for ${email} (${turfName}): ${claimUrl}` +
          (otp ? ` code ${otp}` : "")
      )
      return
    }
    throw new Error("[email] RESEND_API_KEY is not set - cannot send claim invite")
  },
}

/**
 * Resend free tier (100 emails/day). OTP volume is registrations and password
 * resets only, well inside the free quota. The SDK returns { data, error }
 * rather than throwing, so check error explicitly.
 */
function resendEmailProvider(): EmailProvider {
  const client = new Resend(process.env.RESEND_API_KEY as string)
  const from = process.env.OTP_EMAIL_FROM ?? "DeshiTurf <onboarding@resend.dev>"
  return {
    async sendOtp(email, code) {
      const { error } = await client.emails.send({
        from,
        to: [email],
        subject: "Your DeshiTurf verification code",
        text: [
          `Your DeshiTurf code is ${code}.`,
          "It expires in 5 minutes.",
          "If you did not request it, you can ignore this email.",
        ].join(" "),
      })
      if (error) {
        throw new Error(`[email] resend send failed: ${error.message}`)
      }
    },
    async sendTurfClaimInvite(email, turfName, claimUrl, expiresAt, otp) {
      const { error } = await client.emails.send({
        from,
        to: [email],
        subject: `Claim your turf "${turfName}" on DeshiTurf`,
        text: [
          `You've been invited to manage "${turfName}" on DeshiTurf.`,
          `Open this link to claim it: ${claimUrl}`,
          ...(otp
            ? [`Your verification code is ${otp}.`]
            : []),
          `The link expires on ${expiresAt.toDateString()}.`,
          "If you weren't expecting this email, you can ignore it.",
        ].join("\n\n"),
      })
      if (error) {
        throw new Error(`[email] resend send failed: ${error.message}`)
      }
    },
  }
}

// Resend when configured, mock otherwise. Swap point if the provider changes;
// the OTP service only ever sees the EmailProvider interface.
export const emailProvider: EmailProvider = process.env.RESEND_API_KEY
  ? resendEmailProvider()
  : mockEmailProvider
