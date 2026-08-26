import { InfoIcon } from "lucide-react"

/**
 * Concept explainer for the slots dashboard, English with a Bangla line
 * underneath (most BD turf owners manage in Bangla). Keeps the three ideas
 * straight: weekly hours create slots, a day tap overrides that day, one-off
 * slots are exceptions. Server component — no state.
 */
export function HowSlotsWork() {
  return (
    <div className="flex items-start gap-2.5 rounded-xl border border-border bg-card/60 px-4 py-3 text-sm text-muted-foreground">
      <InfoIcon className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
      <div className="space-y-1">
        <p>
          <span className="font-medium text-foreground">
            Booking slots are created automatically from your weekly schedule.
          </span>{" "}
          Select a day to close bookings or change the price. Need extra time?
          Add a one-time slot.
        </p>
        <p lang="bn">
          <span className="font-medium text-foreground">
            আপনার সাপ্তাহিক সময়সূচি থেকে বুকিং স্লট স্বয়ংক্রিয়ভাবে তৈরি হবে।
          </span>{" "}
          কোনো দিন নির্বাচন করে বুকিং বন্ধ করুন বা দাম পরিবর্তন করুন। অতিরিক্ত
          সময় দিতে চান? একটি অতিরিক্ত স্লট যোগ করুন।
        </p>
      </div>
    </div>
  )
}
