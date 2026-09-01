"use client"

import { useRef, useState } from "react"
import { useRouter } from "next/navigation"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { StatusBadge } from "@/components/shared"
import { useI18n } from "@/i18n/client"
import { useImageUpload } from "@/hooks/use-image-upload"

import { createPremiumRequestAction } from "@/features/erp/premium-actions"

const METHODS = ["bkash", "nagad", "rocket"] as const

export function PremiumRequestForm({
  userId,
  plans,
  mfsAccounts,
}: {
  userId: string
  plans: { months: number; amountBdt: number }[]
  mfsAccounts: Record<(typeof METHODS)[number], string>
}) {
  const router = useRouter()
  const { t } = useI18n()
  const { upload, uploading } = useImageUpload()
  const fileRef = useRef<HTMLInputElement>(null)

  const [serverError, setServerError] = useState<string | null>(null)
  const [receiptName, setReceiptName] = useState<string | null>(null)

  const [months, setMonths] = useState(String(plans[0]?.months ?? 1))
  const [method, setMethod] = useState<(typeof METHODS)[number]>("bkash")
  const [senderNumber, setSenderNumber] = useState("")
  const [transactionId, setTransactionId] = useState("")
  const [ownerNote, setOwnerNote] = useState("")
  const [pending, setPending] = useState(false)

  async function onSubmit() {
    setServerError(null)
    setPending(true)
    try {
      let receiptPublicId: string | undefined
      const file = fileRef.current?.files?.[0]
      if (file) {
        const publicId = await upload("receipt", userId, file)
        if (!publicId) {
          setServerError("erp.premium.receiptInvalid")
          return
        }
        receiptPublicId = publicId
      }
      const res = await createPremiumRequestAction({
        months: Number(months),
        method,
        senderNumber,
        transactionId,
        ownerNote: ownerNote || undefined,
        receiptPublicId,
      })
      if (!res.ok) {
        setServerError(res.error)
        return
      }
      router.refresh()
    } finally {
      setPending(false)
    }
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        void onSubmit()
      }}
      className="space-y-4"
    >
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label className="text-xs font-medium text-dt-dim">
            {t("erp.premium.plan")}
          </Label>
          <Select value={months} onValueChange={(v) => setMonths(v ?? String(plans[0]?.months))}>
            <SelectTrigger className="w-full">
              <SelectValue>
                {(() => {
                  const plan = plans.find((p) => String(p.months) === months)
                  return plan
                    ? t("erp.premium.planOption", {
                        months: plan.months,
                        amount: plan.amountBdt.toLocaleString(),
                      })
                    : t("erp.premium.plan")
                })()}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {plans.map((p) => (
                <SelectItem key={p.months} value={String(p.months)}>
                  {t("erp.premium.planOption", {
                    months: p.months,
                    amount: p.amountBdt.toLocaleString(),
                  })}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs font-medium text-dt-dim">
            {t("erp.premium.method")}
          </Label>
          <Select value={method} onValueChange={(v) => setMethod((v ?? "bkash") as (typeof METHODS)[number])}>
            <SelectTrigger className="w-full">
              <SelectValue>{t(`erp.premium.methods.${method}`)}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              {METHODS.map((m) => (
                <SelectItem key={m} value={m}>
                  {t(`erp.premium.methods.${m}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="rounded-lg border border-dt-line bg-dt-card2/40 p-3 text-sm">
        <p className="text-dt-dim">{t("erp.premium.sendTo")}</p>
        <p className="mt-1 font-mono text-base font-semibold">
          {mfsAccounts[method]}
        </p>
        <p className="text-xs text-dt-dim">
          {t("erp.premium.accountType")}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label className="text-xs font-medium text-dt-dim">
            {t("erp.premium.senderNumber")}
          </Label>
          <Input
            inputMode="numeric"
            placeholder="01XXXXXXXXX"
            value={senderNumber}
            onChange={(e) => setSenderNumber(e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs font-medium text-dt-dim">
            {t("erp.premium.transactionId")}
          </Label>
          <Input
            value={transactionId}
            onChange={(e) => setTransactionId(e.target.value)}
          />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label className="text-xs font-medium text-dt-dim">
          {t("erp.premium.receipt")}
        </Label>
        <Input
          ref={fileRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          onChange={(e) => setReceiptName(e.target.files?.[0]?.name ?? null)}
        />
        {receiptName ? (
          <p className="text-xs text-dt-dim">{receiptName}</p>
        ) : null}
        <p className="text-xs text-dt-dim">{t("erp.premium.receiptHint")}</p>
      </div>

      <div className="space-y-1.5">
        <Label className="text-xs font-medium text-dt-dim">
          {t("erp.premium.note")}
        </Label>
        <Input value={ownerNote} onChange={(e) => setOwnerNote(e.target.value)} />
      </div>

      {serverError ? <StatusBadge status="danger">{t(serverError)}</StatusBadge> : null}

      <Button
        type="submit"
        size="lg"
        loading={pending || uploading}
        disabled={senderNumber.length < 11 || transactionId.length < 4}
        className="w-full"
      >
        {t("erp.premium.submit")}
      </Button>
    </form>
  )
}
