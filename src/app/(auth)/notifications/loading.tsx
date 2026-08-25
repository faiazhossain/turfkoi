import { LoadingState } from "@/components/shared"
import { getT } from "@/i18n/server"

export default async function NotificationsLoading() {
  const t = await getT()
  return (
    <div className="mx-auto max-w-2xl px-4 py-12">
      <h1 className="font-heading text-2xl font-semibold">
        {t("notifications.title")}
      </h1>
      <LoadingState
        className="mt-4"
        rows={5}
        label={t("notifications.loadingLabel")}
      />
    </div>
  )
}
