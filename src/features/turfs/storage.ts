import "server-only"
import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3"
import { getSignedUrl } from "@aws-sdk/s3-request-presigner"
import { randomUUID } from "node:crypto"

/**
 * S3-compatible presigned PUT uploads (R2 / S3 / MinIO). Audit H5
 * (magic-byte validation) is Phase 8; here we only mint the URL.
 *
 * Env (already declared in .env.example):
 *   STORAGE_ENDPOINT, STORAGE_BUCKET, STORAGE_ACCESS_KEY, STORAGE_SECRET_KEY
 * Optional:
 *   STORAGE_PUBLIC_BASE — public base URL when the bucket is fronted by a CDN
 *   (e.g. https://cdn.turfkoi.bd). Falls back to the R2 public URL.
 */
function resolveEndpoint(): string | undefined {
  const endpoint = process.env.STORAGE_ENDPOINT
  if (!endpoint) return undefined
  // R2 endpoints include the account + bucket host; S3 SDK expects the base.
  return endpoint
}

let _client: S3Client | undefined

function client(): S3Client {
  if (_client) return _client
  _client = new S3Client({
    region: process.env.STORAGE_REGION ?? "auto",
    endpoint: resolveEndpoint(),
    credentials: {
      accessKeyId: process.env.STORAGE_ACCESS_KEY ?? "",
      secretAccessKey: process.env.STORAGE_SECRET_KEY ?? "",
    },
  })
  return _client
}

const UPLOAD_TTL_SECONDS = 90
const ALLOWED_CONTENT_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/avif",
])
const MAX_BYTES = 8 * 1024 * 1024 // 8 MB

export interface PresignedUpload {
  uploadUrl: string
  publicUrl: string
  key: string
  headers: Record<string, string>
  maxBytes: number
}

export interface CreateUploadInput {
  turfId: string
  filename: string
  contentType: string
}

export async function createTurfPhotoUpload(
  input: CreateUploadInput
): Promise<PresignedUpload> {
  if (!ALLOWED_CONTENT_TYPES.has(input.contentType)) {
    throw new Error(`Unsupported content type: ${input.contentType}`)
  }
  const bucket = process.env.STORAGE_BUCKET
  if (!bucket) throw new Error("STORAGE_BUCKET is not configured")

  const safeName = input.filename.replace(/[^\w.\-]+/g, "_").slice(0, 80)
  const key = `turfs/${input.turfId}/${randomUUID()}-${safeName}`

  const command = new PutObjectCommand({
    Bucket: bucket,
    Key: key,
    ContentType: input.contentType,
    ContentLength: MAX_BYTES,
  })
  const uploadUrl = await getSignedUrl(client(), command, {
    expiresIn: UPLOAD_TTL_SECONDS,
  })

  const publicBase =
    process.env.STORAGE_PUBLIC_BASE ??
    (process.env.STORAGE_ENDPOINT
      ? `${process.env.STORAGE_ENDPOINT}/${bucket}`
      : `https://${bucket}.r2.cloudflarestorage.com`)
  const publicUrl = `${publicBase.replace(/\/$/, "")}/${key}`

  return {
    uploadUrl,
    publicUrl,
    key,
    headers: { "Content-Type": input.contentType },
    maxBytes: MAX_BYTES,
  }
}
