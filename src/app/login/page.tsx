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
import { useI18n } from "@/i18n/client"
import { reasonMessage } from "@/features/auth/reasons"
import { loginAction } from "@/features/auth/actions"
import { loginFormSchema, type LoginFormValues } from "@/features/auth/schemas"

export default function LoginPage() {
  const router = useRouter()
  const { t } = useI18n()
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
    setError(reasonMessage(t, result.reason))
  }

  return (
    <div className="mx-auto flex max-w-md flex-col gap-6 px-4 py-16">
      <Card>
        <CardHeader>
          <CardTitle className="font-heading text-2xl">{t("auth.signInTitle")}</CardTitle>
          <CardDescription>{t("auth.signInDesc")}</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="identifier">{t("auth.identifierLabel")}</Label>
              <Input
                id="identifier"
                autoComplete="username"
                placeholder={t("auth.identifierPlaceholder")}
                {...form.register("identifier")}
              />
              {form.formState.errors.identifier && (
                <p className="text-sm text-destructive">
                  {t(form.formState.errors.identifier.message ?? "")}
                </p>
              )}
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="password">{t("auth.passwordLabel")}</Label>
                <Link
                  href="/forgot-password"
                  className="text-xs text-muted-foreground hover:text-foreground"
                >
                  {t("auth.forgotPassword")}
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
                  {t(form.formState.errors.password.message ?? "")}
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
              {form.formState.isSubmitting ? t("auth.signingIn") : t("auth.signInTitle")}
            </Button>
          </form>
        </CardContent>
      </Card>
      <p className="text-center text-sm text-muted-foreground">
        {t("auth.newHere")}{" "}
        <Link href="/register" className="text-foreground underline-offset-4 hover:underline">
          {t("auth.createAccount")}
        </Link>
      </p>
      <div className="text-center">
        <OwnerHelpButton />
      </div>
    </div>
  )
}
