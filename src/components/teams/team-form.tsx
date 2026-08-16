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
          toast.error(res.error)
          return
        }
        toast.success("Team created.")
        router.push(`/team/${res.slug}`)
      } else if (mode === "edit" && teamId) {
        const res = await updateTeamAction(teamId, values)
        if (!res.ok) {
          toast.error(res.error)
          return
        }
        toast.success("Team updated.")
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
        <Label htmlFor="name">Team name</Label>
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
            {form.formState.errors.name.message}
          </p>
        ) : null}
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="slug">Slug</Label>
        <Input id="slug" {...form.register("slug")} />
        {form.formState.errors.slug ? (
          <p className="text-xs text-destructive">
            {form.formState.errors.slug.message}
          </p>
        ) : null}
        <p className="text-xs text-muted-foreground">
          URL: /team/{form.watch("slug") || "your-slug"}
        </p>
      </div>
      <Button type="submit" loading={pending}>
        {pending
          ? "Saving…"
          : mode === "create"
            ? "Create team"
            : "Save changes"}
      </Button>
    </form>
  )
}
