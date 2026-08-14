"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"

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
import { verifyOtpAction } from "@/features/auth/actions"
import { otpFormSchema, type OtpFormValues } from "@/features/auth/schemas"

const REASONS: Record<string, string> = {
  invalid: "Wrong code. Try again.",
  consumed: "This code was already used. Request a new one.",
  expired: "That code expired. Request a new one.",
  locked: "Too many attempts. Try again in 15 minutes.",
  rate_limited: "Too many attempts. Slow down.",
  invalid_phone: "Phone issue. Start over.",
  signin_failed: "Could not sign you in. Try again in a moment.",
}

export function VerifyForm() {
  const router = useRouter()
  const params = useSearchParams()
  const phone = params.get("phone") ?? ""
  const [error, setError] = useState<string | null>(null)
  const form = useForm<OtpFormValues>({
    resolver: zodResolver(otpFormSchema),
    defaultValues: { code: "" },
  })

  useEffect(() => {
    if (!phone) router.replace("/login")
  }, [phone, router])

  async function onSubmit(values: OtpFormValues) {
    setError(null)
    const result = await verifyOtpAction(phone, values.code)
    if (result.ok) {
      // New users always complete onboarding first; returning users land on
      // their role-appropriate home (admin console / owner dashboard / app).
      router.replace(result.isNew ? "/auth/onboarding" : (result.home ?? "/app"))
      return
    }
    setError(REASONS[result.reason] ?? "Could not verify. Try again.")
  }

  if (!phone) return null

  const isDev = process.env.NODE_ENV !== "production"

  return (
    <div className="mx-auto flex max-w-md flex-col gap-6 px-4 py-16">
      <Card>
        <CardHeader>
          <CardTitle className="font-heading text-2xl">Enter the code</CardTitle>
          <CardDescription>
            We sent a 6-digit code to <span className="text-foreground">{phone}</span>.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {isDev && (
            <StatusBadge status="info">Dev mode: use code 123456</StatusBadge>
          )}
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="code">Verification code</Label>
              <Input
                id="code"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                placeholder="000000"
                className="text-center text-lg tracking-[0.5em]"
                {...form.register("code")}
              />
              {form.formState.errors.code && (
                <p className="text-sm text-destructive">
                  {form.formState.errors.code.message}
                </p>
              )}
            </div>
            {error && <StatusBadge status="danger">{error}</StatusBadge>}
            <Button
              type="submit"
              size="lg"
              className="w-full"
              disabled={form.formState.isSubmitting}
            >
              {form.formState.isSubmitting ? "Verifying..." : "Verify"}
            </Button>
          </form>
          <div className="text-center text-sm">
            <Link href="/login" className="text-muted-foreground hover:text-foreground">
              Change number
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
