import type { Translator } from "@/i18n/translate"

/**
 * Map an auth action `reason` to user-facing copy. Reasons are either
 * underscore codes ("phone_taken") that resolve into the auth.errors.*
 * namespace, or already-full dictionary keys from Zod schema messages
 * ("auth.errors.emailInvalid"). Unknown values pass through `t()`
 * untouched.
 */
export function reasonMessage(t: Translator, reason: string): string {
  return t(reason.includes(".") ? reason : `auth.errors.${reason}`)
}
