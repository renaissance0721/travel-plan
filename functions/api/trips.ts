const DOCUMENT_ID = 'main'

type RequestContext = {
  env: {
    DB: {
      prepare: (query: string) => {
        bind: (...values: unknown[]) => {
          first: <T = Record<string, unknown>>() => Promise<T | null>
          run: () => Promise<unknown>
        }
      }
    }
  }
  request: Request
}

type StoredTripDocument = {
  payload?: string
  updated_at?: string
}

export async function onRequestGet(context: RequestContext) {
  const row = await context.env.DB.prepare(
    'SELECT payload, updated_at FROM shared_trip_state WHERE id = ?',
  )
    .bind(DOCUMENT_ID)
    .first<StoredTripDocument>()

  if (!row?.payload) {
    return jsonResponse({ trips: [], updatedAt: null })
  }

  try {
    const trips = JSON.parse(row.payload)
    return jsonResponse({
      trips: Array.isArray(trips) ? trips : [],
      updatedAt: row.updated_at ?? null,
    })
  } catch {
    return jsonResponse({ error: 'Stored trip data is invalid JSON.' }, 500)
  }
}

export async function onRequestPut(context: RequestContext) {
  const body = (await context.request.json().catch(() => null)) as
    | { trips?: unknown }
    | unknown[]
    | null

  const trips = Array.isArray(body) ? body : body?.trips

  if (!Array.isArray(trips)) {
    return jsonResponse({ error: 'Expected an array of trips.' }, 400)
  }

  const payload = JSON.stringify(trips)
  const updatedAt = new Date().toISOString()

  await context.env.DB.prepare(
    `
      INSERT INTO shared_trip_state (id, payload, updated_at)
      VALUES (?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        payload = excluded.payload,
        updated_at = excluded.updated_at
    `,
  )
    .bind(DOCUMENT_ID, payload, updatedAt)
    .run()

  return jsonResponse({ ok: true, updatedAt })
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
    },
  })
}
