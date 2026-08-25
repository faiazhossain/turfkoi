import { z } from "zod"

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

export const onboardingFormSchema = z.object({
  name: z
    .string()
    .min(2, "auth.errors.name_short")
    .max(60, "auth.errors.name_max"),
  position: z.string().max(40).optional(),
  skill: z.string().max(40).optional(),
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
export type OnboardingFormValues = z.infer<typeof onboardingFormSchema>
