import "server-only"
import { and, asc, desc, eq, gte, isNotNull, lte, sql, inArray } from "drizzle-orm"

import { db } from "@/db"
import { turfs, turfSlots, bookings, turfPhotos } from "@/db/schema"
import type { GeoPoint } from "@/db/geo"
import type { TurfFormat } from "./formats"

export type TurfListItem = {
  id: string
  slug: string
  name: string
  area: string | null
  city: string | null
  format: TurfFormat
  photo: string | null
  distanceKm: number | null
  /** Pin position for the discovery map (ST_Y/ST_X of the geography column). */
  lat: number
  lng: number
}

export interface ListTurfsFilter {
  area?: string
  coords?: GeoPoint
  radiusKm?: number
  format?: TurfFormat
  /** When false, returns unverified turfs too (owner/admin views). */
  onlyPublic?: boolean
  limit?: number
}

/**
 * SS32: list-based discovery. Uses PostGIS `ST_DWithin` for radius filtering
 * and `ST_Distance` for ordering when coords are supplied. Without coords,
 * falls back to area substring match and alpha sort.
 *
 * The coords column is `geography(Point, 4326)`; we wrap `ST_MakePoint` in
 * `::geography` so distances are in meters on the spheroid.
 */
export async function listTurfs(
  filter: ListTurfsFilter = {}
): Promise<TurfListItem[]> {
  const onlyPublic = filter.onlyPublic ?? true
  const radiusMeters = (filter.radiusKm ?? 10) * 1000
  const limit = Math.min(filter.limit ?? 30, 100)

  const conditions = []
  if (onlyPublic) {
    // Seeded-but-unclaimed turfs (owner_id NULL) never appear publicly.
    conditions.push(
      eq(turfs.isVerified, true),
      eq(turfs.isActive, true),
      isNotNull(turfs.ownerId)
    )
  }
  if (filter.format) conditions.push(eq(turfs.format, filter.format))
  if (filter.area) {
    conditions.push(
      sql`COALESCE(${turfs.area}, '') ILIKE ${"%" + filter.area + "%"}`
    )
  }
  if (filter.coords) {
    conditions.push(
      sql`ST_DWithin(${turfs.coords}, ST_MakePoint(${filter.coords.lng}, ${filter.coords.lat})::geography, ${radiusMeters})`
    )
  }

  const distanceExpr = filter.coords
    ? sql<number>`ST_Distance(${turfs.coords}, ST_MakePoint(${filter.coords.lng}, ${filter.coords.lat})::geography) / 1000.0`
    : sql<number>`NULL::numeric`

  const rows = await db
    .select({
      id: turfs.id,
      slug: turfs.slug,
      name: turfs.name,
      area: turfs.area,
      city: turfs.city,
      format: turfs.format,
      // Cover photo first, else earliest by sort order (Cloudinary public id).
      photo: sql<string | null>`(
        SELECT public_id FROM turf_photos tp
        WHERE tp.turf_id = ${turfs.id}
        ORDER BY is_cover DESC, sort_order ASC
        LIMIT 1
      )`.as("photo"),
      distanceKm: distanceExpr.as("distance_km"),
      lat: sql<number>`ST_Y(${turfs.coords}::geometry)`.as("lat"),
      lng: sql<number>`ST_X(${turfs.coords}::geometry)`.as("lng"),
    })
    .from(turfs)
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(
      filter.coords
        ? asc(distanceExpr)
        : asc(turfs.area)
    )
    .limit(limit)

  return rows.map((r) => ({
    ...r,
    distanceKm: r.distanceKm == null ? null : Number(r.distanceKm),
    lat: Number(r.lat),
    lng: Number(r.lng),
  }))
}

export type TurfAreaOption = { area: string; city: string | null }

/**
 * Distinct areas of publicly listed turfs that have a location. Powers the
 * discovery search suggestions, so only areas with real, located turfs are
 * ever offered in the dropdown.
 */
