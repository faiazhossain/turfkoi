"use client"

import * as React from "react"
import { PlusIcon, XIcon } from "lucide-react"

import { Input } from "@/components/ui/input"

interface PhotoUploadProps {
  turfId: string
  photos: string[]
  onChange: (photos: string[]) => void
}

/**
 * Presigned R2 upload flow (Phase 2 + H5 magic-byte verify from Phase 8):
 *  1. User selects a file.
 *  2. We POST to /api/turfs/upload-url for a presigned PUT URL.
 *  3. We PUT the file directly to R2.
 *  4. We POST to /api/turfs/upload-verify; the server fetches the first 32
 *     bytes and confirms the magic-byte signature matches the claimed type.
 *     A mismatch deletes the object and returns 415 — never trust extensions.
 *  5. The returned publicUrl is appended to the form's photo list.
 */
export function PhotoUpload({ turfId, photos, onChange }: PhotoUploadProps) {
  const inputRef = React.useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return
    setUploading(true)
    setError(null)
    try {
      const next = [...photos]
      for (const file of Array.from(files)) {
        const res = await fetch("/api/turfs/upload-url", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            turfId,
            filename: file.name,
            contentType: file.type,
          }),
        })
        if (!res.ok) {
          setError(`Upload rejected (${res.status})`)
          continue
        }
        const { uploadUrl, publicUrl, maxBytes, key } = await res.json()
        if (file.size > maxBytes) {
          setError(`${file.name} is too large (max ${maxBytes / 1024 / 1024} MB)`)
          continue
        }
        const put = await fetch(uploadUrl, {
          method: "PUT",
          body: file,
          headers: { "Content-Type": file.type },
        })
        if (!put.ok) {
          setError(`${file.name} upload failed`)
          continue
        }
        // H5: magic-byte verify. R2 has the bytes; the server confirms the
        // signature matches the claimed content type before we trust publicUrl.
        const verify = await fetch("/api/turfs/upload-verify", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            turfId,
            key,
            contentType: file.type,
          }),
        })
        if (!verify.ok) {
          const { error: verifyErr } = (await verify.json().catch(() => ({}))) as {
            error?: string
          }
          setError(verifyErr ?? `${file.name} failed validation`)
          continue
        }
        next.push(publicUrl)
      }
      onChange(next)
    } finally {
      setUploading(false)
      if (inputRef.current) inputRef.current.value = ""
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        {photos.map((url) => (
          <div key={url} className="relative size-20 overflow-hidden rounded-md bg-muted">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={url} alt="" className="size-full object-cover" />
            <button
              type="button"
              onClick={() => onChange(photos.filter((p) => p !== url))}
              className="absolute right-0.5 top-0.5 inline-flex size-5 items-center justify-center rounded-full bg-background/80 text-foreground"
              aria-label="Remove photo"
            >
              <XIcon className="size-3" />
            </button>
          </div>
        ))}
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={uploading}
          className="flex size-20 flex-col items-center justify-center gap-1 rounded-md border border-dashed border-border text-xs text-muted-foreground hover:bg-muted"
        >
          <PlusIcon className="size-4" aria-hidden />
          {uploading ? "Uploading" : "Add"}
        </button>
      </div>
      <Input
        ref={inputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={(e) => handleFiles(e.target.files)}
      />
      {error ? <p className="text-xs text-destructive">{error}</p> : null}
    </div>
  )
}
