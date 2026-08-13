import { z } from "zod"

export const phoneFormSchema = z.object({
  phone: z.string().min(1, "Enter your phone number"),
})

export const otpFormSchema = z.object({
  code: z.string().length(6, "Enter the 6-digit code"),
})

export const onboardingFormSchema = z.object({
  name: z.string().min(2, "Name is too short").max(60),
  position: z.string().max(40).optional(),
  skill: z.string().max(40).optional(),
  area: z.string().max(80).optional(),
})

export type PhoneFormValues = z.infer<typeof phoneFormSchema>
export type OtpFormValues = z.infer<typeof otpFormSchema>
export type OnboardingFormValues = z.infer<typeof onboardingFormSchema>
