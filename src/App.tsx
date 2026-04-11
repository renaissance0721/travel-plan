import { useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { useRef } from 'react'
import './App.css'

type TripStatus = 'planning' | 'archived'
type ItemCategory = 'transport' | 'sightseeing' | 'food' | 'hotel' | 'shopping' | 'other'
type TransportMode = 'walk' | 'subway' | 'bus' | 'taxi' | 'train' | 'flight' | 'car' | 'other'
type ItemProgress = 'todo' | 'done'
type SyncState = 'loading' | 'saving' | 'saved' | 'error'

type TripItem = {
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

type TripDay = {
  id: string
  date: string
  cities: string[]
  note: string
  items: TripItem[]
}

type Trip = {
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
}

type TripForm = {
  title: string
  departure: string
  destination: string
  startDate: string
  endDate: string
  cover: string
  summary: string
}

type ItemDraft = Omit<TripItem, 'id'>

const STORAGE_KEY = 'travel-planner-journal-v1'
const CLOUD_SYNC_ENDPOINT = '/api/trips'
const CLOUD_SAVE_DELAY_MS = 900

const CATEGORY_LABELS: Record<ItemCategory, string> = {
  transport: '交通',
  sightseeing: '景点',
  food: '餐饮',
  hotel: '住宿',
  shopping: '购物',
  other: '其他',
}

const TRANSPORT_LABELS: Record<TransportMode, string> = {
  walk: '步行',
  subway: '地铁',
  bus: '公交',
  taxi: '打车',
  train: '高铁/火车',
  flight: '飞机',
  car: '自驾',
  other: '其他',
}

const PROGRESS_LABELS: Record<ItemProgress, string> = {
  todo: '待完成',
  done: '已完成',
}

const emptyTripForm = (): TripForm => ({
  title: '',
  departure: '',
  destination: '',
  startDate: '',
  endDate: '',
  cover: '海岸公路',
  summary: '',
})

const emptyItemDraft = (): ItemDraft => ({
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

const toTripForm = (trip: Trip): TripForm => ({
  title: trip.title,
  departure: trip.departure,
  destination: trip.destination,
  startDate: trip.startDate,
  endDate: trip.endDate,
  cover: trip.cover,
  summary: trip.summary,
})

function App() {
  const [trips, setTrips] = useState<Trip[]>([])
  const [selectedTripId, setSelectedTripId] = useState('')
  const [editingTripId, setEditingTripId] = useState<string | null>(null)
  const [isCreatingTrip, setIsCreatingTrip] = useState(false)
  const [editingDayId, setEditingDayId] = useState<string | null>(null)
  const [tripForm, setTripForm] = useState<TripForm>(emptyTripForm())
  const [itemDrafts, setItemDrafts] = useState<Record<string, ItemDraft>>({})
  const [activeView, setActiveView] = useState<'planner' | 'journal'>('planner')
  const [syncState, setSyncState] = useState<SyncState>('loading')
  const [syncMessage, setSyncMessage] = useState('正在读取云端数据...')
  const [isLoadingRemote, setIsLoadingRemote] = useState(true)
  const lastSyncedPayloadRef = useRef<string | null>(null)
  const hasHydratedRef = useRef(false)
  const saveTimerRef = useRef<number | null>(null)

  const planningTrips = useMemo(() => trips.filter((trip) => trip.status === 'planning'), [trips])
  const archivedTrips = useMemo(() => trips.filter((trip) => trip.status === 'archived'), [trips])
  const visibleTrips = activeView === 'planner' ? planningTrips : archivedTrips
  const selectedTrip = useMemo(
    () => visibleTrips.find((trip) => trip.id === selectedTripId) ?? visibleTrips[0] ?? null,
    [selectedTripId, visibleTrips],
  )
  const selectedDay = useMemo(() => {
    if (!selectedTrip) return null
    return selectedTrip.days.find((day) => day.id === editingDayId) ?? selectedTrip.days[0] ?? null
  }, [editingDayId, selectedTrip])
  const selectedDayDraft = selectedDay ? itemDrafts[selectedDay.id] ?? emptyItemDraft() : null
  const stats = useMemo(() => computeTripStats(selectedTrip), [selectedTrip])

  useEffect(() => {
    let isCancelled = false
    const cachedTrips = loadTripsFromCache()

    if (cachedTrips.length > 0) {
      applyCloudSnapshot(cachedTrips)
      setSyncMessage('正在连接云端，先显示当前设备里的数据...')
    }

    async function hydrateTrips() {
      try {
        const remoteTrips = await fetchTripsFromCloud()
        if (isCancelled) return

        if (remoteTrips.length === 0 && cachedTrips.length > 0) {
          await saveTripsToCloud(cachedTrips)
          if (isCancelled) return

          applyCloudSnapshot(cachedTrips)
          lastSyncedPayloadRef.current = serializeTrips(cachedTrips)
          setSyncState('saved')
          setSyncMessage('已把当前设备里的数据迁移到云端。')
        } else {
          applyCloudSnapshot(remoteTrips)
          lastSyncedPayloadRef.current = serializeTrips(remoteTrips)
          setSyncState('saved')
          setSyncMessage(
            remoteTrips.length > 0
              ? '已连接云端，所有设备访问都会看到同一份数据。'
              : '云端还没有数据，现在创建的新旅行会直接保存到云端。',
          )
        }
      } catch {
        if (isCancelled) return

        lastSyncedPayloadRef.current = serializeTrips(cachedTrips)
        setSyncState('error')
        setSyncMessage(
          cachedTrips.length > 0
            ? '云端读取失败，当前先继续使用这台设备上的缓存数据。'
            : '云端读取失败，当前显示空白数据。',
        )
      } finally {
        if (isCancelled) return
        hasHydratedRef.current = true
        setIsLoadingRemote(false)
      }
    }

    void hydrateTrips()

    return () => {
      isCancelled = true
      if (saveTimerRef.current !== null) {
        window.clearTimeout(saveTimerRef.current)
        saveTimerRef.current = null
      }
    }
  }, [])

  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(trips))
  }, [trips])

  useEffect(() => {
    if (!hasHydratedRef.current) return

    const payload = serializeTrips(trips)
    if (payload === lastSyncedPayloadRef.current) return

    setSyncState('saving')
    setSyncMessage('正在保存到云端...')

    if (saveTimerRef.current !== null) {
      window.clearTimeout(saveTimerRef.current)
    }

    saveTimerRef.current = window.setTimeout(() => {
      void persistTrips(payload, trips)
    }, CLOUD_SAVE_DELAY_MS)

    return () => {
      if (saveTimerRef.current !== null) {
        window.clearTimeout(saveTimerRef.current)
        saveTimerRef.current = null
      }
    }
  }, [trips])

  function applyCloudSnapshot(nextTrips: Trip[]) {
    const normalizedTrips = normalizeTrips(nextTrips).filter((trip) => !isBuiltInSampleTrip(trip))
    const nextPlanningTrip = normalizedTrips.find((trip) => trip.status === 'planning') ?? null
    const nextArchivedTrip = normalizedTrips.find((trip) => trip.status === 'archived') ?? null
    const nextView = nextPlanningTrip ? 'planner' : nextArchivedTrip ? 'journal' : 'planner'
    const nextSelectedTrip = nextView === 'planner' ? nextPlanningTrip : nextArchivedTrip

    setTrips(normalizedTrips)
    setActiveView(nextView)
    setSelectedTripId(nextSelectedTrip?.id ?? '')
    setEditingDayId(nextSelectedTrip?.days[0]?.id ?? null)
    setItemDrafts({})
    setIsCreatingTrip(false)

    if (nextView === 'planner' && nextSelectedTrip) {
      setTripForm(toTripForm(nextSelectedTrip))
      setEditingTripId(nextSelectedTrip.id)
    } else {
      setTripForm(emptyTripForm())
      setEditingTripId(null)
    }
  }

  async function persistTrips(payload: string, nextTrips: Trip[]) {
    try {
      await saveTripsToCloud(nextTrips)
      lastSyncedPayloadRef.current = payload
      setSyncState('saved')
      setSyncMessage('已保存到云端，手机刷新后也能看到最新数据。')
    } catch {
      setSyncState('error')
      setSyncMessage('保存到云端失败，当前改动仍保留在本机缓存里。')
    } finally {
      saveTimerRef.current = null
    }
  }

  function setTripFormFromTrip(trip: Trip) {
    setTripForm(toTripForm(trip))
    setEditingTripId(trip.id)
  }

  function handleTripFormChange<K extends keyof TripForm>(key: K, value: TripForm[K]) {
    setTripForm((current) => ({ ...current, [key]: value }))
  }

  function resetTripEditor() {
    setTripForm(emptyTripForm())
    setEditingTripId(null)
    setIsCreatingTrip(false)
  }

  function cancelTripEditor() {
    resetTripEditor()
    if (!selectedTripId) {
      const nextTrip = planningTrips[0] ?? null
      setSelectedTripId(nextTrip?.id ?? '')
      setEditingDayId(nextTrip?.days[0]?.id ?? null)
    }
  }

  function selectTrip(trip: Trip) {
    setSelectedTripId(trip.id)
    setEditingDayId(trip.days[0]?.id ?? null)
    setIsCreatingTrip(false)
    if (activeView === 'planner') {
      setTripFormFromTrip(trip)
    }
  }

  function startCreatingTrip() {
    setActiveView('planner')
    setTripForm(emptyTripForm())
    setEditingTripId(null)
    setIsCreatingTrip(true)
  }

  function changeView(view: 'planner' | 'journal') {
    setActiveView(view)
    if (view === 'journal') {
      resetTripEditor()
    }

    const nextTrips = view === 'planner' ? planningTrips : archivedTrips
    const nextTrip =
      nextTrips.find((trip) => trip.id === selectedTripId) ?? nextTrips[0] ?? null

    setSelectedTripId(nextTrip?.id ?? '')
    setEditingDayId(nextTrip?.days[0]?.id ?? null)
    if (view === 'planner' && nextTrip) {
      setTripFormFromTrip(nextTrip)
      setIsCreatingTrip(false)
    }
  }

  function saveTrip() {
    if (!tripForm.title || !tripForm.departure || !tripForm.destination || !tripForm.startDate || !tripForm.endDate) {
      window.alert('请先填写完整的旅行基础信息。')
      return
    }

    if (tripForm.endDate < tripForm.startDate) {
      window.alert('结束日期不能早于开始日期。')
      return
    }

    if (editingTripId) {
      setTrips((current) =>
        current.map((trip) =>
          trip.id === editingTripId
            ? { ...trip, ...tripForm, days: buildTripDays(tripForm.startDate, tripForm.endDate, trip.days) }
            : trip,
        ),
      )
      setSelectedTripId(editingTripId)
      setIsCreatingTrip(false)
    } else {
      const newTrip: Trip = {
        id: createId(),
        ...tripForm,
        status: 'planning',
        createdAt: new Date().toISOString(),
        days: buildTripDays(tripForm.startDate, tripForm.endDate),
      }
      setTrips((current) => [newTrip, ...current])
      selectTrip(newTrip)
      setActiveView('planner')
      setTripFormFromTrip(newTrip)
      setIsCreatingTrip(false)
    }
  }

  function duplicateTrip(trip: Trip) {
    const nextTrip: Trip = {
      ...trip,
      id: createId(),
      title: `${trip.title} - 新计划`,
      status: 'planning',
      createdAt: new Date().toISOString(),
      completedAt: undefined,
      days: trip.days.map((day) => ({
        ...day,
        id: createId(),
        cities: [...day.cities],
        items: day.items.map((item) => ({ ...item, id: createId(), actualCost: '', progress: 'todo' })),
      })),
    }

    setTrips((current) => [nextTrip, ...current])
    setActiveView('planner')
    selectTrip(nextTrip)
  }

  function deleteTrip(tripId: string) {
    const targetTrip = trips.find((trip) => trip.id === tripId)
    if (!targetTrip) return

    const confirmed = window.confirm(
      `确认删除「${targetTrip.title}」吗？\n\n删除后，这趟旅行的计划、日程事项和归档内容都将无法恢复。`,
    )
    if (!confirmed) return

    const nextVisibleTrips = visibleTrips.filter((trip) => trip.id !== tripId)
    const nextTrip = nextVisibleTrips[0] ?? null

    setTrips((current) => current.filter((trip) => trip.id !== tripId))
    setSelectedTripId(nextTrip?.id ?? '')
    setEditingDayId(nextTrip?.days[0]?.id ?? null)

    if (editingTripId === tripId) {
      resetTripEditor()
    } else if (nextTrip && activeView === 'planner') {
      setTripFormFromTrip(nextTrip)
    }
  }

  function archiveTrip(tripId: string) {
    const targetTrip = trips.find((trip) => trip.id === tripId)
    if (!targetTrip) return

    const confirmed = window.confirm(
      `确认将「${targetTrip.title}」归档为旅行日记吗？\n\n归档后，这趟旅行会从“计划中”移动到“已归档”，你可以继续查看并复制成新计划。`,
    )
    if (!confirmed) return

    setTrips((current) =>
      current.map((trip) =>
        trip.id === tripId ? { ...trip, status: 'archived', completedAt: new Date().toISOString() } : trip,
      ),
    )
    setActiveView('journal')
    setSelectedTripId(tripId)
    setEditingDayId(null)
    resetTripEditor()
  }

  function updateDay(dayId: string, patch: Partial<TripDay>) {
    if (!selectedTrip) return
    setTrips((current) =>
      current.map((trip) =>
        trip.id === selectedTrip.id
          ? {
              ...trip,
              days: trip.days.map((day) =>
                day.id === dayId
                  ? {
                      ...day,
                      ...patch,
                      cities: patch.cities ? [...patch.cities] : day.cities,
                    }
                  : day,
              ),
            }
          : trip,
      ),
    )
  }

  function updateDraft<K extends keyof ItemDraft>(dayId: string, key: K, value: ItemDraft[K]) {
    setItemDrafts((current) => ({
      ...current,
      [dayId]: { ...(current[dayId] ?? emptyItemDraft()), [key]: value },
    }))
  }

  function addItem(dayId: string) {
    const draft = itemDrafts[dayId] ?? emptyItemDraft()
    if (!draft.title.trim()) {
      window.alert('请先填写事项标题。')
      return
    }

    setTrips((current) =>
      current.map((trip) => ({
        ...trip,
        days: trip.days.map((day) =>
          day.id === dayId ? { ...day, items: [...day.items, { ...draft, id: createId() }] } : day,
        ),
      })),
    )

    setItemDrafts((current) => ({ ...current, [dayId]: emptyItemDraft() }))
  }

  function updateItem(dayId: string, itemId: string, patch: Partial<TripItem>) {
    if (!selectedTrip) return
    setTrips((current) =>
      current.map((trip) =>
        trip.id === selectedTrip.id
          ? {
              ...trip,
              days: trip.days.map((day) =>
                day.id === dayId
                  ? { ...day, items: day.items.map((item) => (item.id === itemId ? { ...item, ...patch } : item)) }
                  : day,
              ),
            }
          : trip,
      ),
    )
  }

  function removeItem(dayId: string, itemId: string) {
    if (!selectedTrip) return
    setTrips((current) =>
      current.map((trip) =>
        trip.id === selectedTrip.id
          ? {
              ...trip,
              days: trip.days.map((day) =>
                day.id === dayId ? { ...day, items: day.items.filter((item) => item.id !== itemId) } : day,
              ),
            }
          : trip,
      ),
    )
  }

  function moveItem(dayId: string, itemId: string, direction: 'up' | 'down') {
    if (!selectedTrip) return
    setTrips((current) =>
      current.map((trip) =>
        trip.id === selectedTrip.id
          ? {
              ...trip,
              days: trip.days.map((day) => {
                if (day.id !== dayId) return day
                const index = day.items.findIndex((item) => item.id === itemId)
                const target = direction === 'up' ? index - 1 : index + 1
                if (index < 0 || target < 0 || target >= day.items.length) return day
                const items = [...day.items]
                const [moved] = items.splice(index, 1)
                items.splice(target, 0, moved)
                return { ...day, items }
              }),
            }
          : trip,
      ),
    )
  }

  return (
    <main className="app-shell">
      <section className="hero-panel">
        <div className="hero-copy">
          <span className="eyebrow">旅行计划与旅行日记</span>
          <h1>旅行手账</h1>
          <p className="hero-text">
            你可以记录日期、路线、交通方式、费用和备注。旅行结束后，将整趟行程归档保存，
            下次还可以基于旧旅行继续复制新计划。
          </p>
          <p className={`sync-status sync-status-${syncState}`}>{syncMessage}</p>
          <div className="hero-actions">
            <button
              className="primary-button"
              onClick={() => (activeView === 'planner' ? startCreatingTrip() : changeView('planner'))}
            >
              {activeView === 'planner' ? '新建旅行' : '前往计划中'}
            </button>
          </div>
        </div>
        <div className="hero-card">
          <Metric label="计划中的旅行" value={planningTrips.length} />
          <Metric label="已归档旅行" value={archivedTrips.length} />
          <Metric
            label="总事项数"
            value={trips.reduce((sum, trip) => sum + trip.days.reduce((acc, day) => acc + day.items.length, 0), 0)}
          />
        </div>
      </section>

      <section className="workspace-grid">
        <aside className="panel sidebar">
          <div className="panel-header">
            <div>
              <h2>旅行工作台</h2>
              <p>左侧管理旅行，右侧编辑每天的行程事项。</p>
            </div>
          </div>

          <div className="view-toggle">
            <button className={activeView === 'planner' ? 'toggle-active' : ''} onClick={() => changeView('planner')}>
              计划中
            </button>
            <button className={activeView === 'journal' ? 'toggle-active' : ''} onClick={() => changeView('journal')}>
              已归档
            </button>
          </div>

          <div className="trip-list">
            {visibleTrips.map((trip) => (
              <button
                key={trip.id}
                className={`trip-card ${selectedTripId === trip.id ? 'trip-card-active' : ''}`}
                onClick={() => selectTrip(trip)}
              >
                <span className="trip-card-cover">{trip.cover}</span>
                <strong>{trip.title}</strong>
                <span>{trip.departure} 到 {trip.destination}</span>
                <span>{trip.startDate} 到 {trip.endDate}</span>
              </button>
            ))}
          </div>

          {activeView === 'planner' ? (
            selectedTrip ? (
              <SidebarTripEditor
                tripForm={tripForm}
                onCreate={startCreatingTrip}
                onChange={handleTripFormChange}
                onSave={saveTrip}
              />
            ) : (
              <div className="sidebar-note">
                <h3>计划中的旅行</h3>
                <p>先新建一趟旅行，创建后会自动出现在列表里，并继续进入行程编辑。</p>
                <button className="primary-button" onClick={startCreatingTrip}>新建旅行</button>
              </div>
            )
          ) : (
            <div className="sidebar-note">
              <h3>归档旅行</h3>
              <p>这里主要用于回看历史日记。如果想继续下一次旅行，可以打开右侧归档内容并点击“复制成新计划”。</p>
            </div>
          )}
        </aside>

        <section className="panel main-panel">
          {activeView === 'journal' ? (
            selectedTrip ? (
              <JournalView trip={selectedTrip} onDuplicate={duplicateTrip} onDelete={deleteTrip} />
            ) : (
              <div className="empty-state">
                <h2>还没有已归档旅行</h2>
                <p>先在“计划中”完成一趟旅行，再归档到这里形成旅行日记。</p>
              </div>
            )
          ) : isCreatingTrip ? (
            <TripBasicsForm
              title="创建一趟新旅行"
              actionLabel="保存并生成每日计划"
              tripForm={tripForm}
              onChange={handleTripFormChange}
              onCancel={cancelTripEditor}
              onSubmit={saveTrip}
            />
          ) : isLoadingRemote ? (
            <div className="empty-state">
              <h2>正在读取云端数据</h2>
              <p>请稍等一下，系统正在把公共旅行数据加载到当前设备。</p>
            </div>
          ) : !selectedTrip ? (
            <div className="empty-state">
              <h2>先创建你的第一趟旅行</h2>
              <p>当前版本会自动保存到云端，手机和电脑访问同一个网址都能看到。</p>
            </div>
          ) : (
            <>
              <header className="trip-summary">
                <div>
                  <span className="eyebrow">当前行程编辑</span>
                  <h2>{selectedTrip.title}</h2>
                  <p>{selectedTrip.departure} 到 {selectedTrip.destination} · {selectedTrip.startDate} 到 {selectedTrip.endDate}</p>
                  <p>{selectedTrip.summary || '这趟旅行还没有补充说明。'}</p>
                </div>
                <div className="summary-actions">
                  <p className="summary-caption">行程概览</p>
                  <div className="summary-metrics">
                    <Metric label="事项进度" value={`${stats.completedItems}/${stats.totalItems}`} />
                    <Metric label="实际总花费" value={`¥ ${stats.actualTotal || 0}`} />
                  </div>
                </div>
              </header>

              <div className="day-layout">
                <aside className="day-nav">
                  {selectedTrip.days.map((day, index) => (
                    <button key={day.id} className={selectedDay?.id === day.id ? 'day-active' : ''} onClick={() => setEditingDayId(day.id)}>
                      <strong>{`Day ${index + 1}`}</strong>
                      <span>{day.date}</span>
                      <span>{getCitySummary(day.cities)}</span>
                    </button>
                  ))}
                </aside>

                {selectedDay && selectedDayDraft ? (
                  <DayEditor
                    day={selectedDay}
                    dayIndex={selectedTrip.days.findIndex((day) => day.id === selectedDay.id) + 1}
                    draft={selectedDayDraft}
                    onDayChange={updateDay}
                    onDraftChange={updateDraft}
                    onAddItem={addItem}
                    onUpdateItem={updateItem}
                    onRemoveItem={removeItem}
                    onMoveItem={moveItem}
                  />
                ) : null}
              </div>

              <div className="danger-action-row">
                <button className="ghost-button" onClick={() => archiveTrip(selectedTrip.id)}>
                  归档为旅行日记
                </button>
                <button className="danger-button" onClick={() => deleteTrip(selectedTrip.id)}>
                  删除这趟旅行
                </button>
              </div>
            </>
          )}
        </section>
      </section>
    </main>
  )
}
function Metric({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="metric">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  )
}

function SidebarTripEditor({
  tripForm,
  onCreate,
  onChange,
  onSave,
}: {
  tripForm: TripForm
  onCreate: () => void
  onChange: <K extends keyof TripForm>(key: K, value: TripForm[K]) => void
  onSave: () => void
}) {
  return (
    <section className="sidebar-trip-info">
      <div className="section-title">
        <h3>旅行基础信息</h3>
        <span className="badge">{tripForm.cover || '未填写主题'}</span>
      </div>
      <label>旅行名称<input value={tripForm.title} onChange={(event) => onChange('title', event.target.value)} placeholder="例如：京都红叶五日" /></label>
      <div className="two-column">
        <label>出发地<input value={tripForm.departure} onChange={(event) => onChange('departure', event.target.value)} placeholder="上海" /></label>
        <label>目的地<input value={tripForm.destination} onChange={(event) => onChange('destination', event.target.value)} placeholder="东京" /></label>
      </div>
      <div className="two-column">
        <label>开始日期<input type="date" value={tripForm.startDate} onChange={(event) => onChange('startDate', event.target.value)} /></label>
        <label>结束日期<input type="date" value={tripForm.endDate} onChange={(event) => onChange('endDate', event.target.value)} /></label>
      </div>
      <label>封面主题<input value={tripForm.cover} onChange={(event) => onChange('cover', event.target.value)} placeholder="海岸、雪山、古城" /></label>
      <label>旅行说明<textarea rows={3} value={tripForm.summary} onChange={(event) => onChange('summary', event.target.value)} placeholder="这趟旅行主要想玩什么？" /></label>
      <div className="sidebar-trip-actions">
        <button className="ghost-button" onClick={onSave}>保存基础信息</button>
        <button className="primary-button" onClick={onCreate}>新建旅行</button>
      </div>
    </section>
  )
}

function TripBasicsForm({
  title,
  actionLabel,
  tripForm,
  onChange,
  onCancel,
  onSubmit,
}: {
  title: string
  actionLabel: string
  tripForm: TripForm
  onChange: <K extends keyof TripForm>(key: K, value: TripForm[K]) => void
  onCancel: () => void
  onSubmit: () => void
}) {
  return (
    <section className="trip-basics-card trip-form">
      <div className="section-title">
        <h3>{title}</h3>
        <button className="mini-button" onClick={onCancel}>取消</button>
      </div>
      <label>旅行名称<input value={tripForm.title} onChange={(event) => onChange('title', event.target.value)} placeholder="例如：京都红叶五日" /></label>
      <div className="two-column">
        <label>出发地<input value={tripForm.departure} onChange={(event) => onChange('departure', event.target.value)} placeholder="上海" /></label>
        <label>目的地<input value={tripForm.destination} onChange={(event) => onChange('destination', event.target.value)} placeholder="东京" /></label>
      </div>
      <div className="two-column">
        <label>开始日期<input type="date" value={tripForm.startDate} onChange={(event) => onChange('startDate', event.target.value)} /></label>
        <label>结束日期<input type="date" value={tripForm.endDate} onChange={(event) => onChange('endDate', event.target.value)} /></label>
      </div>
      <label>封面主题<input value={tripForm.cover} onChange={(event) => onChange('cover', event.target.value)} placeholder="海岸、雪山、古城" /></label>
      <label>旅行说明<textarea rows={3} value={tripForm.summary} onChange={(event) => onChange('summary', event.target.value)} placeholder="这趟旅行主要想玩什么？" /></label>
      <button className="primary-button" onClick={onSubmit}>{actionLabel}</button>
    </section>
  )
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return <label>{label}{children}</label>
}

function DayEditor({
  day,
  dayIndex,
  draft,
  onDayChange,
  onDraftChange,
  onAddItem,
  onUpdateItem,
  onRemoveItem,
  onMoveItem,
}: {
  day: TripDay
  dayIndex: number
  draft: ItemDraft
  onDayChange: (dayId: string, patch: Partial<TripDay>) => void
  onDraftChange: <K extends keyof ItemDraft>(dayId: string, key: K, value: ItemDraft[K]) => void
  onAddItem: (dayId: string) => void
  onUpdateItem: (dayId: string, itemId: string, patch: Partial<TripItem>) => void
  onRemoveItem: (dayId: string, itemId: string) => void
  onMoveItem: (dayId: string, itemId: string, direction: 'up' | 'down') => void
}) {
  return (
      <div className="day-detail">
      <div className="section-title">
        <h3>{`${formatDate(day.date)} · Day ${dayIndex}`}</h3>
        <span className="badge">{day.items.length} 条事项</span>
      </div>

      <div className="day-meta">
        <div className="city-editor">
          <label>当天城市</label>
          <div className="city-list">
            {day.cities.map((city, index) => (
              <div key={`${day.id}-city-${index}`} className="city-row">
                <input
                  value={city}
                  onChange={(event) => {
                    const nextCities = [...day.cities]
                    nextCities[index] = event.target.value
                    onDayChange(day.id, { cities: nextCities })
                  }}
                  placeholder={index === 0 ? '东京' : '继续添加城市'}
                />
                {day.cities.length > 1 ? (
                  <button
                    type="button"
                    className="mini-button"
                    onClick={() =>
                      onDayChange(day.id, {
                        cities: day.cities.filter((_, cityIndex) => cityIndex !== index),
                      })
                    }
                  >
                    删除
                  </button>
                ) : null}
              </div>
            ))}
            <button
              type="button"
              className="mini-button add-city-button"
              onClick={() => onDayChange(day.id, { cities: [...day.cities, ''] })}
            >
              添加城市
            </button>
          </div>
        </div>
        <label>当天备注<textarea rows={2} value={day.note} onChange={(event) => onDayChange(day.id, { note: event.target.value })} placeholder="写下今天的重点安排。" /></label>
      </div>

      <div className="editor-card">
        <div className="section-title">
          <h3>新增事项</h3>
          <p>每一件事都可以单独修改、排序和删除。</p>
        </div>
        <label>事项标题<input value={draft.title} onChange={(event) => onDraftChange(day.id, 'title', event.target.value)} placeholder="例如：从酒店前往清水寺" /></label>
        <div className="three-column">
          <label>开始时间<input type="time" value={draft.startTime} onChange={(event) => onDraftChange(day.id, 'startTime', event.target.value)} /></label>
          <label>结束时间<input type="time" value={draft.endTime} onChange={(event) => onDraftChange(day.id, 'endTime', event.target.value)} /></label>
          <label>事项类型<select value={draft.category} onChange={(event) => onDraftChange(day.id, 'category', event.target.value as ItemCategory)}>{Object.entries(CATEGORY_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
        </div>
        <div className="two-column">
          <label>从哪里<input value={draft.from} onChange={(event) => onDraftChange(day.id, 'from', event.target.value)} placeholder="京都站" /></label>
          <label>到哪里<input value={draft.to} onChange={(event) => onDraftChange(day.id, 'to', event.target.value)} placeholder="伏见稻荷大社" /></label>
        </div>
        <div className="three-column">
          <label>交通方式<select value={draft.transportMode} onChange={(event) => onDraftChange(day.id, 'transportMode', event.target.value as TransportMode)}>{Object.entries(TRANSPORT_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
          <label>实际费用<input value={draft.actualCost} onChange={(event) => onDraftChange(day.id, 'actualCost', event.target.value)} placeholder="42" /></label>
        </div>
        <label>备注<textarea rows={2} value={draft.notes} onChange={(event) => onDraftChange(day.id, 'notes', event.target.value)} placeholder="预约信息、提醒事项、路线细节等。" /></label>
        <button className="primary-button" onClick={() => onAddItem(day.id)}>添加到当天行程</button>
      </div>

      <div className="item-list">
        {day.items.length === 0 ? (
          <div className="empty-state compact"><p>还没有添加事项，可以先在上方新增一条行程。</p></div>
        ) : (
          day.items.map((item) => (
            <article key={item.id} className="item-card">
              <div className="item-top">
                <div>
                  <span className="item-kicker">{CATEGORY_LABELS[item.category]} · {TRANSPORT_LABELS[item.transportMode]}</span>
                  <h4>{item.title}</h4>
                </div>
                <span className={`badge ${item.progress === 'done' ? 'done' : ''}`}>{PROGRESS_LABELS[item.progress]}</span>
              </div>
              <div className="item-grid">
                <Field label="标题"><input value={item.title} onChange={(event) => onUpdateItem(day.id, item.id, { title: event.target.value })} /></Field>
                <Field label="开始时间"><input type="time" value={item.startTime} onChange={(event) => onUpdateItem(day.id, item.id, { startTime: event.target.value })} /></Field>
                <Field label="结束时间"><input type="time" value={item.endTime} onChange={(event) => onUpdateItem(day.id, item.id, { endTime: event.target.value })} /></Field>
                <Field label="起点"><input value={item.from} onChange={(event) => onUpdateItem(day.id, item.id, { from: event.target.value })} /></Field>
                <Field label="终点"><input value={item.to} onChange={(event) => onUpdateItem(day.id, item.id, { to: event.target.value })} /></Field>
                <Field label="交通方式"><select value={item.transportMode} onChange={(event) => onUpdateItem(day.id, item.id, { transportMode: event.target.value as TransportMode })}>{Object.entries(TRANSPORT_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></Field>
                <Field label="事项类型"><select value={item.category} onChange={(event) => onUpdateItem(day.id, item.id, { category: event.target.value as ItemCategory })}>{Object.entries(CATEGORY_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></Field>
                <Field label="实际费用"><input value={item.actualCost} onChange={(event) => onUpdateItem(day.id, item.id, { actualCost: event.target.value })} /></Field>
              </div>
              <label>备注<textarea rows={2} value={item.notes} onChange={(event) => onUpdateItem(day.id, item.id, { notes: event.target.value })} /></label>
              <div className="item-actions">
                <button className="mini-button" onClick={() => onUpdateItem(day.id, item.id, { progress: item.progress === 'done' ? 'todo' : 'done' })}>{item.progress === 'done' ? '标记为待完成' : '标记为已完成'}</button>
                <button className="mini-button" onClick={() => onMoveItem(day.id, item.id, 'up')}>上移</button>
                <button className="mini-button" onClick={() => onMoveItem(day.id, item.id, 'down')}>下移</button>
                <button className="danger-button" onClick={() => onRemoveItem(day.id, item.id)}>删除事项</button>
              </div>
            </article>
          ))
        )}
      </div>
    </div>
  )
}

function JournalView({
  trip,
  onDuplicate,
  onDelete,
}: {
  trip: Trip
  onDuplicate: (trip: Trip) => void
  onDelete: (tripId: string) => void
}) {
  const stats = computeTripStats(trip)
  return (
    <div className="journal-view">
      <header className="journal-header">
        <div>
          <span className="eyebrow">旅行日记</span>
          <h2>{trip.title}</h2>
          <p>{trip.departure} 到 {trip.destination} · {trip.startDate} 到 {trip.endDate}</p>
          <p>{trip.summary || '这趟旅程还没有补充说明。'}</p>
        </div>
        <div className="summary-actions">
          <p className="summary-caption">归档概览</p>
          <div className="summary-metrics summary-metrics-archived">
            <Metric label="总天数" value={trip.days.length} />
            <Metric label="事项进度" value={`${stats.completedItems}/${stats.totalItems}`} />
            <Metric label="实际总花费" value={`¥ ${stats.actualTotal || 0}`} />
          </div>
          <button className="primary-button" onClick={() => onDuplicate(trip)}>复制成新计划</button>
        </div>
      </header>
      <div className="journal-days">
        {trip.days.map((day, index) => (
          <section key={day.id} className="journal-day">
            <div className="section-title">
              <h3>{`Day ${index + 1} · ${formatDate(day.date)}`}</h3>
              <span className="badge">{getCitySummary(day.cities, '未填写城市')}</span>
            </div>
            <p className="journal-note">{day.note || '这一天没有补充说明。'}</p>
            <div className="timeline">
              {day.items.length === 0 ? <div className="empty-state compact"><p>这一天没有记录事项。</p></div> : day.items.map((item) => (
                <article key={item.id} className="timeline-card">
                  <div className="timeline-time"><strong>{item.startTime || '--:--'}</strong><span>{item.endTime || '未结束'}</span></div>
                  <div className="timeline-content">
                    <div className="item-top">
                      <div><span className="item-kicker">{CATEGORY_LABELS[item.category]} · {TRANSPORT_LABELS[item.transportMode]}</span><h4>{item.title}</h4></div>
                      <span className={`badge ${item.progress === 'done' ? 'done' : ''}`}>{PROGRESS_LABELS[item.progress]}</span>
                    </div>
                    <p>{item.from || '未填写起点'} 到 {item.to || '未填写终点'}</p>
                    <p>实际花费 ¥ {item.actualCost || '0'}</p>
                    {item.notes ? <p>{item.notes}</p> : null}
                  </div>
                </article>
              ))}
            </div>
          </section>
        ))}
      </div>
      <div className="danger-action-row">
        <button className="danger-button" onClick={() => onDelete(trip.id)}>
          删除这趟旅行
        </button>
      </div>
    </div>
  )
}

function loadTripsFromCache() {
  const raw = window.localStorage.getItem(STORAGE_KEY)
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw) as Trip[]
    const normalized = normalizeTrips(parsed)
    return normalized.filter((trip) => !isBuiltInSampleTrip(trip))
  } catch {
    return []
  }
}

async function fetchTripsFromCloud() {
  const response = await fetch(CLOUD_SYNC_ENDPOINT, {
    headers: { accept: 'application/json' },
  })

  if (!response.ok) {
    throw new Error(`Failed to load trips: ${response.status}`)
  }

  const payload = (await response.json()) as { trips?: Trip[] }
  return normalizeTrips(Array.isArray(payload.trips) ? payload.trips : []).filter((trip) => !isBuiltInSampleTrip(trip))
}

async function saveTripsToCloud(trips: Trip[]) {
  const response = await fetch(CLOUD_SYNC_ENDPOINT, {
    method: 'PUT',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify({ trips }),
  })

  if (!response.ok) {
    throw new Error(`Failed to save trips: ${response.status}`)
  }
}

function serializeTrips(trips: Trip[]) {
  return JSON.stringify(trips)
}

function isBuiltInSampleTrip(trip: Trip) {
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

function buildTripDays(startDate: string, endDate: string, existingDays: TripDay[] = []) {
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

function normalizeTrips(trips: Trip[]) {
  return trips.map((trip) => ({
    ...trip,
    days: trip.days.map((day) => ({
      ...day,
      cities:
        'cities' in day && Array.isArray(day.cities) && day.cities.length > 0
          ? [...day.cities]
          : [((day as TripDay & { city?: string }).city ?? '')],
    })),
  }))
}

function computeTripStats(trip: Trip | null) {
  if (!trip) return { totalItems: 0, completedItems: 0, actualTotal: 0 }
  const items = trip.days.flatMap((day) => day.items)
  return {
    totalItems: items.length,
    completedItems: items.filter((item) => item.progress === 'done').length,
    actualTotal: items.reduce((sum, item) => sum + toNumber(item.actualCost), 0),
  }
}

function toNumber(value: string) {
  const parsed = Number.parseFloat(value)
  return Number.isFinite(parsed) ? parsed : 0
}

function createId() {
  return Math.random().toString(36).slice(2, 10)
}

function formatDate(value: string) {
  const date = parseLocalDate(value)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat('zh-CN', { month: 'short', day: 'numeric', weekday: 'short' }).format(date)
}

function parseLocalDate(value: string) {
  const [year, month, day] = value.split('-').map(Number)
  return new Date(year, (month || 1) - 1, day || 1)
}

function formatDateKey(date: Date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function getCitySummary(cities: string[], fallback = '待填写城市') {
  const visibleCities = cities.map((city) => city.trim()).filter(Boolean)
  return visibleCities.length > 0 ? visibleCities.join(' / ') : fallback
}

export default App
