"use client"

import { useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"

import { Button } from "@/components/ui/button"
import { Loader } from "@/components/ui/loader"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { StatusBadge } from "@/components/shared"
import {
  startRegistrationAction,
  verifyRegistrationAction,
} from "@/features/auth/actions"
import {
  registrationFormSchema,
  otpFormSchema,
  type RegistrationFormValues,
  type OtpFormValues,
} from "@/features/auth/schemas"

// Client-only: mirror of the server schema plus a confirm field. The server
// never sees confirmPassword.
const detailsSchema = z
  .object({
    ...registrationFormSchema.shape,
    confirmPassword: z.string(),
  })
  .refine((d) => d.password === d.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  })
type DetailsValues = z.infer<typeof detailsSchema>

const STEP1_REASONS: Record<string, string> = {
  phone_taken: "That phone number already has an account.",
  email_taken: "That email already has an account.",
  rate_limited: "Too many requests. Wait a minute and try again.",
}

const STEP2_REASONS: Record<string, string> = {
  invalid: "Wrong code. Try again.",
  consumed: "This code was already used. Request a new one.",
  expired: "That code expired. Request a new one.",
  locked: "Too many attempts. Try again in 15 minutes.",
  rate_limited: "Too many attempts. Slow down.",
  signin_failed: "Account created, but sign-in failed. Try signing in.",
  phone_taken: "That phone number was just registered. Sign in instead.",
  email_taken: "That email was just registered. Sign in instead.",
}

export default function RegisterPage() {
  const router = useRouter()
  const [step, setStep] = useState<"details" | "code">("details")
  const [details, setDetails] = useState<RegistrationFormValues | null>(null)
  const [step1Error, setStep1Error] = useState<string | null>(null)
  const [step2Error, setStep2Error] = useState<string | null>(null)

  const detailsForm = useForm<DetailsValues>({
    resolver: zodResolver(detailsSchema),
    defaultValues: { name: "", phone: "", email: "", password: "", confirmPassword: "" },
  })
  const codeForm = useForm<OtpFormValues>({
    resolver: zodResolver(otpFormSchema),
    defaultValues: { code: "" },
  })

  const isDev = process.env.NODE_ENV !== "production"

  async function submitDetails(values: DetailsValues) {
    setStep1Error(null)
    const payload: RegistrationFormValues = {
      name: values.name,
      phone: values.phone,
      email: values.email,
      password: values.password,
    }
    const result = await startRegistrationAction(payload)
    if (result.ok) {
      setDetails(payload)
      setStep("code")
      return
    }
    setStep1Error(STEP1_REASONS[result.reason] ?? result.reason)
  }

  async function submitCode(values: OtpFormValues) {
    setStep2Error(null)
    if (!details) {
      setStep("details")
      return
    }
    const result = await verifyRegistrationAction(details, values.code)
    if (result.ok) {
      // Always a fresh account: onboarding comes next.
      router.replace(result.home ?? "/auth/onboarding")
      return
    }
    setStep2Error(STEP2_REASONS[result.reason] ?? result.reason)
  }

  async function resendCode() {
    if (!details) return
    setStep2Error(null)
    const result = await startRegistrationAction(details)
    if (!result.ok) {
      setStep2Error(STEP1_REASONS[result.reason] ?? result.reason)
    }
  }

  return (
    <div className="mx-auto flex max-w-md flex-col gap-6 px-4 py-16">
      <Card>
        <CardHeader>
          <CardTitle className="font-heading text-2xl">
            {step === "details" ? "Create your account" : "Enter the code"}
          </CardTitle>
          <CardDescription>
            {step === "details"
              ? "Register with your phone and email. We send a verification code to your email."
              : (
                  <>
                    We sent a 6-digit code to{" "}
                    <span className="text-foreground">{details?.email}</span>.
                  </>
                )}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {step === "details" ? (
            <form onSubmit={detailsForm.handleSubmit(submitDetails)} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="name">Name</Label>
                <Input id="name" autoComplete="name" placeholder="Your name"
                  {...detailsForm.register("name")} />
                {detailsForm.formState.errors.name && (
                  <p className="text-sm text-destructive">
                    {detailsForm.formState.errors.name.message}
                  </p>
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="phone">Phone number</Label>
                <Input
                  id="phone"
                  inputMode="tel"
                  autoComplete="tel"
                  placeholder="01XXXXXXXXX"
                  {...detailsForm.register("phone")}
                />
                {detailsForm.formState.errors.phone && (
                  <p className="text-sm text-destructive">
                    {detailsForm.formState.errors.phone.message}
                  </p>
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  autoComplete="email"
                  placeholder="you@email.com"
                  {...detailsForm.register("email")}
                />
                {detailsForm.formState.errors.email && (
                  <p className="text-sm text-destructive">
                    {detailsForm.formState.errors.email.message}
                  </p>
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  type="password"
                  autoComplete="new-password"
                  placeholder="At least 8 characters"
                  {...detailsForm.register("password")}
                />
                {detailsForm.formState.errors.password && (
                  <p className="text-sm text-destructive">
                    {detailsForm.formState.errors.password.message}
                  </p>
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="confirmPassword">Confirm password</Label>
                <Input
                  id="confirmPassword"
                  type="password"
                  autoComplete="new-password"
                  {...detailsForm.register("confirmPassword")}
                />
                {detailsForm.formState.errors.confirmPassword && (
                  <p className="text-sm text-destructive">
                    {detailsForm.formState.errors.confirmPassword.message}
                  </p>
                )}
              </div>
              {step1Error && <StatusBadge status="danger">{step1Error}</StatusBadge>}
              <Button
                type="submit"
                size="lg"
                className="w-full"
                loading={detailsForm.formState.isSubmitting}
              >
                {detailsForm.formState.isSubmitting ? "Sending code..." : "Continue"}
              </Button>
            </form>
          ) : (
            <>
              {isDev && (
                <StatusBadge status="info">Dev mode: use code 123456</StatusBadge>
              )}
              <form onSubmit={codeForm.handleSubmit(submitCode)} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="code">Verification code</Label>
                  <Input
                    id="code"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    maxLength={6}
                    placeholder="000000"
                    className="text-center text-lg tracking-[0.5em]"
                    {...codeForm.register("code")}
                  />
                  {codeForm.formState.errors.code && (
                    <p className="text-sm text-destructive">
                      {codeForm.formState.errors.code.message}
                    </p>
                  )}
                </div>
                {step2Error && <StatusBadge status="danger">{step2Error}</StatusBadge>}
                <Button
                  type="submit"
                  size="lg"
                  className="w-full"
                  loading={codeForm.formState.isSubmitting}
                >
                  {codeForm.formState.isSubmitting ? "Verifying..." : "Verify and create account"}
                </Button>
              </form>
              <div className="flex items-center justify-between text-sm">
                <button
                  type="button"
                  onClick={() => setStep("details")}
                  className="text-muted-foreground hover:text-foreground"
                >
                  Change details
                </button>
                <button
                  type="button"
                  onClick={resendCode}
                  disabled={detailsForm.formState.isSubmitting}
                  className="text-muted-foreground hover:text-foreground"
                >
                  {detailsForm.formState.isSubmitting && (
                    <Loader size={14} className="size-3.5" aria-hidden />
                  )}
                  Resend code
                </button>
              </div>
            </>
          )}
        </CardContent>
      </Card>
      <p className="text-center text-sm text-muted-foreground">
        Already have an account?{" "}
        <Link href="/login" className="text-foreground underline-offset-4 hover:underline">
          Sign in
        </Link>
      </p>
    </div>
  )
}
