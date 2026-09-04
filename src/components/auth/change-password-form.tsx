"use client"

import { useRouter } from "next/navigation"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { StatusBadge } from "@/components/shared"
import { useI18n } from "@/i18n/client"
import { changePasswordAction } from "@/features/auth/actions"
import {
  changePasswordFormSchema,
  type ChangePasswordFormValues,
} from "@/features/auth/schemas"

export function ChangePasswordForm() {
  const router = useRouter()
  const { t } = useI18n()
  const form = useForm<ChangePasswordFormValues>({
    resolver: zodResolver(changePasswordFormSchema),
    defaultValues: { currentPassword: "", newPassword: "", confirmPassword: "" },
  })

  async function onSubmit(values: ChangePasswordFormValues) {
    const result = await changePasswordAction(
      values.currentPassword,
      values.newPassword,
      values.confirmPassword
    )
    if (result.ok) {
      toast.success(t("settings.changePasswordSuccess"))
      form.reset()
      router.refresh()
      return
    }
    form.setError("root", { message: result.reason ?? "errors.generic" })
  }

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-3">
      <div className="space-y-2">
        <Label htmlFor="currentPassword">{t("settings.currentPassword")}</Label>
        <Input
          id="currentPassword"
          type="password"
          autoComplete="current-password"
          {...form.register("currentPassword")}
        />
        {form.formState.errors.currentPassword && (
          <p className="text-sm text-dt-red">
            {t(form.formState.errors.currentPassword.message ?? "")}
          </p>
        )}
      </div>
      <div className="space-y-2">
        <Label htmlFor="newPassword">{t("reset.newPassword")}</Label>
        <Input
          id="newPassword"
          type="password"
          autoComplete="new-password"
          {...form.register("newPassword")}
        />
        {form.formState.errors.newPassword && (
          <p className="text-sm text-dt-red">
            {t(form.formState.errors.newPassword.message ?? "")}
          </p>
        )}
      </div>
      <div className="space-y-2">
        <Label htmlFor="confirmPassword">{t("reset.confirmNewPassword")}</Label>
        <Input
          id="confirmPassword"
          type="password"
          autoComplete="new-password"
          {...form.register("confirmPassword")}
        />
        {form.formState.errors.confirmPassword && (
          <p className="text-sm text-dt-red">
            {t(form.formState.errors.confirmPassword.message ?? "")}
          </p>
        )}
      </div>
      {form.formState.errors.root && (
        <StatusBadge status="danger">{t(form.formState.errors.root.message ?? "")}</StatusBadge>
      )}
      <Button type="submit" loading={form.formState.isSubmitting}>
        {t("settings.changePasswordButton")}
      </Button>
    </form>
  )
}
