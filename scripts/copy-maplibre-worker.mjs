// maplibre-gl v6 loads its web worker as a sibling file of the ESM bundle
// (maplibre-gl-worker.mjs). Turbopack/webpack never emit that sidecar, so we
// serve it from public/ and set config.WORKER_URL (see src/components/map/map-canvas.tsx).
// Runs on postinstall so the copy always tracks the installed maplibre version.
import { copyFileSync, mkdirSync } from "node:fs"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const dist = join(root, "node_modules", "maplibre-gl", "dist")
const destDir = join(root, "public")
// The worker imports its sibling shared bundle at runtime.
const files = ["maplibre-gl-worker.mjs", "maplibre-gl-shared.mjs"]

mkdirSync(destDir, { recursive: true })
for (const f of files) {
  copyFileSync(join(dist, f), join(destDir, f))
  console.log(`copied ${f} -> public/`)
}
