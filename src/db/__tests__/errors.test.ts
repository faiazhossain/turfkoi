import { describe, it, expect } from "vitest"

import {
  isForeignKeyViolation,
  isUniqueViolation,
  pgConstraintName,
  pgErrorCode,
} from "@/db/errors"

/**
 * Mirror of how the installed drizzle-orm surfaces a failed Neon query:
 * DrizzleQueryError with "Failed query: …" as the message and the driver
 * error (NeonDbError, SQLSTATE in `code`, constraint in `constraint`) on
 * `cause`.
 */
function wrappedPgError(
  code: string,
  message: string,
  constraint?: string
): Error {
  const driverError = Object.assign(new Error(message), { code, constraint })
  const wrapper = new Error(
    `Failed query: insert into "turfs" values (default) returning "id"\nparams: mirpur-turf`
  )
  wrapper.name = "DrizzleQueryError"
  wrapper.cause = driverError
  return wrapper
}

describe("isUniqueViolation", () => {
  it("detects a unique violation wrapped in a DrizzleQueryError", () => {
    const err = wrappedPgError(
      "23505",
      'duplicate key value violates unique constraint "turfs_slug_unique"',
      "turfs_slug_unique"
    )
    expect(isUniqueViolation(err)).toBe(true)
  })

  it("detects a bare driver error without a wrapper", () => {
    const err = Object.assign(
      new Error('duplicate key value violates unique constraint "teams_slug_unique"'),
      { code: "23505" }
    )
    expect(isUniqueViolation(err)).toBe(true)
  })

  it("does not match other Postgres errors on the cause chain", () => {
    const err = wrappedPgError(
      "23503",
      'insert or update on table "bookings" violates foreign key constraint'
    )
    expect(isUniqueViolation(err)).toBe(false)
  })

  it("does not match a plain error or a non-error", () => {
    expect(isUniqueViolation(new Error("unique constraint (message only)"))).toBe(
      false
    )
    expect(isUniqueViolation("unique")).toBe(false)
    expect(isUniqueViolation(null)).toBe(false)
  })

  it("does not loop on a self-referential cause chain", () => {
    const err: Error & { cause?: unknown } = new Error("cyclic")
    err.cause = err
    expect(isUniqueViolation(err)).toBe(false)
  })
})

describe("isForeignKeyViolation", () => {
  it("detects an FK violation (23503) through the wrapper", () => {
    const err = wrappedPgError(
      "23503",
      'update or delete on table "turfs" violates foreign key constraint'
    )
    expect(isForeignKeyViolation(err)).toBe(true)
  })

  it("does not match a unique violation", () => {
    const err = wrappedPgError(
      "23505",
      'duplicate key value violates unique constraint "turfs_slug_unique"'
    )
    expect(isForeignKeyViolation(err)).toBe(false)
  })
})

describe("pgErrorCode", () => {
  it("returns the SQLSTATE from anywhere on the chain", () => {
    expect(
      pgErrorCode(wrappedPgError("23505", "duplicate key"))
    ).toBe("23505")
  })

  it("returns undefined for errors without a code", () => {
    expect(pgErrorCode(new Error("no code"))).toBeUndefined()
  })
})

describe("pgConstraintName", () => {
  it("returns the constraint name from the wrapped driver error", () => {
    const err = wrappedPgError(
      "23505",
      'duplicate key value violates unique constraint "turfs_slug_unique"',
      "turfs_slug_unique"
    )
    expect(pgConstraintName(err)).toBe("turfs_slug_unique")
  })

  it("returns undefined when the driver set no constraint field", () => {
    const err = wrappedPgError("23505", "duplicate key")
    expect(pgConstraintName(err)).toBeUndefined()
  })
})
