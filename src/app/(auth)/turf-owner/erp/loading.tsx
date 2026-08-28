import { LoadingState } from "@/components/shared"
import { getT } from "@/i18n/server"

export default async function ErpLoading() {
  const t = await getT()
  return (
    <div className="mt-4">
      <LoadingState rows={4} label={t("erp.title")} />
    </div>
  )
}
