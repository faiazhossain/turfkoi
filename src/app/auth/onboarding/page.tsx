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
import { PositionPicker, SkillPicker } from "@/components/player/choice-picker"
import { StatusBadge } from "@/components/shared"
import { LocationPicker } from "@/components/map"
import { useI18n } from "@/i18n/client"
import { completeOnboardingAction, checkUsernameAvailableAction } from "@/features/auth/actions"
import {
  onboardingFormSchema,
  type OnboardingFormInput,
  type OnboardingFormValues,
} from "@/features/auth/schemas"

export default function OnboardingPage() {
  const router = useRouter()
  const { t } = useI18n()
  const [error, setError] = useState<string | null>(null)
  const form = useForm<OnboardingFormInput, unknown, OnboardingFormValues>({
    resolver: zodResolver(onboardingFormSchema),
    defaultValues: { name: "", username: "", position: "", skill: "", area: "" },
  })

  const usernameValue = form.watch("username") ?? ""

  // Player Network: live availability check once the format is plausible.
  async function checkUsernameAvailability() {
    const value = usernameValue.trim()
    if (!/^[a-zA-Z0-9_@]{3,21}$/.test(value)) return
    const res = await checkUsernameAvailableAction(value)
    if (!res.ok && res.error) {
      form.setError("username", { message: res.error })
    }
  }

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
            <div className="space-y-2">
              <Label htmlFor="username">{t("players.usernameLabel")}</Label>
              <Input
                id="username"
                autoComplete="off"
                placeholder="@rahim_10"
                {...form.register("username")}
                onBlur={(e) => {
                  form.register("username").onBlur(e)
                  checkUsernameAvailability()
                }}
              />
              {form.formState.errors.username && (
                <p className="text-sm text-destructive">
                  {t(form.formState.errors.username.message ?? "")}
                </p>
              )}
              <p className="text-xs text-muted-foreground">
                {t("players.onboardingUsernameHint")}
              </p>
            </div>
            <div className="space-y-2">
              <Label>{t("auth.positionLabel")}</Label>
              <PositionPicker
                name="position"
                value={(form.watch("position") as string | undefined) ?? ""}
                onChange={(v) =>
                  form.setValue("position", v, { shouldDirty: true })
                }
              />
            </div>
            <div className="space-y-2">
              <Label>{t("auth.skillLabel")}</Label>
              <SkillPicker
                name="skill"
                value={(form.watch("skill") as string | undefined) ?? ""}
                onChange={(v) =>
                  form.setValue("skill", v, { shouldDirty: true })
                }
              />
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
                  // A pick resolves the area — overwrite whatever was typed.
                  if (place?.name) {
                    form.setValue("area", place.name, { shouldDirty: true })
                  }
                }}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="area">{t("auth.areaLabel")}</Label>
              <Input id="area" placeholder={t("auth.areaPlaceholder")} {...form.register("area")} />
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
