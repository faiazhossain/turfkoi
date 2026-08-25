"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { MapPinIcon, SearchIcon } from "lucide-react"

import { useI18n } from "@/i18n/client"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import type { TurfAreaOption } from "@/features/turfs/queries"

const LISTBOX_ID = "area-search-listbox"
const MAX_SUGGESTIONS = 8

/**
 * URL the turf search navigates to. Mirrors what the old GET form produced:
 * `URLSearchParams` encodes spaces as `+`, exactly like a form submission,
 * and an empty query clears every filter.
 */
export function areaSearchUrl(area: string): string {
  const q = area.trim()
  if (!q) return "/turfs"
  return `/turfs?${new URLSearchParams({ area: q }).toString()}`
}

/**
 * Suggest areas whose names contain the query (same substring semantics as
 * the listTurfs ILIKE filter). Prefix matches rank first; an empty query
 * lists every available area. Capped to keep the dropdown tidy.
 */
export function filterAreas(
  areas: TurfAreaOption[],
  query: string,
  limit = MAX_SUGGESTIONS
): TurfAreaOption[] {
  const q = query.trim().toLowerCase()
  if (!q) return areas.slice(0, limit)
  const startsWith: TurfAreaOption[] = []
  const contains: TurfAreaOption[] = []
  for (const option of areas) {
    const name = option.area.toLowerCase()
    if (name.startsWith(q)) startsWith.push(option)
    else if (name.includes(q)) contains.push(option)
  }
  return [...startsWith, ...contains].slice(0, limit)
}

/**
 * Turf discovery search box (SS32). Suggestions come from the server-supplied
 * list of areas that actually have located, listed turfs — nothing else is
 * offered. Picking a suggestion navigates exactly like submitting the form
 * with that area typed out. The URL stays the source of truth: the input
 * text syncs back whenever the defaultValue prop changes (search, clear,
 * back/forward), so it behaves like the old server-rendered form.
 */
export function AreaSearch({
  areas,
  defaultValue = "",
  hasFilter,
}: {
  areas: TurfAreaOption[]
  defaultValue?: string
  hasFilter: boolean
}) {
  const router = useRouter()
  const { t } = useI18n()
  const [query, setQuery] = useState(defaultValue)
  const [open, setOpen] = useState(false)
  const [activeIndex, setActiveIndex] = useState(-1)
  const rootRef = useRef<HTMLDivElement>(null)

  // URL is the source of truth: follow external changes (clear, back/forward)
  // by resetting during render — same pattern as RouteTransitionOverlay.
  const [prevDefault, setPrevDefault] = useState(defaultValue)
  if (prevDefault !== defaultValue) {
    setPrevDefault(defaultValue)
    setQuery(defaultValue)
  }

  const suggestions = useMemo(
    () => filterAreas(areas, query),
    [areas, query]
  )

  // ----- Close the dropdown on outside clicks -----
  useEffect(() => {
    if (!open) return
    function onPointerDown(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false)
        setActiveIndex(-1)
      }
    }
    document.addEventListener("pointerdown", onPointerDown)
    return () => document.removeEventListener("pointerdown", onPointerDown)
  }, [open])

  function search(area: string) {
    setOpen(false)
    setActiveIndex(-1)
    router.push(areaSearchUrl(area))
  }

  function selectIndex(index: number) {
    const option = suggestions[index]
    if (!option) return
    setQuery(option.area)
    search(option.area)
  }

  function onSubmit(event: React.SubmitEvent<HTMLFormElement>) {
    event.preventDefault()
    search(query)
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Escape") {
      setOpen(false)
      setActiveIndex(-1)
      return
    }
    if (!open || suggestions.length === 0) return
    if (event.key === "ArrowDown") {
      event.preventDefault()
      setOpen(true)
      setActiveIndex((i) => (i + 1) % suggestions.length)
    } else if (event.key === "ArrowUp") {
      event.preventDefault()
      setActiveIndex((i) => (i <= 0 ? suggestions.length - 1 : i - 1))
    } else if (event.key === "Enter" && activeIndex >= 0) {
      event.preventDefault()
      selectIndex(activeIndex)
    }
  }

  return (
    <form className="flex flex-wrap items-center gap-2" onSubmit={onSubmit}>
      <div className="relative min-w-48 flex-1" ref={rootRef}>
        <SearchIcon
          className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden
        />
        <Input
          value={query}
          onChange={(e) => {
            setQuery(e.target.value)
            setActiveIndex(-1)
            setOpen(true)
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
          placeholder={t("turfs.searchPlaceholder")}
          className="pl-8"
          aria-label={t("turfs.searchAria")}
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={open && suggestions.length > 0}
          aria-controls={LISTBOX_ID}
          aria-activedescendant={
            open && activeIndex >= 0
              ? `${LISTBOX_ID}-option-${activeIndex}`
              : undefined
          }
          autoComplete="off"
        />
        {open && suggestions.length > 0 ? (
          <ul
            id={LISTBOX_ID}
            role="listbox"
            aria-label={t("turfs.areasAria")}
            className="absolute z-20 mt-1 w-full overflow-hidden rounded-lg border border-border bg-card shadow-lg"
          >
            {suggestions.map((option, i) => (
              <li key={option.area}>
                <button
                  id={`${LISTBOX_ID}-option-${i}`}
                  type="button"
                  role="option"
                  aria-selected={i === activeIndex}
                  onClick={() => selectIndex(i)}
                  className={cn(
                    "flex w-full items-start gap-2 px-3 py-2 text-left text-sm hover:bg-muted",
                    i === activeIndex && "bg-muted"
                  )}
                >
                  <MapPinIcon
                    className="mt-0.5 size-3.5 shrink-0 text-muted-foreground"
                    aria-hidden
                  />
                  <span>
                    <span className="font-medium">{option.area}</span>
                    {option.city && option.city !== option.area ? (
                      <span className="block text-xs text-muted-foreground">
                        {option.city}
                      </span>
                    ) : null}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
      <Button type="submit" variant="outline">
        {t("common.search")}
      </Button>
      {hasFilter ? (
        <Button type="button" variant="destructive" render={<Link href="/turfs" />}>
          {t("common.clear")}
        </Button>
      ) : null}
    </form>
  )
}
