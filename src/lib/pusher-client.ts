"use client"

import Pusher from "pusher-js"

let _client: Pusher | null = null

/**
 * Browser-side Pusher client. Returns null when no public key is configured
 * (local dev) — callers treat that as "polling only" (Requirements §49:
 * 15–30s polling is the acceptable fallback).
 */
export function getPusherClient(): Pusher | null {
  const key = process.env.NEXT_PUBLIC_PUSHER_KEY
  if (!key) return null
  if (!_client) {
    _client = new Pusher(key, {
      cluster: process.env.NEXT_PUBLIC_PUSHER_CLUSTER ?? "ap1",
      forceTLS: true,
    })
  }
  return _client
}
