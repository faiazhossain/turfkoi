"use client"

import { useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"

import { Button } from "@/components/ui/button"
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
  requestPasswordResetAction,
  resetPasswordAction,
} from "@/features/auth/actions"
import {
  forgotPasswordFormSchema,
  resetPasswordFormSchema,
  type ForgotPasswordFormValues,
} from "@/features/auth/schemas"

// Client-only mirror with a confirm field; the server never sees confirmPassword.
const newPasswordSchema = z
  .object({
    ...resetPasswordFormSchema.shape,
    confirmPassword: z.string(),
  })
  .refine((d) => d.password === d.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  })
type NewPasswordValues = z.infer<typeof newPasswordSchema>

const OTP_REASONS: Record<string, string> = {
  invalid: "Wrong code. Try again.",
  consumed: "This code was already used. Request a new one.",
  expired: "That code expired. Request a new one.",
  locked: "Too many attempts. Try again in 15 minutes.",
  rate_limited: "Too many attempts. Slow down.",
}

const EMAIL_REASONS: Record<string, string> = {
  rate_limited: "Too many requests. Wait a minute and try again.",
  send_failed: "Could not send the email right now. Please try again.",
}

export default function ForgotPasswordPage() {
  const router = useRouter()
  const [step, setStep] = useState<"email" | "reset">("email")
  const [email, setEmail] = useState("")
  const [error, setError] = useState<string | null>(null)

  const emailForm = useForm<ForgotPasswordFormValues>({
    resolver: zodResolver(forgotPasswordFormSchema),
    defaultValues: { email: "" },
  })
  const resetForm = useForm<NewPasswordValues>({
    resolver: zodResolver(newPasswordSchema),
    defaultValues: { code: "", password: "", confirmPassword: "" },
  })

  const isDev = process.env.NODE_ENV !== "production"

  async function submitEmail(values: ForgotPasswordFormValues) {
    setError(null)
    const result = await requestPasswordResetAction(values.email)
    if (result.ok) {
      setEmail(values.email.toLowerCase())
      setStep("reset")
      return
    }
    setError(EMAIL_REASONS[result.reason] ?? result.reason)
  }

  async function submitReset(values: NewPasswordValues) {
    setError(null)
    const result = await resetPasswordAction(email, values.code, values.password)
    if (result.ok) {
      router.replace(result.home ?? "/login")
      return
    }
    setError(OTP_REASONS[result.reason] ?? result.reason)
  }

  return (
    <div className="mx-auto flex max-w-md flex-col gap-6 px-4 py-16">
      <Card>
        <CardHeader>
          <CardTitle className="font-heading text-2xl">
            {step === "email" ? "Reset your password" : "Enter the code"}
          </CardTitle>
          <CardDescription>
            {step === "email"
              ? "Enter the email you registered with. If it has an account, we will send a verification code."
              : (
                  <>
                    We sent a 6-digit code to{" "}
                    <span className="text-foreground">{email}</span>. Enter it and
                    choose a new password.
                  </>
                )}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {step === "email" ? (
            <form onSubmit={emailForm.handleSubmit(submitEmail)} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  autoComplete="email"
                  placeholder="you@email.com"
                  {...emailForm.register("email")}
                />
                {emailForm.formState.errors.email && (
                  <p className="text-sm text-destructive">
                    {emailForm.formState.errors.email.message}
                  </p>
                )}
              </div>
              {error && <StatusBadge status="danger">{error}</StatusBadge>}
              <Button
                type="submit"
                size="lg"
                className="w-full"
                loading={emailForm.formState.isSubmitting}
              >
                {emailForm.formState.isSubmitting ? "Sending code..." : "Send code"}
              </Button>
            </form>
          ) : (
            <>
              {isDev && (
                <StatusBadge status="info">Dev mode: use code 123456</StatusBadge>
              )}
              <form onSubmit={resetForm.handleSubmit(submitReset)} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="code">Verification code</Label>
                  <Input
                    id="code"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    maxLength={6}
                    placeholder="000000"
                    className="text-center text-lg tracking-[0.5em]"
                    {...resetForm.register("code")}
                  />
                  {resetForm.formState.errors.code && (
                    <p className="text-sm text-destructive">
                      {resetForm.formState.errors.code.message}
                    </p>
                  )}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="password">New password</Label>
                  <Input
                    id="password"
                    type="password"
                    autoComplete="new-password"
                    placeholder="At least 8 characters"
                    {...resetForm.register("password")}
                  />
                  {resetForm.formState.errors.password && (
                    <p className="text-sm text-destructive">
                      {resetForm.formState.errors.password.message}
                    </p>
                  )}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="confirmPassword">Confirm new password</Label>
                  <Input
                    id="confirmPassword"
                    type="password"
                    autoComplete="new-password"
                    {...resetForm.register("confirmPassword")}
                  />
                  {resetForm.formState.errors.confirmPassword && (
                    <p className="text-sm text-destructive">
                      {resetForm.formState.errors.confirmPassword.message}
                    </p>
                  )}
                </div>
                {error && <StatusBadge status="danger">{error}</StatusBadge>}
                <Button
                  type="submit"
                  size="lg"
                  className="w-full"
                  loading={resetForm.formState.isSubmitting}
                >
                  {resetForm.formState.isSubmitting ? "Saving..." : "Set new password"}
                </Button>
              </form>
              <div className="text-center text-sm">
                <Link href="/forgot-password" className="text-muted-foreground hover:text-foreground">
                  Use a different email
                </Link>
              </div>
            </>
          )}
        </CardContent>
      </Card>
      <p className="text-center text-sm text-muted-foreground">
        Remembered it?{" "}
        <Link href="/login" className="text-foreground underline-offset-4 hover:underline">
          Back to sign in
        </Link>
      </p>
    </div>
  )
}
