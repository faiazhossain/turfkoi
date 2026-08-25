import type { Metadata } from "next"

import { getT } from "./server"

/**
 * Locale-aware page metadata. Pages replace static `export const metadata`
 * with `generateMetadata` returning this helper, keyed into the
 * `metadata.*` dictionary namespace. The root title template
 * (`%s | Turfkoi`) lives in the root layout.
 */
export async function buildMetadata(
  options: { titleKey?: string; descriptionKey?: string } = {}
): Promise<Metadata> {
  const t = await getT()
  const metadata: Metadata = {}
  if (options.titleKey) metadata.title = t(options.titleKey)
  if (options.descriptionKey) metadata.description = t(options.descriptionKey)
  return metadata
}
