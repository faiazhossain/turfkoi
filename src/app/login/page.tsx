"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
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
import { normalizePhone } from "@/features/auth/phone"
import { sendOtpAction } from "@/features/auth/actions"
import { phoneFormSchema, type PhoneFormValues } from "@/features/auth/schemas"

const REASONS: Record<string, string> = {
  invalid_phone: "Enter a valid Bangladeshi number, e.g. 01XXXXXXXXX.",
  rate_limited: "Too many requests. Wait a minute and try again.",
}

export default function LoginPage() {
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const form = useForm<PhoneFormValues>({
    resolver: zodResolver(phoneFormSchema),
    defaultValues: { phone: "" },
  })

  async function onSubmit(values: PhoneFormValues) {
    setError(null)
    const result = await sendOtpAction(values.phone)
    if (result.ok) {
      router.push(`/auth/verify?phone=${encodeURIComponent(normalizePhone(values.phone))}`)
      return
    }
    setError(REASONS[result.reason] ?? "Could not send the code. Try again.")
  }

  return (
    <div className="mx-auto flex max-w-md flex-col gap-6 px-4 py-16">
      <Card>
        <CardHeader>
          <CardTitle className="font-heading text-2xl">Sign in</CardTitle>
          <CardDescription>
            Enter your phone number and we will send you a verification code.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="phone">Phone number</Label>
              <Input
                id="phone"
                inputMode="tel"
                autoComplete="tel"
                placeholder="01XXXXXXXXX"
                {...form.register("phone")}
              />
              {form.formState.errors.phone && (
                <p className="text-sm text-destructive">
                  {form.formState.errors.phone.message}
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
              {form.formState.isSubmitting ? "Sending..." : "Send code"}
            </Button>
          </form>
        </CardContent>
      </Card>
      <p className="text-center text-sm text-muted-foreground">
        New here? We will set up your profile after you verify.
      </p>
    </div>
  )
}
