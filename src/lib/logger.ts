import "server-only"

/**
 * H6 — structured logger with PII redaction. Emits one JSON line per call to
 * stdout (Vercel + most log drains parse JSON lines). PII is redacted BEFORE
 * serialization, so accidental `console.log(user)` patterns in callers stay
 * safe-ish — though the convention is still "no PII in logs".
 *
 * Redacted shapes:
 *   phone   — +8801XXXXXXXXX | 01XXXXXXXXX
 *   email   — local@domain.tld
 *   uuid    — 8-4-4-4-12 hex
 *   bkash   — alphanumeric trxId 10–20 chars passed under a `bkashTrx` key
 *
 * No external dep — keeps the install lean.
 */

type Level = "debug" | "info" | "warn" | "error"

export type LogContext = Record<string, unknown>

const PHONE = /(\+?8801\d{9}|01\d{9})\b/g
const EMAIL = /[\w.+-]+@[\w-]+\.[\w.-]+/g
const UUID = /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi

function redactString(s: string): string {
  return s
    .replace(PHONE, "[redacted:phone]")
    .replace(EMAIL, "[redacted:email]")
    .replace(UUID, "[redacted:uuid]")
}

function redact(value: unknown): unknown {
  if (value == null) return value
  if (typeof value === "string") return redactString(value)
  if (value instanceof Error) {
    return { name: value.name, message: redactString(value.message), stack: value.stack }
  }
  if (Array.isArray(value)) return value.map(redact)
  if (typeof value === "object") {
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      // Explicit bkashTrx / phone / email keys are redacted wholesale.
      if (
        (k === "bkashTrx" || k === "phone" || k === "email" || k === "providerReference") &&
        typeof v === "string"
      ) {
        out[k] = `[redacted:${k === "bkashTrx" ? "bkash" : k}]`
      } else {
        out[k] = redact(v)
      }
    }
    return out
  }
  return value
}

function emit(level: Level, msg: string, ctx?: LogContext) {
  const line = {
    ts: new Date().toISOString(),
    level,
    msg,
    ...(ctx ? (redact(ctx) as Record<string, unknown>) : {}),
  }
  // stdout for all levels; the log drain decides what to alert on.
  process.stdout.write(JSON.stringify(line) + "\n")
}

export const logger = {
  debug: (msg: string, ctx?: LogContext) => emit("debug", msg, ctx),
  info: (msg: string, ctx?: LogContext) => emit("info", msg, ctx),
  warn: (msg: string, ctx?: LogContext) => emit("warn", msg, ctx),
  error: (msg: string, ctx?: LogContext) => emit("error", msg, ctx),
}
