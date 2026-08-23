import { z } from "zod"

import { isValidPhone } from "./phone"

export const registrationFormSchema = z.object({
  name: z.string().min(2, "Name is too short").max(60),
  // Validation only - callers normalize before use so form types stay simple.
  phone: z
    .string()
    .refine(isValidPhone, "Enter a valid Bangladeshi number, e.g. 01XXXXXXXXX"),
  email: z
    .string()
    .trim()
    .toLowerCase()
    .pipe(z.email("Enter a valid email address")),
  password: z
    .string()
    .min(8, "Password must be at least 8 characters")
    .max(72, "Password is too long"),
})

export const loginFormSchema = z.object({
  identifier: z.string().min(3, "Enter your phone number or email"),
  password: z.string().min(1, "Enter your password"),
})

export const forgotPasswordFormSchema = z.object({
  email: z
    .string()
    .trim()
    .toLowerCase()
    .pipe(z.email("Enter a valid email address")),
})

export const resetPasswordFormSchema = z.object({
  code: z.string().length(6, "Enter the 6-digit code"),
  password: z
    .string()
    .min(8, "Password must be at least 8 characters")
    .max(72, "Password is too long"),
})

export const otpFormSchema = z.object({
  code: z.string().length(6, "Enter the 6-digit code"),
})

export const onboardingFormSchema = z.object({
  name: z.string().min(2, "Name is too short").max(60),
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