export async function listTurfAreas(): Promise<TurfAreaOption[]> {
  const rows = await db
    .selectDistinct({ area: turfs.area, city: turfs.city })
    .from(turfs)
    .where(
      and(
        eq(turfs.isVerified, true),
        eq(turfs.isActive, true),
        isNotNull(turfs.ownerId),
        isNotNull(turfs.coords),
        isNotNull(turfs.area)
      )
    )
    .orderBy(asc(turfs.area))
  // SQL already excludes NULL areas; flatMap narrows the nullable column type.
  return rows.flatMap((r) => (r.area == null ? [] : [{ area: r.area, city: r.city }]))
}

export async function getTurfBySlug(slug: string) {
  const rows = await db.select().from(turfs).where(eq(turfs.slug, slug)).limit(1)
  return rows[0] ?? null
}

export async function getTurfById(id: string) {
  const rows = await db.select().from(turfs).where(eq(turfs.id, id)).limit(1)
  return rows[0] ?? null
}

export type TurfPhoto = {
  id: string
  publicId: string
  sortOrder: number
  isCover: boolean
}

/** Gallery photos in display order (cover first, then manual order). */
export async function listTurfPhotos(turfId: string): Promise<TurfPhoto[]> {
  const rows = await db
    .select({
      id: turfPhotos.id,
      publicId: turfPhotos.publicId,
      sortOrder: turfPhotos.sortOrder,
      isCover: turfPhotos.isCover,
    })
    .from(turfPhotos)
    .where(eq(turfPhotos.turfId, turfId))
    .orderBy(desc(turfPhotos.isCover), asc(turfPhotos.sortOrder))
  return rows
}

/**
 * Lat/lng for a turf via ST_Y/ST_X. The geography column comes back as EWKB
 * on a plain select, so read positions through SQL instead.
 */
export async function getTurfLatLng(id: string) {
  const rows = await db
    .select({
      lat: sql<number>`ST_Y(${turfs.coords}::geometry)`,
      lng: sql<number>`ST_X(${turfs.coords}::geometry)`,
    })
    .from(turfs)
    .where(eq(turfs.id, id))
    .limit(1)
  const r = rows[0]
  return r ? { lat: Number(r.lat), lng: Number(r.lng) } : null
}

export async function listMyTurfs(ownerId: string) {
  return db
    .select({
      id: turfs.id,
      slug: turfs.slug,
      name: turfs.name,
      area: turfs.area,
      city: turfs.city,
      format: turfs.format,
      isActive: turfs.isActive,
      isVerified: turfs.isVerified,
      // Cover photo first, else earliest by sort order (Cloudinary public id).
      photo: sql<string | null>`(
        SELECT public_id FROM turf_photos tp
        WHERE tp.turf_id = ${turfs.id}
        ORDER BY is_cover DESC, sort_order ASC
        LIMIT 1
      )`.as("photo"),
    })
    .from(turfs)
    .where(eq(turfs.ownerId, ownerId))
    .orderBy(asc(turfs.name))
}

export type SlotRow = typeof turfSlots.$inferSelect

export async function listTurfSlots(
  turfId: string,
  range: { from: string; to: string }
) {
  return db
    .select()
    .from(turfSlots)
    .where(
      and(
        eq(turfSlots.turfId, turfId),
        gte(turfSlots.date, range.from),
        lte(turfSlots.date, range.to)
      )
    )
    .orderBy(asc(turfSlots.date), asc(turfSlots.startTime))
}

