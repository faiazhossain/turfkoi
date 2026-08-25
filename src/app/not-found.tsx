import Link from "next/link"
import { CompassIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { EmptyState } from "@/components/shared"
import { getT } from "@/i18n/server"

export default async function NotFound() {
  const t = await getT()
  return (
    <div className="mx-auto flex max-w-6xl items-center px-4 py-24">
      <EmptyState
        icon={CompassIcon}
        title={t("notFound.title")}
        description={t("notFound.description")}
        action={
          <Button render={<Link href="/" />}>{t("common.backHome")}</Button>
        }
      />
    </div>
  )
}
