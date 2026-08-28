/**
 * ERP Phase 4: DeshiTurf Business Assistant — intent detection only.
 *
 * The assistant is deliberately NOT an LLM in this phase: answers are computed
 * from real ERP/booking data for a fixed set of intents, so numbers can never
 * be invented (PRD §34). Detection is keyword-based over Bangla + English.
 */

export type AssistantIntent =
  | "profit"
  | "best_day"
  | "biggest_expense"
  | "mom_comparison"
  | "peak_hour"
  | "target_daily"

const INTENT_KEYWORDS: Record<AssistantIntent, string[]> = {
  profit: ["লাভ", "profit", "কত টাকা আয়", "নিট"],
  best_day: ["কোন দিনে", "সবচেয়ে বেশি আয়", "best day", "ভালো আয়"],
  biggest_expense: ["কোন খরচ", "খরচ সবচেয়ে", "biggest expense", "কোথায় টাকা যাচ্ছে"],
  mom_comparison: ["গত মাসের তুলনায়", "তুলনায়", "compare", "কেমন করেছে"],
  peak_hour: ["কোন সময়ের", "কোন সময়", "peak", "স্লট", "slot", "বেশি লাভজনক"],
  target_daily: ["টার্গেট", "target", "দিনে কত", "প্রতিদিন কত"],
}

/** Longest keyword match wins so "কোন দিনে সবচেয়ে বেশি আয়" doesn't hit profit. */
export function detectIntent(question: string): AssistantIntent | null {
  const q = question.toLowerCase().trim()
  if (q.length === 0 || q.length > 300) return null

  let best: { intent: AssistantIntent; len: number } | null = null
  for (const [intent, keywords] of Object.entries(INTENT_KEYWORDS) as [
    AssistantIntent,
    string[],
  ][]) {
    for (const kw of keywords) {
      if (q.includes(kw) && (!best || kw.length > best.len)) {
        best = { intent, len: kw.length }
      }
    }
  }
  return best?.intent ?? null
}
