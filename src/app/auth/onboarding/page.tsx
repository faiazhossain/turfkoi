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
import { completeOnboardingAction } from "@/features/auth/actions"
import {
  onboardingFormSchema,
  type OnboardingFormValues,
} from "@/features/auth/schemas"

export default function OnboardingPage() {
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const form = useForm<OnboardingFormValues>({
    resolver: zodResolver(onboardingFormSchema),
    defaultValues: { name: "", position: "", skill: "", area: "" },
  })

  async function onSubmit(values: OnboardingFormValues) {
    setError(null)
    const result = await completeOnboardingAction(values)
    if (result.ok) {
      router.replace("/app")
      router.refresh()
      return
    }
    setError(result.error)
  }

  return (
    <div className="mx-auto flex max-w-md flex-col gap-6 px-4 py-16">
      <Card>
        <CardHeader>
          <CardTitle className="font-heading text-2xl">Set up your profile</CardTitle>
          <CardDescription>
            A couple of details so teams and players can find you.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">Display name</Label>
              <Input id="name" autoComplete="name" {...form.register("name")} />
              {form.formState.errors.name && (
                <p className="text-sm text-destructive">
                  {form.formState.errors.name.message}
                </p>
              )}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="position">Position (optional)</Label>
                <Input id="position" placeholder="e.g. MID" {...form.register("position")} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="skill">Skill (optional)</Label>
                <Input id="skill" placeholder="e.g. Intermediate" {...form.register("skill")} />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="area">Area (optional)</Label>
              <Input id="area" placeholder="e.g. Dhanmondi, Dhaka" {...form.register("area")} />
            </div>
            {error && <StatusBadge status="danger">{error}</StatusBadge>}
            <Button
              type="submit"
              size="lg"
              className="w-full"
              loading={form.formState.isSubmitting}
            >
              {form.formState.isSubmitting ? "Saving..." : "Continue"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
