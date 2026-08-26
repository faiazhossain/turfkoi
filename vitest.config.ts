import { defineConfig } from "vitest/config"
import { resolve } from "node:path"

/**
 * J5 — vitest setup. The negative-path tests exercise the server-action logic
 * (cancellation policy, dual-control refund rejection, dispute state-guard)
 * against a real test database (PostGIS is required for the queries layer).
 *
 * Tests SKIP themselves if `DATABASE_URL` is unset, so CI build checks that
 * don't provision a DB still pass. Run them locally with:
 *
 *   DATABASE_URL=postgres://…@host/deshiturf_test npm test
 */
export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    setupFiles: ["./tests/setup.ts"],
    pool: "forks",
  },
  resolve: {
    alias: {
      "@": resolve(__dirname, "src"),
      // `server-only` throws when imported outside an RSC context; stub it for tests.
      "server-only": resolve(__dirname, "tests/stubs/server-only.ts"),
    },
  },
})
