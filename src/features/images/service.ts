import "server-only"

import { randomUUID } from "node:crypto"
import { v2 as cloudinary } from "cloudinary"

import { buildImageUrl, type ImageVariant } from "./urls"

/**
 * ImageService — the single server-side integration with Cloudinary.
 * Every image upload (turf photos, team logos, player avatars) flows
 * through here: sign a direct browser upload, verify the stored asset,
 * destroy on cleanup. Delivery URLs come from ./urls (pure).
 *
 * Pipeline: the client compresses before upload (bandwidth), and the SIGNED
 * incoming transformation re-encodes server-side (c_limit + q_auto), so the
 * stored asset is already resized/compressed/EXIF-stripped regardless of
 * what the browser sent. No f_auto here — format negotiation is a
 * delivery-time concept (see ./urls).
 */

export type ImageContextKind = "turf" | "team" | "player"

export interface ImageContextConfig {
  /** Cloudinary folder for the resource. */
  folder: (resourceId: string) => string
  /** Signed incoming transformation — the stored asset IS this output. */
  uploadTransform: string
  /** Max stored bytes after the incoming transformation (Admin-checked). */
  maxStoredBytes: number
  /** Client-side resize cap (must match uploadTransform width). */
  maxDim: number
  allowedFormats: string[]
}

export const IMAGE_CONTEXTS: Record<ImageContextKind, ImageContextConfig> = {
  turf: {
    folder: (id) => `turfkoi/turfs/${id}`,
    uploadTransform: "c_limit,w_1600,q_auto",
    maxStoredBytes: 8 * 1024 * 1024,
    maxDim: 1600,
    allowedFormats: ["jpeg", "png", "webp", "avif"],
  },
  team: {
    folder: (id) => `turfkoi/teams/${id}`,
    uploadTransform: "c_limit,w_800,q_auto",
    maxStoredBytes: 4 * 1024 * 1024,
    maxDim: 800,
    allowedFormats: ["jpeg", "png", "webp", "avif"],
  },
  player: {
    folder: (id) => `turfkoi/players/${id}`,
    uploadTransform: "c_limit,w_800,q_auto",
    maxStoredBytes: 4 * 1024 * 1024,
    maxDim: 800,
    allowedFormats: ["jpeg", "png", "webp", "avif"],
  },
}

/** Max original file the client will accept before compression. */
export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024

function config(): { cloudName: string; apiKey: string; apiSecret: string } {
  const cloudName =
    process.env.CLOUDINARY_CLOUD_NAME ??
    process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME
  const apiKey = process.env.CLOUDINARY_API_KEY
  const apiSecret = process.env.CLOUDINARY_API_SECRET
  if (!cloudName || !apiKey || !apiSecret) {
    throw new Error(
      "[images] Cloudinary is not configured (CLOUDINARY_CLOUD_NAME / CLOUDINARY_API_KEY / CLOUDINARY_API_SECRET)"
    )
  }
  return { cloudName, apiKey, apiSecret }
}

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
  secure: true,
})

export type SignedUpload = {
  /**
   * Full public id (folder path + server-generated uuid). Sent as
   * `public_id` alone — Cloudinary builds the folder tree from the path.
   * NOTE: never also send `folder` in the upload form — Cloudinary would
   * prepend it AGAIN, doubling the path and breaking the confirm lookup.
   */
  publicId: string
  timestamp: number
  signature: string
  apiKey: string
  cloudName: string
  /** Must be sent unchanged in the upload FormData (part of the signature). */
  transformation: string
  uploadUrl: string
}

/**
 * Mint a signed direct-upload grant for one asset. The public id is
 * generated HERE so a client can never sign/confirm ids outside the
 * resource's folder — confirm enforces the prefix.
 */
export function signUpload(
  context: ImageContextKind,
  resourceId: string
): SignedUpload {
  const { cloudName, apiKey, apiSecret } = config()
  const cfg = IMAGE_CONTEXTS[context]
  const publicId = `${cfg.folder(resourceId)}/${randomUUID()}`
  const timestamp = Math.floor(Date.now() / 1000)
  const signature = cloudinary.utils.api_sign_request(
    {
      public_id: publicId,
      timestamp,
      transformation: cfg.uploadTransform,
    },
    apiSecret
  )
  return {
    publicId,
    timestamp,
    signature,
    apiKey,
    cloudName,
    transformation: cfg.uploadTransform,
    uploadUrl: `https://api.cloudinary.com/v1_1/${cloudName}/image/upload`,
  }
}

export type ConfirmResult =
  | { ok: true; bytes: number; width: number; height: number; format: string }
  | { ok: false; reason: "not_found" | "bad_format" | "too_large" | "bad_folder" }

/**
 * Verify a completed upload via the Admin API before anything is persisted:
 * correct folder, allowed format, and within the stored-bytes cap. Callers
 * destroy the asset when they reject it.
 */
export async function confirmAsset(
  context: ImageContextKind,
  resourceId: string,
  publicId: string
): Promise<ConfirmResult> {
  const cfg = IMAGE_CONTEXTS[context]
  const folder = cfg.folder(resourceId)
  if (!publicId.startsWith(`${folder}/`)) {
    return { ok: false, reason: "bad_folder" }
  }

  let resource: Awaited<ReturnType<typeof cloudinary.api.resource>>
  try {
    resource = await cloudinary.api.resource(publicId)
  } catch (err) {
    const code = (err as { http_code?: number }).http_code
    console.error(
      `[images] admin lookup failed for ${publicId} (http ${code ?? "?"}): ${err instanceof Error ? err.message : err}`
    )
    return { ok: false, reason: "not_found" }
  }

  if (!cfg.allowedFormats.includes(resource.format)) {
    return { ok: false, reason: "bad_format" }
  }
  if (resource.bytes > cfg.maxStoredBytes) {
    return { ok: false, reason: "too_large" }
  }
  return {
    ok: true,
    bytes: resource.bytes,
    width: resource.width,
    height: resource.height,
    format: resource.format,
  }
}

/** Best-effort delete — never throws (orphans are better than broken flows). */
export async function destroyAsset(publicId: string): Promise<void> {
  try {
    await cloudinary.uploader.destroy(publicId, { invalidate: true })
  } catch (err) {
    console.error(
      `[images] failed to destroy asset (orphan left in Cloudinary): ${err instanceof Error ? err.message : err}`
    )
  }
}

/** Server-side delivery URL (client code uses ./urls clientImageUrl). */
export function imageUrl(publicId: string, variant: ImageVariant): string {
  const { cloudName } = config()
  return buildImageUrl(cloudName, publicId, variant)
}
