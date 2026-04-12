import { createServerId, type Env } from './http'

const SESSION_COOKIE_NAME = 'travel_session'
const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 30
const PASSWORD_ITERATIONS = 310000

type SessionUserRow = {
  id: string
  email: string
}

export type AuthUser = {
  id: string
  email: string
}

export function normalizeEmail(email: string) {
  return email.trim().toLowerCase()
}

export function isValidEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizeEmail(email))
}

export function isValidPassword(password: string) {
  return password.trim().length >= 8
}

export async function hashPassword(password: string) {
  const saltBytes = crypto.getRandomValues(new Uint8Array(16))
  const salt = bytesToBase64Url(saltBytes)
  const hash = await derivePasswordHash(password, saltBytes, PASSWORD_ITERATIONS)
  return `pbkdf2$${PASSWORD_ITERATIONS}$${salt}$${bytesToBase64Url(hash)}`
}

export async function verifyPassword(password: string, storedHash: string) {
  const [algorithm, iterationsText, saltText, hashText] = storedHash.split('$')
  if (algorithm !== 'pbkdf2' || !iterationsText || !saltText || !hashText) return false

  const iterations = Number.parseInt(iterationsText, 10)
  if (!Number.isFinite(iterations)) return false

  const salt = base64UrlToBytes(saltText)
  const expected = base64UrlToBytes(hashText)
  const derived = await derivePasswordHash(password, salt, iterations)
  return timingSafeEqual(derived, expected)
}

export async function createSession(env: Env, userId: string) {
  const token = createServerId(24)
  const tokenHash = await hashToken(token)
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS).toISOString()
  const createdAt = new Date().toISOString()

  await env.DB.prepare(
    `
      INSERT INTO sessions (id, user_id, token_hash, expires_at, created_at)
      VALUES (?, ?, ?, ?, ?)
    `,
  )
    .bind(createServerId(16), userId, tokenHash, expiresAt, createdAt)
    .run()

  return { token, expiresAt }
}

export async function getAuthenticatedUser(request: Request, env: Env) {
  const token = readCookie(request.headers.get('cookie') ?? '', SESSION_COOKIE_NAME)
  if (!token) return null

  const tokenHash = await hashToken(token)
  const now = new Date().toISOString()
  const row = await env.DB.prepare(
    `
      SELECT users.id, users.email
      FROM sessions
      JOIN users ON users.id = sessions.user_id
      WHERE sessions.token_hash = ? AND sessions.expires_at > ?
      LIMIT 1
    `,
  )
    .bind(tokenHash, now)
    .first<SessionUserRow>()

  if (!row) return null
  return { id: row.id, email: row.email } satisfies AuthUser
}

export async function deleteSessionFromRequest(request: Request, env: Env) {
  const token = readCookie(request.headers.get('cookie') ?? '', SESSION_COOKIE_NAME)
  if (!token) return

  const tokenHash = await hashToken(token)
  await env.DB.prepare('DELETE FROM sessions WHERE token_hash = ?').bind(tokenHash).run()
}

export function buildSessionCookie(token: string, expiresAt: string) {
  return [
    `${SESSION_COOKIE_NAME}=${token}`,
    'Path=/',
    'HttpOnly',
    'Secure',
    'SameSite=Lax',
    `Expires=${new Date(expiresAt).toUTCString()}`,
  ].join('; ')
}

export function clearSessionCookie() {
  return [
    `${SESSION_COOKIE_NAME}=`,
    'Path=/',
    'HttpOnly',
    'Secure',
    'SameSite=Lax',
    'Max-Age=0',
  ].join('; ')
}

async function hashToken(token: string) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token))
  return bytesToBase64Url(new Uint8Array(digest))
}

async function derivePasswordHash(password: string, salt: Uint8Array, iterations: number) {
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    'PBKDF2',
    false,
    ['deriveBits'],
  )

  const derivedBits = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt: salt as unknown as BufferSource,
      iterations,
      hash: 'SHA-256',
    },
    keyMaterial,
    256,
  )

  return new Uint8Array(derivedBits)
}

function readCookie(cookieHeader: string, name: string) {
  const cookies = cookieHeader.split(';').map((part) => part.trim())
  for (const cookie of cookies) {
    const [cookieName, ...rest] = cookie.split('=')
    if (cookieName === name) {
      return rest.join('=')
    }
  }
  return null
}

function bytesToBase64Url(bytes: Uint8Array) {
  const base64 = btoa(String.fromCharCode(...bytes))
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
}

function base64UrlToBytes(value: string) {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/')
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=')
  const binary = atob(padded)
  return Uint8Array.from(binary, (char) => char.charCodeAt(0))
}

function timingSafeEqual(a: Uint8Array, b: Uint8Array) {
  if (a.length !== b.length) return false
  let mismatch = 0
  for (let index = 0; index < a.length; index += 1) {
    mismatch |= a[index] ^ b[index]
  }
  return mismatch === 0
}
