/**
 * Client-side image compression (bandwidth half of the pipeline — the
 * signed incoming Cloudinary transformation re-encodes server-side).
 * No library: bitmap → canvas → re-encoded blob, never upscaled, EXIF
 * stripped by the re-encode, orientation applied via imageOrientation.
 */

export const MAX_ORIGINAL_BYTES = 10 * 1024 * 1024

export type FileValidation =
  | { ok: true }
  | { ok: false; error: string }

/** Pure guard — exported separately so tests run without a DOM. */
export function validateImageFile(
  file: { type: string; size: number },
  maxBytes = MAX_ORIGINAL_BYTES
): FileValidation {
  const okType =
    file.type === "image/jpeg" ||
    file.type === "image/png" ||
    file.type === "image/webp" ||
    file.type === "image/avif"
  if (!okType) {
    return { ok: false, error: "Only JPEG, PNG, WebP, and AVIF images are allowed." }
  }
  if (file.size > maxBytes) {
    const mb = Math.round(maxBytes / 1024 / 1024)
    return { ok: false, error: `That image is too big (max ${mb} MB).` }
  }
  if (file.size === 0) {
    return { ok: false, error: "That file looks empty or corrupted." }
  }
  return { ok: true }
}

/**
 * Resize + re-encode before upload. Falls back to the original file when
 * the browser can't process it (the Cloudinary transformation still
 * enforces the cap server-side).
 */
export async function compressImage(
  file: File,
  maxDim: number
): Promise<Blob> {
  const check = validateImageFile(file)
  if (!check.ok) throw new Error(check.error)

  try {
    const bitmap = await createImageBitmap(file, {
      imageOrientation: "from-image",
    })
    // Never upscale.
    const scale = Math.min(1, maxDim / Math.max(bitmap.width, bitmap.height))
    const width = Math.max(1, Math.round(bitmap.width * scale))
    const height = Math.max(1, Math.round(bitmap.height * scale))

    const canvas = document.createElement("canvas")
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext("2d")
    if (!ctx) return file
    ctx.drawImage(bitmap, 0, 0, width, height)
    bitmap.close()

    const webp = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob((b) => resolve(b), "image/webp", 0.82)
    )
    if (webp && webp.size > 0) return webp

    // Safari-ish fallback when webp encoding is unsupported.
    const jpeg = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob((b) => resolve(b), "image/jpeg", 0.85)
    )
    return jpeg ?? file
  } catch {
    // Decode failure or exotic format — let Cloudinary decide.
    return file
  }
}
