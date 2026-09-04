import { z } from "zod"

import { POSITION_IDS, SKILL_IDS } from "@/features/player/positions"
import { RESERVED_USERNAMES, USERNAME_RE } from "@/features/player/username"

import { isValidPhone } from "./phone"

// Messages are dictionary keys (resolved client-side via useI18n).
export const registrationFormSchema = z.object({
  name: z
    .string()
    .min(2, "auth.errors.name_short")
    .max(60, "auth.errors.name_max"),
  // Validation only - callers normalize before use so form types stay simple.
  phone: z
    .string()
    .refine(isValidPhone, "auth.errors.phone_invalid"),
  email: z
    .string()
    .trim()
    .toLowerCase()
    .pipe(z.email("auth.errors.email_invalid")),
  password: z
    .string()
    .min(8, "auth.errors.password_min")
    .max(72, "auth.errors.password_max"),
})

export const loginFormSchema = z.object({
  identifier: z.string().min(3, "auth.errors.identifier_required"),
  password: z.string().min(1, "auth.errors.password_required"),
})

export const forgotPasswordFormSchema = z.object({
  email: z
    .string()
    .trim()
    .toLowerCase()
    .pipe(z.email("auth.errors.email_invalid")),
})

export const resetPasswordFormSchema = z.object({
  code: z.string().length(6, "auth.errors.otp_length"),
  password: z
    .string()
    .min(8, "auth.errors.password_min")
    .max(72, "auth.errors.password_max"),
})

export const otpFormSchema = z.object({
  code: z.string().length(6, "auth.errors.otp_length"),
})

// Settings → Security: password change (server re-verifies the current
// password against the stored hash).
export const changePasswordFormSchema = z
  .object({
    currentPassword: z.string().min(1, "auth.errors.password_required"),
    newPassword: z
      .string()
      .min(8, "auth.errors.password_min")
      .max(72, "auth.errors.password_max"),
    confirmPassword: z.string(),
  })
  .refine((d) => d.newPassword === d.confirmPassword, {
    message: "auth.passwordsNoMatch",
    path: ["confirmPassword"],
  })

// Settings → Security: phone change (authorized by an OTP over the verified
// email). Validation only — the action normalizes before the unique check.
export const changePhoneFormSchema = z.object({
  phone: z.string().refine(isValidPhone, "auth.errors.phone_invalid"),
})

export const onboardingFormSchema = z.object({
  name: z
    .string()
    .min(2, "auth.errors.name_short")
    .max(60, "auth.errors.name_max"),
  // Player Network handle: unique, lowercase [a-z0-9_] (Player Network spec).
  // Leading @ is tolerated; reserved handles are rejected.
  username: z
    .string()
    .transform((v) => v.trim().toLowerCase().replace(/^@/, ""))
    .refine((v) => USERNAME_RE.test(v), "auth.errors.usernameInvalid")
    .refine((v) => !RESERVED_USERNAMES.has(v), "auth.errors.usernameReserved"),
  // Canonical identity ids ("goalkeeper"…/"learning"…); "" (untouched
  // picker) is dropped so nothing stale is stored.
  position: z.preprocess(
    (v) => (v === "" ? undefined : v),
    z.enum(POSITION_IDS, "profile.errors.invalidPosition").optional()
  ),
  skill: z.preprocess(
    (v) => (v === "" ? undefined : v),
    z.enum(SKILL_IDS, "profile.errors.invalidSkill").optional()
  ),
  area: z.string().max(80).optional(),
  // SS32: map pin during onboarding powers nearby discovery. Rounded to
  // ~110m at write time (audit F7) — never store exact coords for players.
  coords: z
    .object({
      lat: z.number().min(-90).max(90),
      lng: z.number().min(-180).max(180),
    })
    .optional(),
})

export type RegistrationFormValues = z.input<typeof registrationFormSchema>
export type LoginFormValues = z.infer<typeof loginFormSchema>
export type ForgotPasswordFormValues = z.infer<typeof forgotPasswordFormSchema>
export type ResetPasswordFormValues = z.infer<typeof resetPasswordFormSchema>
export type OtpFormValues = z.infer<typeof otpFormSchema>
export type ChangePasswordFormValues = z.infer<typeof changePasswordFormSchema>
export type ChangePhoneFormValues = z.input<typeof changePhoneFormSchema>
/** Form-field (pre-transform) type — pickers submit "" until chosen. */
export type OnboardingFormInput = z.input<typeof onboardingFormSchema>
export type OnboardingFormValues = z.output<typeof onboardingFormSchema>
