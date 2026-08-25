"use client"

import { useCallback, useEffect, useState } from "react"
import {
  useInfiniteQuery,
  useQueryClient,
  type InfiniteData,
} from "@tanstack/react-query"
import { toast } from "sonner"

import { useI18n } from "@/i18n/client"
import { getPusherClient } from "@/lib/pusher-client"

import type { LocalizedText } from "./types"
import {
  markAllNotificationsReadAction,
  markNotificationReadAction,
} from "./actions"

/** Client-side mirror of the API feed response (queries.ts NotificationItem). */
export interface NotificationDTO {
  id: string
  type: string
  priority: string
  payload: unknown
  entityType: string | null
  entityId: string | null
  readAt: string | null
  createdAt: string
}

export interface FeedPage {
  userId: string
  items: NotificationDTO[]
  nextCursor: string | null
  unreadCount: number
}

class UnauthenticatedError extends Error {
  status = 401
}

async function fetchPage(cursor?: string | null): Promise<FeedPage> {
  const res = await fetch(
    `/api/notifications${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ""}`
  )
  if (res.status === 401) throw new UnauthenticatedError("Signed out")
  if (!res.ok) throw new Error("Failed to load notifications")
  return res.json()
}

const QUERY_KEY = ["notifications"] as const

export interface NotificationsFeed {
  items: NotificationDTO[]
  unreadCount: number
  signedOut: boolean
  isLoading: boolean
  markRead: (id: string) => void
  markAllPending: boolean
  markAllRead: () => Promise<void>
  hasNextPage: boolean
  isFetchingNextPage: boolean
  fetchNextPage: () => void
}

/**
 * Notification feed for the bell dropdown and /notifications page. Both
 * surfaces share one query key, so polling and refetches dedupe across them.
 * Live updates: 30s polling always, plus an instant refetch + critical toast
 * when Pusher is configured (`realtime: true` mounts the subscription — keep
 * it to one surface at a time to avoid duplicate toasts).
 */
export function useNotifications(options: {
  realtime?: boolean
  initialData?: FeedPage
}): NotificationsFeed {
  const { realtime = false, initialData } = options
  const queryClient = useQueryClient()
  const { t } = useI18n()
  const [markAllPending, setMarkAllPending] = useState(false)

  const query = useInfiniteQuery({
    queryKey: QUERY_KEY,
    queryFn: ({ pageParam }) => fetchPage(pageParam),
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage) => lastPage.nextCursor,
    initialData: initialData
      ? { pages: [initialData], pageParams: [null] }
      : undefined,
    // Requirements §49: 15–30s polling is the acceptable realtime fallback.
    refetchInterval: (q) =>
      q.state.error instanceof UnauthenticatedError ? false : 30_000,
    retry: (count, error) =>
      error instanceof UnauthenticatedError ? false : count < 1,
  })

  const userId = query.data?.pages[0]?.userId
  const signedOut = query.error instanceof UnauthenticatedError

  // Realtime: subscribe to this user's channel and refetch on new events.
  useEffect(() => {
    if (!realtime || !userId) return
    const pusher = getPusherClient()
    if (!pusher) return
    const channel = pusher.subscribe(`user-${userId}`)
    const onNew = (evt: {
      priority?: string
      title?: LocalizedText | null
      body?: LocalizedText | null
    }) => {
      void queryClient.invalidateQueries({ queryKey: QUERY_KEY })
      if (evt.priority === "critical" && evt.title) {
        toast(t(evt.title.key, evt.title.params), {
          description: evt.body ? t(evt.body.key, evt.body.params) : undefined,
        })
      }
    }
    channel.bind("notification.new", onNew)
    return () => {
      channel.unbind("notification.new", onNew)
      pusher.unsubscribe(`user-${userId}`)
    }
  }, [realtime, userId, queryClient, t])

  const patchPage = useCallback(
    (fn: (page: FeedPage) => FeedPage) => {
      queryClient.setQueryData<InfiniteData<FeedPage>>(QUERY_KEY, (data) =>
        data
          ? { ...data, pages: data.pages.map(fn) }
          : data
      )
    },
    [queryClient]
  )

  /** Optimistically mark one row read; the server action reconciles. */
  const markRead = useCallback(
    (id: string) => {
      patchPage((page) => ({
        ...page,
        unreadCount:
          page.unreadCount -
          (page.items.some((i) => i.id === id && !i.readAt) ? 1 : 0),
        items: page.items.map((i) =>
          i.id === id && !i.readAt ? { ...i, readAt: new Date().toISOString() } : i
        ),
      }))
      void markNotificationReadAction(id)
    },
    [patchPage]
  )

  const markAllRead = useCallback(async () => {
    setMarkAllPending(true)
    try {
      patchPage((page) => ({
        ...page,
        unreadCount: 0,
        items: page.items.map((i) =>
          i.readAt ? i : { ...i, readAt: new Date().toISOString() }
        ),
      }))
      await markAllNotificationsReadAction()
    } finally {
      setMarkAllPending(false)
    }
  }, [patchPage])

  const pages = query.data?.pages ?? []

  return {
    items: pages.flatMap((p) => p.items),
    unreadCount: pages[0]?.unreadCount ?? 0,
    signedOut,
    isLoading: query.isLoading,
    markRead,
    markAllPending,
    markAllRead,
    hasNextPage: query.hasNextPage,
    isFetchingNextPage: query.isFetchingNextPage,
    fetchNextPage: () => void query.fetchNextPage(),
  }
}
