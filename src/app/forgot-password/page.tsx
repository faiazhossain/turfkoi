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
import { useI18n } from "@/i18n/client"
import { reasonMessage } from "@/features/auth/reasons"
import { formatLockCountdown, useOtpLock } from "@/features/auth/use-otp-lock"
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
    message: "auth.passwordsNoMatch",
    path: ["confirmPassword"],
  })
type NewPasswordValues = z.infer<typeof newPasswordSchema>

export default function ForgotPasswordPage() {
  const router = useRouter()
  const { t, locale } = useI18n()
  const [step, setStep] = useState<"email" | "reset">("email")
  const [email, setEmail] = useState("")
  const [devNoAccount, setDevNoAccount] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const { locked, secondsLeft, start: startLock } = useOtpLock()

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
      setDevNoAccount(result.devNoAccount ?? false)
      setStep("reset")
      return
    }
    if (result.reason === "locked" && result.retryAfterSeconds) {
      // The lockout lives on the email server-side; restarting the flow with
      // the same address lands back here with the countdown still running.
      setEmail(values.email.toLowerCase())
      setStep("reset")
      startLock(result.retryAfterSeconds)
      return
    }
    setError(reasonMessage(t, result.reason))
  }

  async function submitReset(values: NewPasswordValues) {
    setError(null)
    if (locked) return
    const result = await resetPasswordAction(email, values.code, values.password)
    if (result.ok) {
      router.replace(result.home ?? "/login")
      return
    }
    if (result.reason === "locked" && result.retryAfterSeconds) {
      // Lockout: the reset form disables itself and counts down (below).
      startLock(result.retryAfterSeconds)
      return
    }
    setError(reasonMessage(t, result.reason))
  }

  return (
    <div className="mx-auto flex max-w-md flex-col gap-6 px-4 py-16">
      <Card>
        <CardHeader>
          <CardTitle className="font-heading text-2xl">
            {step === "email" ? t("auth.resetTitle") : t("auth.enterCodeTitle")}
          </CardTitle>
          <CardDescription>
            {step === "email" ? (
              t("auth.resetDesc")
            ) : (
              <>
                {t("auth.sentCodeResetTo", { email })}
              </>
            )}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {step === "email" ? (
            <form onSubmit={emailForm.handleSubmit(submitEmail)} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">{t("auth.emailLabel")}</Label>
                <Input
                  id="email"
                  type="email"
                  autoComplete="email"
                  placeholder="you@email.com"
                  {...emailForm.register("email")}
                />
                {emailForm.formState.errors.email && (
                  <p className="text-sm text-dt-red">
                    {t(emailForm.formState.errors.email.message ?? "")}
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
                {emailForm.formState.isSubmitting ? t("auth.sendingCode") : t("auth.sendCode")}
              </Button>
            </form>
          ) : (
            <>
              {isDev && (
                <StatusBadge status="info">{t("auth.devCodeHint")}</StatusBadge>
              )}
              {isDev && devNoAccount && (
                <StatusBadge status="warning">
                  {t("auth.devNoAccount", { email })}
                </StatusBadge>
              )}
              <form onSubmit={resetForm.handleSubmit(submitReset)} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="code">{t("auth.codeLabel")}</Label>
                  <Input
                    id="code"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    maxLength={6}
                    placeholder="000000"
                    className="text-center text-lg tracking-[0.5em]"
                    disabled={locked}
                    {...resetForm.register("code")}
                  />
                  {resetForm.formState.errors.code && (
                    <p className="text-sm text-dt-red">
                      {t(resetForm.formState.errors.code.message ?? "")}
                    </p>
                  )}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="password">{t("auth.newPassword")}</Label>
                  <Input
                    id="password"
                    type="password"
                    autoComplete="new-password"
                    placeholder={t("auth.passwordPlaceholder")}
                    {...resetForm.register("password")}
                  />
                  {resetForm.formState.errors.password && (
                    <p className="text-sm text-dt-red">
                      {t(resetForm.formState.errors.password.message ?? "")}
                    </p>
                  )}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="confirmPassword">{t("auth.confirmNewPassword")}</Label>
                  <Input
                    id="confirmPassword"
                    type="password"
                    autoComplete="new-password"
                    {...resetForm.register("confirmPassword")}
                  />
                  {resetForm.formState.errors.confirmPassword && (
                    <p className="text-sm text-dt-red">
                      {t(resetForm.formState.errors.confirmPassword.message ?? "")}
                    </p>
                  )}
                </div>
                {locked ? (
                  <StatusBadge status="danger">
                    {t("auth.errors.lockedRetry", {
                      time: formatLockCountdown(secondsLeft, locale),
                    })}
                  </StatusBadge>
                ) : (
                  error && <StatusBadge status="danger">{error}</StatusBadge>
                )}
                <Button
                  type="submit"
                  size="lg"
                  className="w-full"
                  disabled={locked}
                  loading={resetForm.formState.isSubmitting}
                >
                  {resetForm.formState.isSubmitting ? t("auth.saving") : t("auth.setNewPassword")}
                </Button>
              </form>
              <div className="text-center text-sm">
                <Link href="/forgot-password" className="text-dt-dim hover:text-dt-txt">
                  {t("auth.useDifferentEmail")}
                </Link>
              </div>
            </>
          )}
        </CardContent>
      </Card>
      <p className="text-center text-sm text-dt-dim">
        {t("auth.rememberedIt")}{" "}
        <Link href="/login" className="text-dt-txt underline-offset-4 hover:underline">
          {t("auth.backToSignIn")}
        </Link>
      </p>
    </div>
  )
}
