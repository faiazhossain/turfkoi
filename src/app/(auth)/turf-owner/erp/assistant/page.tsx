import { redirect } from "next/navigation"

import { PremiumBadge, PremiumLockCard } from "@/components/erp/premium-lock-card"
import { AssistantBox } from "@/components/erp/assistant-box"
import { getCurrentUser } from "@/lib/auth"
import { getT } from "@/i18n/server"
import { ensureErpProfile, getErpPlanState } from "@/features/erp/profile"

export default async function ErpAssistantPage() {
  const t = await getT()
  const user = await getCurrentUser()
  if (!user) redirect("/login")

  const plan = getErpPlanState(await ensureErpProfile(user.id))
  if (!plan.isPremiumFeaturesUnlocked) {
    return (
      <div className="mt-4 space-y-4">
        <PremiumLockCard
          titleKey="erp.assistant.lockedTitle"
          descKey="erp.assistant.lockedDesc"
        />
      </div>
    )
  }

  return (
    <div className="mt-4 max-w-2xl space-y-4">
      <div className="flex items-center gap-2">
        <PremiumBadge />
      </div>
      <p className="text-sm text-dt-dim">{t("erp.assistant.subtitle")}</p>
      <AssistantBox />
    </div>
  )
}
