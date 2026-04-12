export type TripStatus = 'planning' | 'archived'
export type ItemCategory = 'transport' | 'sightseeing' | 'food' | 'hotel' | 'shopping' | 'other'
export type TransportMode = 'walk' | 'subway' | 'bus' | 'taxi' | 'train' | 'flight' | 'car' | 'other'
export type ItemProgress = 'todo' | 'done'
export type SyncState = 'idle' | 'loading' | 'saving' | 'saved' | 'error'
export type AuthStatus = 'loading' | 'authenticated' | 'unauthenticated'
export type AuthMode = 'login' | 'register'
export type TripAccessRole = 'owner' | 'shared'

export type TripItem = {
  id: string
  title: string
  startTime: string
  endTime: string
  from: string
  to: string
  transportMode: TransportMode
  actualCost: string
  category: ItemCategory
  notes: string
  progress: ItemProgress
}

export type TripDay = {
  id: string
  date: string
  cities: string[]
  note: string
  items: TripItem[]
}

export type Trip = {
  id: string
  title: string
  departure: string
  destination: string
  startDate: string
  endDate: string
  cover: string
  summary: string
  status: TripStatus
  createdAt: string
  completedAt?: string
  days: TripDay[]
  accessRole?: TripAccessRole
  ownerEmail?: string
  canShare?: boolean
  canDelete?: boolean
  sharedWith?: string[]
}

export type TripForm = {
  title: string
  departure: string
  destination: string
  startDate: string
  endDate: string
  cover: string
  summary: string
}

export type ItemDraft = Omit<TripItem, 'id'>

export type User = {
  id: string
  email: string
}

export const LEGACY_STORAGE_KEY = 'travel-planner-journal-v1'
export const USER_STORAGE_KEY_PREFIX = 'travel-planner-user-v1:'
export const CLOUD_SAVE_DELAY_MS = 900

export const CATEGORY_LABELS: Record<ItemCategory, string> = {
  transport: '交通',
  sightseeing: '景点',
  food: '餐饮',
  hotel: '住宿',
  shopping: '购物',
  other: '其他',
}

export const TRANSPORT_LABELS: Record<TransportMode, string> = {
  walk: '步行',
  subway: '地铁',
  bus: '公交',
  taxi: '打车',
  train: '高铁/火车',
  flight: '飞机',
  car: '自驾',
  other: '其他',
}

export const PROGRESS_LABELS: Record<ItemProgress, string> = {
  todo: '待完成',
  done: '已完成',
}

export const emptyTripForm = (): TripForm => ({
  title: '',
  departure: '',
  destination: '',
  startDate: '',
  endDate: '',
  cover: '海岸公路',
  summary: '',
})

export const emptyItemDraft = (): ItemDraft => ({
  title: '',
  startTime: '',
  endTime: '',
  from: '',
  to: '',
  transportMode: 'train',
  actualCost: '',
  category: 'transport',
  notes: '',
  progress: 'todo',
})

export const toTripForm = (trip: Trip): TripForm => ({
  title: trip.title,
  departure: trip.departure,
  destination: trip.destination,
  startDate: trip.startDate,
  endDate: trip.endDate,
  cover: trip.cover,
  summary: trip.summary,
})

export function attachOwnedTripMeta(trip: Trip, email: string): Trip {
  return {
    ...trip,
    accessRole: 'owner',
    ownerEmail: email,
    canShare: true,
    canDelete: true,
    sharedWith: trip.sharedWith ?? [],
  }
}

export function stripTripPermissions(trip: Trip): Trip {
  return {
    id: trip.id,
    title: trip.title,
    departure: trip.departure,
    destination: trip.destination,
    startDate: trip.startDate,
    endDate: trip.endDate,
    cover: trip.cover,
    summary: trip.summary,
    status: trip.status,
    createdAt: trip.createdAt,
    completedAt: trip.completedAt,
    days: trip.days.map((day) => ({
      id: day.id,
      date: day.date,
      cities: [...day.cities],
      note: day.note,
      items: day.items.map((item) => ({ ...item })),
    })),
  }
}

export function isBuiltInSampleTrip(trip: Trip) {
  return (
    trip.title === '上海周末散心' &&
    trip.departure === '杭州' &&
    trip.destination === '上海' &&
    trip.startDate === '2026-04-18' &&
    trip.endDate === '2026-04-19' &&
    trip.cover === '城市夜景' &&
    trip.summary === '两天一夜，轻松吃逛，看夜景，适合周末短途放松。' &&
    trip.status === 'planning' &&
    trip.days.length === 2 &&
    trip.days[0]?.date === '2026-04-18' &&
    trip.days[0]?.cities.join('|') === '上海' &&
    trip.days[0]?.note === '上午出发，晚上看外滩夜景。' &&
    trip.days[0]?.items.length === 1 &&
    trip.days[0]?.items[0]?.title === '乘高铁前往虹桥' &&
    trip.days[1]?.date === '2026-04-19' &&
    trip.days[1]?.cities.join('|') === '上海' &&
    trip.days[1]?.note === '白天自由活动，晚上返程。' &&
    trip.days[1]?.items.length === 0
  )
}

export function buildTripDays(startDate: string, endDate: string, existingDays: TripDay[] = []) {
  const result: TripDay[] = []
  const current = parseLocalDate(startDate)
  const end = parseLocalDate(endDate)
  while (current <= end) {
    const date = formatDateKey(current)
    const existing = existingDays.find((day) => day.date === date)
    result.push(existing ?? { id: createId(), date, cities: [''], note: '', items: [] })
    current.setDate(current.getDate() + 1)
  }
  return result
}

export function normalizeTrips(trips: Trip[]) {
  return trips
    .filter((trip) => !isBuiltInSampleTrip(trip))
    .map((trip) => ({
      ...trip,
      sharedWith: Array.isArray(trip.sharedWith) ? [...trip.sharedWith] : [],
      days: trip.days.map((day) => ({
        ...day,
        cities:
          'cities' in day && Array.isArray(day.cities) && day.cities.length > 0
            ? [...day.cities]
            : [((day as TripDay & { city?: string }).city ?? '')],
      })),
    }))
}

export function computeTripStats(trip: Trip | null) {
  if (!trip) return { totalItems: 0, completedItems: 0, actualTotal: 0 }
  const items = trip.days.flatMap((day) => day.items)
  return {
    totalItems: items.length,
    completedItems: items.filter((item) => item.progress === 'done').length,
    actualTotal: items.reduce((sum, item) => sum + toNumber(item.actualCost), 0),
  }
}

export function toNumber(value: string) {
  const parsed = Number.parseFloat(value)
  return Number.isFinite(parsed) ? parsed : 0
}

export function createId() {
  return Math.random().toString(36).slice(2, 10)
}

export function formatDate(value: string) {
  const date = parseLocalDate(value)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat('zh-CN', { month: 'short', day: 'numeric', weekday: 'short' }).format(date)
}

export function parseLocalDate(value: string) {
  const [year, month, day] = value.split('-').map(Number)
  return new Date(year, (month || 1) - 1, day || 1)
}

export function formatDateKey(date: Date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function getCitySummary(cities: string[], fallback = '待填写城市') {
  const visibleCities = cities.map((city) => city.trim()).filter(Boolean)
  return visibleCities.length > 0 ? visibleCities.join(' / ') : fallback
}
