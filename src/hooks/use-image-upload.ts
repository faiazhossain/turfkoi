"use client"

import { useCallback, useState } from "react"

import { compressImage, validateImageFile } from "@/lib/image-compress"

type SignedUploadResponse = {
  publicId: string
  timestamp: number
  signature: string
  apiKey: string
  cloudName: string
  transformation: string
  uploadUrl: string
  maxDim: number
}

export type ImageUploadContext = "turf" | "team" | "player"

/**
 * Generic signed direct-to-Cloudinary upload: compress client-side →
 * /api/images/sign → FormData POST to Cloudinary → /api/images/confirm.
 * Returns the confirmed publicId — persistence is the caller's job
 * (server action), so a failed save can destroy the orphan.
 */
export function useImageUpload() {
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const upload = useCallback(
    async (
      context: ImageUploadContext,
      resourceId: string,
      file: File
    ): Promise<string | null> => {
      setError(null)
      setUploading(true)
      try {
        const signRes = await fetch("/api/images/sign", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ context, resourceId }),
        })
        if (!signRes.ok) {
          const { error: signError } = (await signRes.json().catch(() => ({}))) as {
            error?: string
          }
          setError(signError ?? "images.errors.uploadNotAllowed")
          return null
        }
        const signed = (await signRes.json()) as SignedUploadResponse

        const check = validateImageFile(file)
        if (!check.ok) {
          setError(check.error)
          return null
        }
        const blob = await compressImage(file, signed.maxDim)

        const form = new FormData()
        // Params must match the signed set exactly — and no separate
        // `folder` param: public_id already carries the full path.
        form.append("file", blob, file.name)
        form.append("api_key", signed.apiKey)
        form.append("timestamp", String(signed.timestamp))
        form.append("signature", signed.signature)
        form.append("public_id", signed.publicId)
        form.append("transformation", signed.transformation)

        const put = await fetch(signed.uploadUrl, { method: "POST", body: form })
        if (!put.ok) {
          setError("images.errors.uploadFailed")
          return null
        }

        const confirmRes = await fetch("/api/images/confirm", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            context,
            resourceId,
            publicId: signed.publicId,
          }),
        })
        if (!confirmRes.ok) {
          const { error: confirmError } = (await confirmRes
            .json()
            .catch(() => ({}))) as { error?: string }
          setError(confirmError ?? "images.errors.confirmFailed")
          return null
        }

        return signed.publicId
      } finally {
        setUploading(false)
      }
    },
    []
  )

  return { upload, uploading, error }
}
