"use client"

import { useState } from "react"
import Link from "next/link"
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
import { OwnerHelpButton } from "@/components/auth/owner-help-button"
import { loginAction } from "@/features/auth/actions"
import { loginFormSchema, type LoginFormValues } from "@/features/auth/schemas"

const REASONS: Record<string, string> = {
  invalid_credentials: "Wrong phone/email or password.",
  rate_limited: "Too many attempts. Wait a few minutes and try again.",
  signin_failed: "Could not sign you in. Try again in a moment.",
}

export default function LoginPage() {
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const form = useForm<LoginFormValues>({
    resolver: zodResolver(loginFormSchema),
    defaultValues: { identifier: "", password: "" },
  })

  async function onSubmit(values: LoginFormValues) {
    setError(null)
    const result = await loginAction(values.identifier, values.password)
    if (result.ok) {
      router.replace(result.home ?? "/app")
      return
    }
    setError(REASONS[result.reason] ?? result.reason)
  }

  return (
    <div className="mx-auto flex max-w-md flex-col gap-6 px-4 py-16">
      <Card>
        <CardHeader>
          <CardTitle className="font-heading text-2xl">Sign in</CardTitle>
          <CardDescription>
            Use the phone number or email you registered with.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="identifier">Phone or email</Label>
              <Input
                id="identifier"
                autoComplete="username"
                placeholder="01XXXXXXXXX or you@email.com"
                {...form.register("identifier")}
              />
              {form.formState.errors.identifier && (
                <p className="text-sm text-destructive">
                  {form.formState.errors.identifier.message}
                </p>
              )}
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="password">Password</Label>
                <Link
                  href="/forgot-password"
                  className="text-xs text-muted-foreground hover:text-foreground"
                >
                  Forgot password?
                </Link>
              </div>
              <Input
                id="password"
                type="password"
                autoComplete="current-password"
                {...form.register("password")}
              />
              {form.formState.errors.password && (
                <p className="text-sm text-destructive">
                  {form.formState.errors.password.message}
                </p>
              )}
            </div>
            {error && <StatusBadge status="danger">{error}</StatusBadge>}
            <Button
              type="submit"
              size="lg"
              className="w-full"
              loading={form.formState.isSubmitting}
            >
              {form.formState.isSubmitting ? "Signing in..." : "Sign in"}
            </Button>
          </form>
        </CardContent>
      </Card>
      <p className="text-center text-sm text-muted-foreground">
        New here?{" "}
        <Link href="/register" className="text-foreground underline-offset-4 hover:underline">
          Create an account
        </Link>
      </p>
      <div className="text-center">
        <OwnerHelpButton />
      </div>
    </div>
  )
}
