import Link from "next/link"
import { CompassIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { EmptyState } from "@/components/shared"

export default function NotFound() {
  return (
    <div className="mx-auto flex max-w-6xl items-center px-4 py-24">
      <EmptyState
        icon={CompassIcon}
        title="Page not found"
        description="The page you're looking for doesn't exist or may have moved."
        action={<Button render={<Link href="/" />}>Back home</Button>}
      />
    </div>
  )
}