/** For the "Fill This Slot" surface — bookable, unsold inventory. */
export async function listUpcomingEmptySlots(
  turfId: string,
  days = 7
): Promise<Array<SlotRow & { turfName: string; turfSlug: string }>> {
  const today = new Date()
  const to = new Date(today.getTime() + days * 24 * 60 * 60 * 1000)
  const fromDate = today.toISOString().slice(0, 10)
  const toDate = to.toISOString().slice(0, 10)

  const rows = await db
    .select({
      slot: turfSlots,
      turfName: turfs.name,
      turfSlug: turfs.slug,
    })
    .from(turfSlots)
    .innerJoin(turfs, eq(turfs.id, turfSlots.turfId))
    .where(
      and(
        eq(turfSlots.turfId, turfId),
        eq(turfSlots.status, "available"),
        gte(turfSlots.date, fromDate),
        lte(turfSlots.date, toDate)
      )
    )
    .orderBy(asc(turfSlots.date), asc(turfSlots.startTime))
    .limit(50)

  return rows.map((r) => ({ ...r.slot, turfName: r.turfName, turfSlug: r.turfSlug }))
}

export interface OwnerKPIs {
  todaysBookings: number
  todaysRevenue: number
  upcomingBookings: number
  availableSlots: number
  occupancyPct: number
}

/**
 * Aggregate KPIs for the owner dashboard. All joins are filtered to turfs the
 * owner owns. Occupancy is booked / (booked + available) slots in the next 7
 * days, or 0 when there is no inventory yet.
 */
export async function getOwnerKPIs(ownerId: string): Promise<OwnerKPIs> {
  const today = new Date()
  const todayStr = today.toISOString().slice(0, 10)
  const in7d = new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10)

  // Turf IDs owned by this user.
  const owned = await db
    .select({ id: turfs.id })
    .from(turfs)
    .where(eq(turfs.ownerId, ownerId))
  const turfIds = owned.map((r) => r.id)
  if (turfIds.length === 0) {
    return {
      todaysBookings: 0,
      todaysRevenue: 0,
      upcomingBookings: 0,
      availableSlots: 0,
      occupancyPct: 0,
    }
  }

  const [todayAgg] = await db
    .select({
      count: sql<number>`count(*)::int`,
      revenue: sql<number>`COALESCE(sum(${bookings.totalAmount}), 0)::numeric`,
    })
    .from(bookings)
    .where(
      and(
        inArray(bookings.turfId, turfIds),
        eq(bookings.date, todayStr),
        eq(bookings.status, "confirmed")
      )
    )

  const [upcomingAgg] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(bookings)
    .where(
      and(
        inArray(bookings.turfId, turfIds),
        gte(bookings.date, todayStr),
        lte(bookings.date, in7d),
        eq(bookings.status, "confirmed")
      )
    )

  const [slotAgg] = await db
    .select({
      available: sql<number>`count(*) filter (where ${turfSlots.status} = 'available')::int`,
      booked: sql<number>`count(*) filter (where ${turfSlots.status} = 'booked')::int`,
    })
    .from(turfSlots)
    .where(
      and(
        inArray(turfSlots.turfId, turfIds),
        gte(turfSlots.date, todayStr),
        lte(turfSlots.date, in7d)
      )
    )

  const availableSlots = slotAgg?.available ?? 0
  const bookedSlots = slotAgg?.booked ?? 0
  const total = availableSlots + bookedSlots
  const occupancyPct = total === 0 ? 0 : Math.round((bookedSlots / total) * 100)

  return {
    todaysBookings: todayAgg?.count ?? 0,
    todaysRevenue: Number(todayAgg?.revenue ?? 0),
    upcomingBookings: upcomingAgg?.count ?? 0,
    availableSlots,
    occupancyPct,
  }
}

/** Surfaces Fill-This-Slot candidates across all turfs an owner has. */
export async function listOwnerFillableSlots(ownerId: string, days = 7) {
  const myTurfs = await listMyTurfs(ownerId)
  if (myTurfs.length === 0) return []
  const all = await Promise.all(
    myTurfs.map((t) => listUpcomingEmptySlots(t.id, days))
  )
  // Flatten + sort by earliest start. Cap to 20 for the dashboard surface.
  return all
    .flat()
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
    .slice(0, 20)
}
