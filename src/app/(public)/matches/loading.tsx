import { Skeleton } from "@/components/ui/skeleton"

export default function MatchesLoading() {
  return (
    <div className="mx-auto max-w-4xl space-y-6 px-4 py-12">
      <div className="space-y-2">
        <Skeleton className="h-7 w-36" />
        <Skeleton className="h-4 w-64 max-w-full" />
      </div>
      <ul className="space-y-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <li key={i}>
            <Skeleton className="h-[74px] rounded-lg" />
          </li>
        ))}
      </ul>
    </div>
  )
}
