import { normalizeEmail, type AuthUser } from './auth'
import { createServerId, type Env } from './http'

type TripRow = {
  id: string
  owner_user_id: string
  owner_email: string
  payload: string
  updated_at: string
}

type ShareEmailRow = {
  email: string
}

type AccessRow = {
  owner_user_id: string
}

type UserRow = {
  id: string
  email: string
}

type TripRecord = {
  id: string
  title: string
  departure: string
  destination: string
  startDate: string
  endDate: string
  cover: string
  summary: string
  status: string
  createdAt: string
  completedAt?: string
  days: Array<{
    id: string
    date: string
    cities: string[]
    note: string
    items: Array<{
      id: string
      title: string
      startTime: string
      endTime: string
      from: string
      to: string
      transportMode: string
      actualCost: string
      category: string
      notes: string
      progress: string
    }>
  }>
  accessRole?: 'owner' | 'shared'
  ownerEmail?: string
  canShare?: boolean
  canDelete?: boolean
  sharedWith?: string[]
}

export async function getAccessibleTrips(env: Env, user: AuthUser) {
  const rows = await env.DB.prepare(
    `
      SELECT trip_documents.id, trip_documents.owner_user_id, trip_documents.payload, trip_documents.updated_at, users.email AS owner_email
      FROM trip_documents
      JOIN users ON users.id = trip_documents.owner_user_id
      WHERE trip_documents.owner_user_id = ?
         OR EXISTS (
           SELECT 1
           FROM trip_shares
           WHERE trip_shares.trip_id = trip_documents.id
             AND trip_shares.user_id = ?
         )
      ORDER BY trip_documents.updated_at DESC
    `,
  )
    .bind(user.id, user.id)
    .all<TripRow>()

  const trips = await Promise.all(rows.results.map((row) => toAccessibleTrip(env, row, user.id)))
  return trips.filter(Boolean) as TripRecord[]
}

