// Postgres SQLSTATE codes used in this codebase.
const UNIQUE_VIOLATION = "23505"
const FOREIGN_KEY_VIOLATION = "23503"

/**
 * Collect an error and its `cause` chain, oldest-wrapped last.
 *
 * Drizzle wraps every failed query in DrizzleQueryError ("Failed query: …"),
 * so the driver error carrying the SQLSTATE (`code`) and constraint name
 * (`constraint`) sits on `cause`, not on the top-level error — matching
 * message text or reading fields off the wrapper never fires. A malformed
 * chain can be cyclic, so track what has been seen.
 */
function errorChain(err: unknown): Error[] {
  const chain: Error[] = []
  const seen = new Set<unknown>()
  let current: unknown = err
  while (current instanceof Error && !seen.has(current)) {
    seen.add(current)
    chain.push(current)
    current = (current as { cause?: unknown }).cause
  }
  return chain
}

/** First Postgres SQLSTATE (e.g. "23505") found on the error chain. */
export function pgErrorCode(err: unknown): string | undefined {
  for (const e of errorChain(err)) {
    const code = (e as { code?: unknown }).code
    if (typeof code === "string") return code
  }
  return undefined
}

/** First constraint name (e.g. "turfs_slug_unique") on the error chain. */
export function pgConstraintName(err: unknown): string | undefined {
  for (const e of errorChain(err)) {
    const constraint = (e as { constraint?: unknown }).constraint
    if (typeof constraint === "string") return constraint
  }
  return undefined
}

export function isUniqueViolation(err: unknown): boolean {
  return pgErrorCode(err) === UNIQUE_VIOLATION
}

export function isForeignKeyViolation(err: unknown): boolean {
  return pgErrorCode(err) === FOREIGN_KEY_VIOLATION
}
