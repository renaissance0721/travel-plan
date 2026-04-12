import {
  LEGACY_STORAGE_KEY,
  USER_STORAGE_KEY_PREFIX,
  type Trip,
  normalizeTrips,
} from './trip-model'

export function loadTripsFromCache(email?: string | null) {
  const key = email ? getUserStorageKey(email) : LEGACY_STORAGE_KEY
  const raw = window.localStorage.getItem(key) ?? (email ? window.localStorage.getItem(LEGACY_STORAGE_KEY) : null)
  if (!raw) return []

  try {
    return normalizeTrips(JSON.parse(raw) as Trip[])
  } catch {
    return []
  }
}

export function saveTripsToCache(email: string, trips: Trip[]) {
  window.localStorage.setItem(getUserStorageKey(email), JSON.stringify(trips))
}

export function clearTripsCache(email: string) {
  window.localStorage.removeItem(getUserStorageKey(email))
}

function getUserStorageKey(email: string) {
  return `${USER_STORAGE_KEY_PREFIX}${email.trim().toLowerCase()}`
}
