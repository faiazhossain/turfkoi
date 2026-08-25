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
import { LocationPicker } from "@/components/map"
import { useI18n } from "@/i18n/client"
import { completeOnboardingAction } from "@/features/auth/actions"
import {
  onboardingFormSchema,
  type OnboardingFormValues,
} from "@/features/auth/schemas"

export default function OnboardingPage() {
  const router = useRouter()
  const { t } = useI18n()
  const [error, setError] = useState<string | null>(null)
  const form = useForm<OnboardingFormValues>({
    resolver: zodResolver(onboardingFormSchema),
    defaultValues: { name: "", position: "", skill: "", area: "" },
  })

  async function onSubmit(values: OnboardingFormValues) {
    setError(null)
    const result = await completeOnboardingAction(values)
    if (result.ok) {
      router.replace(result.home ?? "/app")
      router.refresh()
      return
    }
    setError(result.error ? t(result.error) : null)
  }

  return (
    <div className="mx-auto flex max-w-md flex-col gap-6 px-4 py-16">
      <Card>
        <CardHeader>
          <CardTitle className="font-heading text-2xl">{t("auth.onboardingTitle")}</CardTitle>
          <CardDescription>
            {t("auth.onboardingDesc")}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">{t("auth.displayName")}</Label>
              <Input id="name" autoComplete="name" {...form.register("name")} />
              {form.formState.errors.name && (
                <p className="text-sm text-destructive">
                  {t(form.formState.errors.name.message ?? "")}
                </p>
              )}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="position">{t("auth.positionLabel")}</Label>
                <Input id="position" placeholder={t("auth.positionPlaceholder")} {...form.register("position")} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="skill">{t("auth.skillLabel")}</Label>
                <Input id="skill" placeholder={t("auth.skillPlaceholder")} {...form.register("skill")} />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="area">{t("auth.areaLabel")}</Label>
              <Input id="area" placeholder={t("auth.areaPlaceholder")} {...form.register("area")} />
            </div>
            <div className="space-y-2">
              <Label>{t("auth.yourLocation")}</Label>
              <p className="text-xs text-muted-foreground">
                {t("auth.locationHelp")}
              </p>
              <LocationPicker
                value={form.watch("coords") ?? null}
                onChange={(point, place) => {
                  form.setValue("coords", point, { shouldDirty: true })
                  // Autofill area from the picked place unless already typed.
                  if (place?.name && !form.getValues("area")) {
                    form.setValue("area", place.name, { shouldDirty: true })
                  }
                }}
              />
            </div>
            {error && <StatusBadge status="danger">{error}</StatusBadge>}
            <Button
              type="submit"
              size="lg"
              className="w-full"
              loading={form.formState.isSubmitting}
            >
              {form.formState.isSubmitting ? t("auth.saving") : t("common.continue")}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
