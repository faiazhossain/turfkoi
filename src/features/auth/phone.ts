/** Normalize BD phone numbers to +8801XXXXXXXXX. */
export function normalizePhone(input: string): string {
  const stripped = input.replace(/[^\d+]/g, "")
  const p = stripped.startsWith("+") ? stripped.slice(1) : stripped
  if (p.startsWith("880")) return "+" + p
  if (p.startsWith("01")) return "+880" + p.slice(1)
  if (p.startsWith("1") && p.length === 10) return "+880" + p
  return "+" + p
}

/** BD mobile: +880 followed by 1[3-9] then 8 digits. */
export function isValidPhone(input: string): boolean {
  return /^\+8801[3-9]\d{8}$/.test(normalizePhone(input))
}
