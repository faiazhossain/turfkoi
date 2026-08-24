import { LoadingState } from "@/components/shared"

export default function NotificationsLoading() {
  return (
    <div className="mx-auto max-w-2xl px-4 py-12">
      <h1 className="font-heading text-2xl font-semibold">Notifications</h1>
      <LoadingState className="mt-4" rows={5} label="Loading notifications" />
    </div>
  )
}
