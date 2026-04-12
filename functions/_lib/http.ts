export type D1PreparedStatement = {
  bind: (...values: unknown[]) => {
    first: <T = Record<string, unknown>>() => Promise<T | null>
    all: <T = Record<string, unknown>>() => Promise<{ results: T[] }>
    run: () => Promise<unknown>
  }
}

export type D1DatabaseLike = {
  prepare: (query: string) => D1PreparedStatement
}

export type Env = {
  DB: D1DatabaseLike
}

export type AppContext<Params extends Record<string, string> = Record<string, string>> = {
  env: Env
  request: Request
  params: Params
}

export function jsonResponse(body: unknown, status = 200, headers: HeadersInit = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      ...headers,
    },
  })
}

export function errorResponse(error: string, status = 400, extras: Record<string, unknown> = {}) {
  return jsonResponse({ error, ...extras }, status)
}

export async function parseJsonBody<T>(request: Request) {
  return (await request.json().catch(() => null)) as T | null
}

export function createServerId(size = 18) {
  const bytes = crypto.getRandomValues(new Uint8Array(size))
  return Array.from(bytes, (value) => value.toString(16).padStart(2, '0')).join('')
}