export async function syncTripsForUser(env: Env, user: AuthUser, trips: TripRecord[]) {
  for (const trip of trips) {
    const sanitized = sanitizeTrip(trip)
    const existing = await env.DB.prepare(
      `
        SELECT owner_user_id
        FROM trip_documents
        WHERE id = ?
          AND (
            owner_user_id = ?
            OR EXISTS (
              SELECT 1
              FROM trip_shares
              WHERE trip_id = trip_documents.id
                AND user_id = ?
            )
          )
        LIMIT 1
      `,
    )
      .bind(sanitized.id, user.id, user.id)
      .first<AccessRow>()

    const now = new Date().toISOString()
    const payload = JSON.stringify(sanitized)

    if (existing) {
      await env.DB.prepare(
        `
          UPDATE trip_documents
          SET payload = ?, title = ?, departure = ?, destination = ?, start_date = ?, end_date = ?, status = ?, created_at = ?, completed_at = ?, updated_at = ?
          WHERE id = ?
        `,
      )
        .bind(
          payload,
          sanitized.title,
          sanitized.departure,
          sanitized.destination,
          sanitized.startDate,
          sanitized.endDate,
          sanitized.status,
          sanitized.createdAt,
          sanitized.completedAt ?? null,
          now,
          sanitized.id,
        )
        .run()
      continue
    }

    const conflicting = await env.DB.prepare('SELECT owner_user_id FROM trip_documents WHERE id = ? LIMIT 1')
      .bind(sanitized.id)
      .first<AccessRow>()

    if (conflicting) {
      throw new Error('检测到无法写入的旅行记录，请刷新页面后重试。')
    }

    await env.DB.prepare(
      `
        INSERT INTO trip_documents (
          id, owner_user_id, title, departure, destination, start_date, end_date, status, created_at, completed_at, payload, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
    )
      .bind(
        sanitized.id || createServerId(12),
        user.id,
        sanitized.title,
        sanitized.departure,
        sanitized.destination,
        sanitized.startDate,
        sanitized.endDate,
        sanitized.status,
        sanitized.createdAt,
        sanitized.completedAt ?? null,
        payload,
        now,
      )
      .run()
  }

  return getAccessibleTrips(env, user)
}

export async function deleteTripForOwner(env: Env, user: AuthUser, tripId: string) {
  const ownedTrip = await env.DB.prepare(
    'SELECT owner_user_id FROM trip_documents WHERE id = ? AND owner_user_id = ? LIMIT 1',
  )
    .bind(tripId, user.id)
    .first<AccessRow>()

  if (!ownedTrip) {
    throw new Error('只有创建者可以删除这趟旅行。')
  }

  await env.DB.prepare('DELETE FROM trip_shares WHERE trip_id = ?').bind(tripId).run()
  await env.DB.prepare('DELETE FROM trip_documents WHERE id = ?').bind(tripId).run()

  return getAccessibleTrips(env, user)
}

export async function shareTripWithUser(env: Env, owner: AuthUser, tripId: string, email: string) {
  const normalizedEmail = normalizeEmail(email)

  const ownedTrip = await env.DB.prepare(
    'SELECT owner_user_id FROM trip_documents WHERE id = ? AND owner_user_id = ? LIMIT 1',
  )
    .bind(tripId, owner.id)
    .first<AccessRow>()

  if (!ownedTrip) {
    throw new Error('只有创建者可以分享这趟旅行。')
  }

  const targetUser = await env.DB.prepare(
    'SELECT id, email FROM users WHERE email = ? LIMIT 1',
  )
    .bind(normalizedEmail)
    .first<UserRow>()

  if (!targetUser) {
    throw new Error('找不到这个账号邮箱，请确认对方已经注册。')
  }

  if (targetUser.id === owner.id) {
    throw new Error('不能把旅行分享给自己的账号。')
  }

  await env.DB.prepare(
    `
      INSERT OR IGNORE INTO trip_shares (id, trip_id, user_id, shared_by_user_id, created_at)
      VALUES (?, ?, ?, ?, ?)
    `,
  )
    .bind(createServerId(16), tripId, targetUser.id, owner.id, new Date().toISOString())
    .run()

  return getAccessibleTrips(env, owner)
}

export async function removeTripShareForUser(env: Env, owner: AuthUser, tripId: string, email: string) {
  const normalizedEmail = normalizeEmail(email)

  const ownedTrip = await env.DB.prepare(
    'SELECT owner_user_id FROM trip_documents WHERE id = ? AND owner_user_id = ? LIMIT 1',
  )
    .bind(tripId, owner.id)
    .first<AccessRow>()

  if (!ownedTrip) {
    throw new Error('只有创建者可以管理这趟旅行的分享名单。')
  }

  const targetUser = await env.DB.prepare(
    'SELECT id, email FROM users WHERE email = ? LIMIT 1',
  )
    .bind(normalizedEmail)
    .first<UserRow>()

  if (!targetUser) {
    throw new Error('找不到这个账号邮箱，请确认对方已经注册。')
  }

  const existingShare = await env.DB.prepare(
    'SELECT id FROM trip_shares WHERE trip_id = ? AND user_id = ? LIMIT 1',
  )
    .bind(tripId, targetUser.id)
    .first<{ id: string }>()

  if (!existingShare) {
    throw new Error('这个账号当前不在分享名单中。')
  }

  await env.DB.prepare('DELETE FROM trip_shares WHERE trip_id = ? AND user_id = ?')
    .bind(tripId, targetUser.id)
    .run()

  return getAccessibleTrips(env, owner)
}

async function toAccessibleTrip(env: Env, row: TripRow, userId: string) {
  try {
    const payload = JSON.parse(row.payload) as TripRecord
    const shareRows = await env.DB.prepare(
      `
        SELECT users.email
        FROM trip_shares
        JOIN users ON users.id = trip_shares.user_id
        WHERE trip_shares.trip_id = ?
        ORDER BY users.email ASC
      `,
    )
      .bind(row.id)
      .all<ShareEmailRow>()

    return {
      ...sanitizeTrip(payload),
      accessRole: row.owner_user_id === userId ? 'owner' : 'shared',
      ownerEmail: row.owner_email,
      canShare: row.owner_user_id === userId,
      canDelete: row.owner_user_id === userId,
      sharedWith: shareRows.results.map((share) => share.email),
    } satisfies TripRecord
  } catch {
    return null
  }
}

function sanitizeTrip(trip: TripRecord): TripRecord {
  return {
    id: String(trip.id),
    title: String(trip.title ?? ''),
    departure: String(trip.departure ?? ''),
    destination: String(trip.destination ?? ''),
    startDate: String(trip.startDate ?? ''),
    endDate: String(trip.endDate ?? ''),
    cover: String(trip.cover ?? ''),
    summary: String(trip.summary ?? ''),
    status: trip.status === 'archived' ? 'archived' : 'planning',
    createdAt: String(trip.createdAt ?? new Date().toISOString()),
    completedAt: trip.completedAt ? String(trip.completedAt) : undefined,
    days: Array.isArray(trip.days)
      ? trip.days.map((day) => ({
          id: String(day.id ?? createServerId(8)),
          date: String(day.date ?? ''),
          cities: Array.isArray(day.cities) ? day.cities.map((city) => String(city)) : [''],
          note: String(day.note ?? ''),
          items: Array.isArray(day.items)
            ? day.items.map((item) => ({
                id: String(item.id ?? createServerId(8)),
                title: String(item.title ?? ''),
                startTime: String(item.startTime ?? ''),
                endTime: String(item.endTime ?? ''),
                from: String(item.from ?? ''),
                to: String(item.to ?? ''),
                transportMode: String(item.transportMode ?? 'train'),
                actualCost: String(item.actualCost ?? ''),
                category: String(item.category ?? 'transport'),
                notes: String(item.notes ?? ''),
                progress: item.progress === 'done' ? 'done' : 'todo',
              }))
            : [],
        }))
      : [],
  }
}
