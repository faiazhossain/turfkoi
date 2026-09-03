"use client"

import { useRef, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { StatusBadge } from "@/components/shared"
import { useI18n } from "@/i18n/client"
import { useImageUpload } from "@/hooks/use-image-upload"
import { formatBdt } from "@/lib/pricing"
import { TOPUP_MAX_BDT, TOPUP_MIN_BDT } from "@/features/wallet/logic"

import { submitBookingPaymentAction } from "@/features/bookings/actions"
import { submitWalletTopUpAction } from "@/features/wallet/actions"

/**
 * Manual bKash Send Money intake form (booking payment + wallet top-up).
 * Shows the platform bKash number. For bookings the expected amount is
 * SERVER-computed and passed down; for top-ups the user types the amount and
 * the server validates it against the top-up bounds. On submit the payment
 * sits PENDING_VERIFICATION until an admin verifies the TxID/receipt.
 */
export function PaymentSubmissionForm({
  userId,
  purpose,
  amount,
  platformNumber,
  bookingId,
}: {
  userId: string
  purpose: "wallet_topup" | "turf_booking"
  /** Expected amount in BDT — server-computed (booking) or initial value. */
  amount: number
  platformNumber: string
  bookingId?: string
}) {
  const router = useRouter()
  const { t } = useI18n()
  const { upload, uploading } = useImageUpload()
  const fileRef = useRef<HTMLInputElement>(null)

  const [serverError, setServerError] = useState<string | null>(null)
  const [receiptName, setReceiptName] = useState<string | null>(null)
  const [senderNumber, setSenderNumber] = useState("")
  const [transactionId, setTransactionId] = useState("")
  const [userNote, setUserNote] = useState("")
  const [amountInput, setAmountInput] = useState(
    purpose === "wallet_topup" ? String(amount || TOPUP_MIN_BDT) : ""
  )
  const [pending, start] = useTransition()

  function onSubmit() {
    setServerError(null)
    start(async () => {
      try {
        let receiptPublicId: string | undefined
        const file = fileRef.current?.files?.[0]
        if (file) {
          const publicId = await upload("receipt", userId, file)
          if (!publicId) {
            setServerError("payments.errors.receiptInvalid")
            return
          }
          receiptPublicId = publicId
        }
        const shared = {
          transactionId,
          senderNumber,
          receiptPublicId,
          userNote: userNote || undefined,
        }
        const res =
          purpose === "wallet_topup"
            ? await submitWalletTopUpAction({
                amount: Number(amountInput),
                ...shared,
              })
            : await submitBookingPaymentAction({ bookingId: bookingId ?? "", ...shared })
        if (!res.ok) {
          setServerError(res.error)
          return
        }
        toast.success(t("payments.submittedToast"))
        router.refresh()
      } catch {
        setServerError("errors.generic")
      }
    })
  }

  const amountReady =
    purpose === "turf_booking" ||
    (Number.isInteger(Number(amountInput)) &&
      Number(amountInput) >= TOPUP_MIN_BDT &&
      Number(amountInput) <= TOPUP_MAX_BDT)
  const ready =
    amountReady && senderNumber.length === 11 && transactionId.trim().length >= 4

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        if (ready) void onSubmit()
      }}
      className="space-y-4"
    >
      <div className="rounded-lg border border-dt-line bg-dt-card2/40 p-3 text-sm">
        <p className="text-dt-dim">{t("payments.sendTo")}</p>
        <p className="mt-1 font-mono text-base font-semibold">
          {platformNumber || "—"}
        </p>
        {purpose === "turf_booking" ? (
          <>
            <p className="mt-1 text-dt-txt">
              {t("payments.expectedAmount")}:{" "}
              <span className="match-score font-bold tabular-nums text-dt-green">
                {formatBdt(amount)}
              </span>
            </p>
            <p className="mt-1 text-xs text-dt-dim">
              {t("payments.holdExpiryNote")}
            </p>
          </>
        ) : null}
      </div>

      {purpose === "wallet_topup" ? (
        <div className="space-y-1.5">
          <Label className="text-xs font-medium text-dt-dim">
            {t("payments.amountLabel")}
          </Label>
          <Input
            inputMode="numeric"
            value={amountInput}
            onChange={(e) => setAmountInput(e.target.value.replace(/[^\d]/g, ""))}
          />
          <p className="text-xs text-dt-dim">
            {t("payments.amountBounds", { min: TOPUP_MIN_BDT, max: TOPUP_MAX_BDT })}
          </p>
        </div>
      ) : null}

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label className="text-xs font-medium text-dt-dim">
            {t("payments.senderNumberLabel")}
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
            {t("payments.txIdLabel")}
          </Label>
          <Input
            value={transactionId}
            onChange={(e) => setTransactionId(e.target.value)}
          />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label className="text-xs font-medium text-dt-dim">
          {t("payments.receiptLabel")}
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
        <p className="text-xs text-dt-dim">{t("payments.receiptHint")}</p>
      </div>

      <div className="space-y-1.5">
        <Label className="text-xs font-medium text-dt-dim">
          {t("payments.noteLabel")}
        </Label>
        <Input value={userNote} onChange={(e) => setUserNote(e.target.value)} />
      </div>

      {serverError ? <StatusBadge status="danger">{t(serverError)}</StatusBadge> : null}

      <Button
        type="submit"
        size="lg"
        loading={pending || uploading}
        disabled={!ready}
        className="w-full"
      >
        {t("payments.submit")}
      </Button>
    </form>
  )
}
