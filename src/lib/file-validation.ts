import "server-only"

/**
 * H5 — magic-byte file validation. Content-Type headers and filename extensions
 * are both trivially spoofable, so we sniff the first few bytes of the uploaded
 * object to confirm it's actually the image format the client claimed.
 *
 * Supported: JPEG, PNG, WebP, AVIF (the four ALLOWED_CONTENT_TYPES in
 * src/features/turfs/storage.ts).
 */

export type ImageMime =
  | "image/jpeg"
  | "image/png"
  | "image/webp"
  | "image/avif"

const ALLOWED: ReadonlySet<ImageMime> = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/avif",
])

/**
 * Detect the image MIME type from the leading bytes. Returns null when the
 * signature doesn't match any supported format. Only the first 32 bytes are
 * needed; pass whatever you fetched via a ranged GET.
 */
export function detectImageMime(bytes: Uint8Array): ImageMime | null {
  // JPEG: FF D8 FF
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return "image/jpeg"
  }
  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  ) {
    return "image/png"
  }
  // WebP: "RIFF" .... "WEBP"
  if (
    bytes[0] === 0x52 && // R
    bytes[1] === 0x49 && // I
    bytes[2] === 0x46 && // F
    bytes[3] === 0x46 && // F
    bytes[8] === 0x57 && // W
    bytes[9] === 0x45 && // E
    bytes[10] === 0x42 && // B
    bytes[11] === 0x50 // P
  ) {
    return "image/webp"
  }
  // AVIF: ftyp box with brand "avif" or "avis" at offset 4–7 (after the 4-byte size).
  // 00 00 00 ?? 66 74 79 70 61 76 69 [f|s]
  if (
    bytes[4] === 0x66 && // f
    bytes[5] === 0x74 && // t
    bytes[6] === 0x79 && // y
    bytes[7] === 0x70 && // p
    bytes[8] === 0x61 && // a
    bytes[9] === 0x76 && // v
    bytes[10] === 0x69 && // i
    (bytes[11] === 0x66 || bytes[11] === 0x73) // f | s
  ) {
    return "image/avif"
  }
  return null
}

export function isAllowedImageMime(mime: string | null): mime is ImageMime {
  return !!mime && (ALLOWED as Set<string>).has(mime)
}
