export interface SmsProvider {
  sendOtp(phone: string, code: string): Promise<void>
}

/**
 * Mock provider (audit Q3). Logs the code instead of sending. Swap for a BD SMS
 * gateway (SSL Wireless / Metoa / GreenWeb) before launch - the interface stays
 * the same, so the auth flow is untouched.
 */
export const mockSmsProvider: SmsProvider = {
  async sendOtp(phone, code) {
    if (process.env.NODE_ENV !== "production") {
      console.info(`[mock-sms] OTP for ${phone}: ${code}`)
    }
  },
}

// Real gateway is wired here when chosen (Phase 3+). Mock for MVP.
export const smsProvider: SmsProvider = mockSmsProvider
