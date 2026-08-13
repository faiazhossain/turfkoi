import { LoadingState } from "@/components/shared"

export default function Loading() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-16">
      <LoadingState rows={4} />
    </div>
  )
}
