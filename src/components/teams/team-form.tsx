"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { teamFormSchema, type TeamFormValues } from "@/features/teams/schemas"
import { createTeamAction, updateTeamAction } from "@/features/teams/actions"
import { useI18n, translateError, fieldError } from "@/i18n/client"

interface TeamFormProps {
  mode: "create" | "edit"
  teamId?: string
  initial?: { name: string; slug: string }
}

function slugify(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/[\s_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80)
}

export function TeamForm({ mode, teamId, initial }: TeamFormProps) {
  const router = useRouter()
  const { t } = useI18n()
  const [pending, setPending] = useState(false)

  const form = useForm<TeamFormValues>({
    resolver: zodResolver(teamFormSchema),
    defaultValues: initial ?? { name: "", slug: "" },
  })

  async function onSubmit(values: TeamFormValues) {
    setPending(true)
    try {
      if (mode === "create") {
        const res = await createTeamAction(values)
        if (!res.ok) {
          toast.error(translateError(res.error, t))
          return
        }
        toast.success(t("team.teamCreated"))
        router.push(`/team/${res.slug}`)
      } else if (mode === "edit" && teamId) {
        const res = await updateTeamAction(teamId, values)
        if (!res.ok) {
          toast.error(translateError(res.error, t))
          return
        }
        toast.success(t("team.teamUpdated"))
        router.push(`/team/${values.slug}`)
        router.refresh()
      }
    } finally {
      setPending(false)
    }
  }

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="name">{t("team.form.nameLabel")}</Label>
        <Input
          id="name"
          {...form.register("name")}
          onChange={(e) => {
            form.setValue("name", e.target.value)
            if (mode === "create") {
              form.setValue("slug", slugify(e.target.value))
            }
          }}
        />
        {form.formState.errors.name ? (
          <p className="text-xs text-destructive">
            {fieldError(form.formState.errors.name.message, t)}
          </p>
        ) : null}
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="slug">{t("team.form.slugLabel")}</Label>
        <Input id="slug" {...form.register("slug")} />
        {form.formState.errors.slug ? (
          <p className="text-xs text-destructive">
            {fieldError(form.formState.errors.slug.message, t)}
          </p>
        ) : null}
        <p className="text-xs text-muted-foreground">
          {t("team.form.urlHint", {
            slug: form.watch("slug") || t("team.form.slugPlaceholder"),
          })}
        </p>
      </div>
      <Button type="submit" loading={pending}>
        {pending
          ? t("team.form.saving")
          : mode === "create"
            ? t("team.createTeam")
            : t("common.saveChanges")}
      </Button>
    </form>
  )
}
