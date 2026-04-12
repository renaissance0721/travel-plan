import type { Trip, User } from './trip-model'

type AuthResponse = {
  user: User | null
}

type TripsResponse = {
  trips: Trip[]
}

type ErrorPayload = {
  error?: string
}

export async function fetchCurrentUser() {
  const payload = await requestJson<AuthResponse>('/api/auth/me', {
    method: 'GET',
  })

  return payload.user
}

export async function registerUser(email: string, password: string) {
  return requestJson<AuthResponse>('/api/auth/register', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  })
}

export async function loginUser(email: string, password: string) {
  return requestJson<AuthResponse>('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  })
}

export async function logoutUser() {
  return requestJson<{ ok: boolean }>('/api/auth/logout', {
    method: 'POST',
  })
}

export async function fetchTrips() {
  return requestJson<TripsResponse>('/api/trips', {
    method: 'GET',
  })
}

export async function syncTrips(trips: Trip[]) {
  return requestJson<TripsResponse>('/api/trips', {
    method: 'POST',
    body: JSON.stringify({ trips }),
  })
}

export async function deleteTripOnServer(tripId: string) {
  return requestJson<TripsResponse>(`/api/trips/${encodeURIComponent(tripId)}`, {
    method: 'DELETE',
  })
}

export async function shareTripWithAccount(tripId: string, email: string) {
  return requestJson<TripsResponse>(`/api/trips/${encodeURIComponent(tripId)}/share`, {
    method: 'POST',
    body: JSON.stringify({ email }),
  })
}

export async function removeTripShareFromAccount(tripId: string, email: string) {
  return requestJson<TripsResponse>(`/api/trips/${encodeURIComponent(tripId)}/share`, {
    method: 'DELETE',
    body: JSON.stringify({ email }),
  })
}

async function requestJson<T>(url: string, init: RequestInit) {
  const response = await fetch(url, {
    credentials: 'include',
    headers: {
      accept: 'application/json',
      ...(init.body ? { 'content-type': 'application/json' } : {}),
      ...(init.headers ?? {}),
    },
    ...init,
  })

  const payload = (await response.json().catch(() => ({}))) as ErrorPayload & T

  if (!response.ok) {
    throw new Error(payload.error || `Request failed with status ${response.status}`)
  }

  return payload
}
