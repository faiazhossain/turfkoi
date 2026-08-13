// Guardrail (SS58): fail if a NEXT_PUBLIC_ var looks like a secret.
// Public keys (NEXT_PUBLIC_*_KEY) are allowed; SECRET/TOKEN/PASSWORD are not.
import { readFileSync, existsSync } from "node:fs"

const file = ".env.example"

if (!existsSync(file)) {
  console.log("check:env: .env.example not found, skipping")
  process.exit(0)
}

const content = readFileSync(file, "utf8")
const offenders = []

for (const line of content.split("\n")) {
  const match = line.match(/^([A-Z0-9_]+)/)
  if (!match) continue
  const name = match[1]
  if (!name.startsWith("NEXT_PUBLIC_")) continue
  if (/(SECRET|TOKEN|PASSWORD)/.test(name)) {
    offenders.push(name)
  }
}

if (offenders.length > 0) {
  console.error(
    "check:env: NEXT_PUBLIC_ vars must not carry secrets (SECRET/TOKEN/PASSWORD):"
  )
  for (const name of offenders) console.error("  - " + name)
  process.exit(1)
}

console.log("check:env: ok - no public secret vars")
