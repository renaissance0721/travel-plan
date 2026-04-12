import { useEffect, useMemo, useRef, useState } from 'react'
import './App.css'
import {
  deleteTripOnServer,
  fetchCurrentUser,
  fetchTrips,
  loginUser,
  logoutUser,
  registerUser,
  shareTripWithAccount,
  syncTrips,
} from './cloud-api'
import { loadTripsFromCache, saveTripsToCache } from './trip-cache'
import {
  AuthScreen,
  DayEditor,
  JournalView,
  Metric,
  SharePanel,
  SidebarTripEditor,
  SyncBadge,
  TripBasicsForm,
} from './trip-components'
import {
  CLOUD_SAVE_DELAY_MS,
  attachOwnedTripMeta,
  buildTripDays,
  computeTripStats,
  createId,
  emptyItemDraft,
  emptyTripForm,
  getCitySummary,
  normalizeTrips,
  stripTripPermissions,
  toTripForm,
  type AuthMode,
  type AuthStatus,
  type ItemDraft,
  type SyncState,
  type Trip,
  type TripDay,
  type TripForm,
  type TripItem,
  type User,
} from './trip-model'

function App() {
  const [authStatus, setAuthStatus] = useState<AuthStatus>('loading')
  const [authMode, setAuthMode] = useState<AuthMode>('login')
  const [authEmail, setAuthEmail] = useState('')
  const [authPassword, setAuthPassword] = useState('')
  const [authMessage, setAuthMessage] = useState('登录后即可同步你自己的旅行，并把单独的旅行分享给别的账号。')
  const [isAuthenticating, setIsAuthenticating] = useState(false)
  const [currentUser, setCurrentUser] = useState<User | null>(null)

  const [trips, setTrips] = useState<Trip[]>([])
  const [selectedTripId, setSelectedTripId] = useState('')
  const [editingTripId, setEditingTripId] = useState<string | null>(null)
  const [isCreatingTrip, setIsCreatingTrip] = useState(false)
  const [editingDayId, setEditingDayId] = useState<string | null>(null)
  const [tripForm, setTripForm] = useState<TripForm>(emptyTripForm())
  const [itemDrafts, setItemDrafts] = useState<Record<string, ItemDraft>>({})
  const [activeView, setActiveView] = useState<'planner' | 'journal'>('planner')
  const [syncState, setSyncState] = useState<SyncState>('idle')
  const [syncMessage, setSyncMessage] = useState('登录后可同步和共享旅行计划。')
  const [isLoadingTrips, setIsLoadingTrips] = useState(false)
  const [shareEmail, setShareEmail] = useState('')
  const [shareState, setShareState] = useState<SyncState>('idle')
  const [isWorkspacePanelOpen, setIsWorkspacePanelOpen] = useState(false)
  const [shareMessage, setShareMessage] = useState('把这趟旅行分享给别人的账号邮箱后，对方也能一起编辑。')
  const lastSyncedPayloadRef = useRef<string | null>(null)
  const hasHydratedRef = useRef(false)
  const saveTimerRef = useRef<number | null>(null)
  const selectionStateRef = useRef<{
    selectedTripId: string
    editingDayId: string | null
    activeView: 'planner' | 'journal'
  }>({
    selectedTripId: '',
    editingDayId: null,
    activeView: 'planner',
  })

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
    const loadState = { cancelled: false }

    async function bootstrap() {
      try {
        const user = await fetchCurrentUser()
        if (loadState.cancelled) return

        if (!user) {
          resetWorkspace()
          setCurrentUser(null)
          setAuthStatus('unauthenticated')
          setSyncState('idle')
          setSyncMessage('登录后可同步你自己的旅行，并把单独的旅行分享给别的账号。')
          return
        }

        await startUserSession(user, () => loadState.cancelled)
      } catch {
        if (loadState.cancelled) return
        resetWorkspace()
        setCurrentUser(null)
        setAuthStatus('unauthenticated')
        setAuthMessage('登录状态校验失败，请重新登录。')
        setSyncState('error')
        setSyncMessage('暂时无法校验登录状态。')
      }
    }

    void bootstrap()

    return () => {
      loadState.cancelled = true
      if (saveTimerRef.current !== null) {
        window.clearTimeout(saveTimerRef.current)
        saveTimerRef.current = null
      }
    }
  }, [])

  useEffect(() => {
    if (!currentUser) return
    saveTripsToCache(currentUser.email, trips)
  }, [currentUser, trips])

  useEffect(() => {
    selectionStateRef.current = {
      selectedTripId,
      editingDayId,
      activeView,
    }
  }, [activeView, editingDayId, selectedTripId])

  useEffect(() => {
    if (authStatus !== 'authenticated' || !currentUser || !hasHydratedRef.current) return

    const payload = serializeTripsForSync(trips)
    if (payload === lastSyncedPayloadRef.current) return

    setSyncState('saving')
    setSyncMessage('正在把你的旅行数据同步到云端...')

    if (saveTimerRef.current !== null) {
      window.clearTimeout(saveTimerRef.current)
    }

    const tripsToPersist = trips

    saveTimerRef.current = window.setTimeout(() => {
      void persistTrips(tripsToPersist)
    }, CLOUD_SAVE_DELAY_MS)

    return () => {
      if (saveTimerRef.current !== null) {
        window.clearTimeout(saveTimerRef.current)
        saveTimerRef.current = null
      }
    }
  }, [authStatus, currentUser, trips])

  useEffect(() => {
    if (!selectedTrip) {
      setShareEmail('')
      setShareState('idle')
      setShareMessage('把这趟旅行分享给别人的账号邮箱后，对方也能一起编辑。')
      return
    }

    setShareEmail('')
    setShareState('idle')
    setShareMessage(
      selectedTrip.accessRole === 'owner'
        ? '把这趟旅行分享给别人的账号邮箱后，对方也能一起编辑。'
        : `这趟旅行由 ${selectedTrip.ownerEmail || '其他账号'} 分享给你。`,
    )
  }, [selectedTrip?.id])

  async function startUserSession(user: User, isCancelled: () => boolean = () => false) {
    setCurrentUser(user)
    setAuthStatus('authenticated')
    setAuthPassword('')
    setAuthMessage('')
    setIsLoadingTrips(true)
    setSyncState('loading')

    const cachedTrips = loadTripsFromCache(user.email)
    if (cachedTrips.length > 0) {
      applyTripsSnapshot(cachedTrips)
      setSyncMessage('正在连接云端，先显示当前设备里的缓存数据...')
    } else {
      setSyncMessage('正在读取账号里的旅行数据...')
    }

    try {
      const remote = await fetchTrips()
      if (isCancelled()) return

      if (remote.trips.length === 0 && cachedTrips.length > 0) {
        const migrated = await syncTrips(cachedTrips.map(stripTripPermissions))
        if (isCancelled()) return

        const normalized = normalizeTrips(migrated.trips)
        applyTripsSnapshot(normalized)
        saveTripsToCache(user.email, normalized)
        lastSyncedPayloadRef.current = serializeTripsForSync(normalized)
        setSyncState('saved')
        setSyncMessage('已把当前设备里的旅行数据迁移到你的账号。')
      } else {
        const normalized = normalizeTrips(remote.trips)
        applyTripsSnapshot(normalized)
        saveTripsToCache(user.email, normalized)
        lastSyncedPayloadRef.current = serializeTripsForSync(normalized)
        setSyncState('saved')
        setSyncMessage(
          normalized.length > 0
            ? '已连接账号云端，登录同一个账号就能继续编辑这些旅行。'
            : '账号里还没有旅行，现在创建的新旅行会自动同步到云端。',
        )
      }
    } catch {
      if (isCancelled()) return
      lastSyncedPayloadRef.current = serializeTripsForSync(cachedTrips)
      setSyncState('error')
      setSyncMessage(
        cachedTrips.length > 0
          ? '云端读取失败，当前先继续使用这台设备上的缓存数据。'
          : '云端读取失败，当前账号下还没有可显示的数据。',
      )
    } finally {
      if (isCancelled()) return
      hasHydratedRef.current = true
      setIsLoadingTrips(false)
    }
  }

  function applyTripsSnapshot(
    nextTrips: Trip[],
    preferredTripId = selectionStateRef.current.selectedTripId,
    preferredView = selectionStateRef.current.activeView,
    preferredDayId = selectionStateRef.current.editingDayId,
  ) {
    const normalizedTrips = normalizeTrips(nextTrips)
    const nextPlanningTrips = normalizedTrips.filter((trip) => trip.status === 'planning')
    const nextArchivedTrips = normalizedTrips.filter((trip) => trip.status === 'archived')

    let nextView = preferredView
    if (nextView === 'planner' && nextPlanningTrips.length === 0 && nextArchivedTrips.length > 0) nextView = 'journal'
    if (nextView === 'journal' && nextArchivedTrips.length === 0 && nextPlanningTrips.length > 0) nextView = 'planner'

    const nextVisibleTrips = nextView === 'planner' ? nextPlanningTrips : nextArchivedTrips
    const nextSelectedTrip =
      nextVisibleTrips.find((trip) => trip.id === preferredTripId) ??
      nextVisibleTrips[0] ??
      nextPlanningTrips[0] ??
      nextArchivedTrips[0] ??
      null
    const nextSelectedDay =
      nextSelectedTrip?.days.find((day) => day.id === preferredDayId) ?? nextSelectedTrip?.days[0] ?? null

    setTrips(normalizedTrips)
    setActiveView(nextView)
    setSelectedTripId(nextSelectedTrip?.id ?? '')
    setEditingDayId(nextSelectedDay?.id ?? null)
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

  function resetWorkspace() {
    setTrips([])
    setSelectedTripId('')
    setEditingTripId(null)
    setEditingDayId(null)
    setTripForm(emptyTripForm())
    setItemDrafts({})
    setActiveView('planner')
    setIsCreatingTrip(false)
    setShareEmail('')
    setShareState('idle')
    setIsWorkspacePanelOpen(false)
    setShareMessage('把这趟旅行分享给别人的账号邮箱后，对方也能一起编辑。')
    setIsLoadingTrips(false)
    hasHydratedRef.current = false
    lastSyncedPayloadRef.current = null
  }

  async function persistTrips(tripsToPersist: Trip[]) {
    if (!currentUser) return

    try {
      const response = await syncTrips(tripsToPersist.map(stripTripPermissions))
      const normalized = normalizeTrips(response.trips)
      const {
        selectedTripId: preferredTripId,
        editingDayId: preferredDayId,
        activeView: preferredView,
      } = selectionStateRef.current
      applyTripsSnapshot(normalized, preferredTripId, preferredView, preferredDayId)
      saveTripsToCache(currentUser.email, normalized)
      lastSyncedPayloadRef.current = serializeTripsForSync(normalized)
      setSyncState('saved')
      setSyncMessage('已同步到云端，登录同一个账号的设备都会看到最新内容。')
    } catch (error) {
      setSyncState('error')
      setSyncMessage(error instanceof Error ? error.message : '同步到云端失败。')
    } finally {
      saveTimerRef.current = null
    }
  }

  async function handleAuthSubmit() {
    if (!authEmail.trim() || !authPassword.trim()) {
      setAuthMessage('请先填写账号邮箱和密码。')
      return
    }

    setIsAuthenticating(true)
    setAuthMessage(authMode === 'login' ? '正在登录...' : '正在创建账号...')

    try {
      const response =
        authMode === 'login'
          ? await loginUser(authEmail, authPassword)
          : await registerUser(authEmail, authPassword)

      if (!response.user) {
        throw new Error('账号登录状态建立失败，请重试。')
      }

      await startUserSession(response.user)
    } catch (error) {
      resetWorkspace()
      setCurrentUser(null)
      setAuthStatus('unauthenticated')
      setAuthMessage(error instanceof Error ? error.message : '账号操作失败。')
    } finally {
      setIsAuthenticating(false)
    }
  }

  async function handleLogout() {
    try {
      await logoutUser()
    } finally {
      resetWorkspace()
      setCurrentUser(null)
      setAuthStatus('unauthenticated')
      setAuthPassword('')
      setAuthMessage('你已经退出登录了。')
      setSyncState('idle')
      setSyncMessage('登录后可同步你自己的旅行，并把单独的旅行分享给别的账号。')
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
    setIsWorkspacePanelOpen(false)
    if (activeView === 'planner') {
      setTripFormFromTrip(trip)
    }
  }

  function startCreatingTrip() {
    setActiveView('planner')
    setTripForm(emptyTripForm())
    setEditingTripId(null)
    setIsCreatingTrip(true)
    setIsWorkspacePanelOpen(false)
  }

  function changeView(view: 'planner' | 'journal') {
    setActiveView(view)
    if (view === 'journal') {
      resetTripEditor()
    }

    const nextTrips = view === 'planner' ? planningTrips : archivedTrips
    const nextTrip = nextTrips.find((trip) => trip.id === selectedTripId) ?? nextTrips[0] ?? null

    setSelectedTripId(nextTrip?.id ?? '')
    setEditingDayId(nextTrip?.days[0]?.id ?? null)
    if (view === 'planner' && nextTrip) {
      setTripFormFromTrip(nextTrip)
      setIsCreatingTrip(false)
    } else if (view === 'planner') {
      setTripForm(emptyTripForm())
      setEditingTripId(null)
    }
  }

  function saveTrip() {
    if (!currentUser) return

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
      return
    }

    const newTrip = attachOwnedTripMeta(
      {
        id: createId(),
        ...tripForm,
        status: 'planning',
        createdAt: new Date().toISOString(),
        days: buildTripDays(tripForm.startDate, tripForm.endDate),
      },
      currentUser.email,
    )

    setTrips((current) => [newTrip, ...current])
    selectTrip(newTrip)
    setActiveView('planner')
    setTripFormFromTrip(newTrip)
    setIsCreatingTrip(false)
  }

  function duplicateTrip(trip: Trip) {
    if (!currentUser) return

    const nextTrip = attachOwnedTripMeta(
      {
        ...stripTripPermissions(trip),
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
      },
      currentUser.email,
    )

    setTrips((current) => [nextTrip, ...current])
    setActiveView('planner')
    selectTrip(nextTrip)
  }

  async function deleteTrip(tripId: string) {
    const targetTrip = trips.find((trip) => trip.id === tripId)
    if (!targetTrip) return

    if (targetTrip.canDelete === false) {
      window.alert('只有创建者可以删除这趟旅行。')
      return
    }

    const confirmed = window.confirm(
      `确认删除「${targetTrip.title}」吗？\n\n删除后，这趟旅行的计划、日程事项和归档内容都将无法恢复。`,
    )
    if (!confirmed) return

    try {
      const response = await deleteTripOnServer(tripId)
      const normalized = normalizeTrips(response.trips)
      applyTripsSnapshot(normalized, selectedTripId === tripId ? '' : selectedTripId, activeView)
      if (currentUser) {
        saveTripsToCache(currentUser.email, normalized)
      }
      lastSyncedPayloadRef.current = serializeTripsForSync(normalized)
      setSyncState('saved')
      setSyncMessage('旅行已从你的账号空间中删除。')
    } catch (error) {
      window.alert(error instanceof Error ? error.message : '删除旅行失败。')
    }
  }

  async function handleShareTrip() {
    if (!selectedTrip) return

    if (selectedTrip.canShare === false) {
      setShareState('error')
      setShareMessage('只有创建者可以继续分享这趟旅行。')
      return
    }

    if (!shareEmail.trim()) {
      setShareState('error')
      setShareMessage('请输入要分享给对方的账号邮箱。')
      return
    }

    setShareState('saving')
    setShareMessage('正在分享这趟旅行...')

    try {
      const response = await shareTripWithAccount(selectedTrip.id, shareEmail)
      const normalized = normalizeTrips(response.trips)
      applyTripsSnapshot(normalized, selectedTrip.id, activeView)
      if (currentUser) {
        saveTripsToCache(currentUser.email, normalized)
      }
      lastSyncedPayloadRef.current = serializeTripsForSync(normalized)
      setShareEmail('')
      setShareState('saved')
      setShareMessage('分享成功，对方登录自己的账号后就能看到这趟旅行。')
    } catch (error) {
      setShareState('error')
      setShareMessage(error instanceof Error ? error.message : '分享旅行失败。')
    }
  }

  function archiveTrip(tripId: string) {
    const targetTrip = trips.find((trip) => trip.id === tripId)
    if (!targetTrip) return

    const confirmed = window.confirm(
      `确认将「${targetTrip.title}」归档为旅行日记吗？\n\n归档后，这趟旅行会从“计划中”移动到“已归档”，所有共享成员也会看到相同状态。`,
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

  if (authStatus !== 'authenticated') {
    if (authStatus === 'loading') {
      return (
        <main className="auth-shell">
          <section className="auth-card">
            <span className="eyebrow">账号同步与共享旅行</span>
            <h1>你的旅行手账</h1>
            <p className="auth-copy">正在检查登录状态，请稍等一下。</p>
          </section>
        </main>
      )
    }

    return (
      <AuthScreen
        mode={authMode}
        email={authEmail}
        password={authPassword}
        isBusy={isAuthenticating}
        message={authMessage}
        onModeChange={setAuthMode}
        onEmailChange={setAuthEmail}
        onPasswordChange={setAuthPassword}
        onSubmit={handleAuthSubmit}
      />
    )
  }

  return (
    <main className="app-shell">
      <div className="app-topbar">
        <button
          className="ghost-button mobile-workspace-button topbar-action-button"
          onClick={() => setIsWorkspacePanelOpen(true)}
          aria-expanded={isWorkspacePanelOpen}
          aria-controls="travel-workspace-panel"
        >
          旅行工作台
        </button>
        <div className="topbar-actions">
          <button
            className="primary-button"
            onClick={() => (activeView === 'planner' ? startCreatingTrip() : changeView('planner'))}
          >
            {activeView === 'planner' ? '新建旅行' : '前往计划中'}
          </button>
          <button className="ghost-button" onClick={handleLogout}>退出登录</button>
        </div>
      </div>
      <button
        type="button"
        className={`mobile-sidebar-backdrop ${isWorkspacePanelOpen ? 'mobile-sidebar-backdrop-open' : ''}`}
        onClick={() => setIsWorkspacePanelOpen(false)}
        aria-label="关闭旅行工作台"
      />
      <section className="hero-panel">
        <div className="hero-copy">
          <span className="eyebrow">登录同步与共享旅行</span>
          <h1>你的旅行手账</h1>
          <p className="hero-text">
            你的旅行计划会绑定到当前账号。你可以把单独一趟旅行分享给别人的账号邮箱，一起编辑同一份计划。
          </p>
          <div className="account-chip-row">
            <span className="account-chip">当前账号：{currentUser?.email}</span>
          </div>
          <SyncBadge syncState={syncState} syncMessage={syncMessage} />
          <div className="hero-actions">
            <button
              className="primary-button"
              onClick={() => (activeView === 'planner' ? startCreatingTrip() : changeView('planner'))}
            >
              {activeView === 'planner' ? '新建旅行' : '前往计划中'}
            </button>
            <button className="ghost-button" onClick={handleLogout}>退出登录</button>
          </div>
        </div>
        <div className="hero-card">
          <Metric label="我可访问的旅行" value={trips.length} />
          <Metric label="计划中的旅行" value={planningTrips.length} />
          <Metric
            label="总事项数"
            value={trips.reduce((sum, trip) => sum + trip.days.reduce((acc, day) => acc + day.items.length, 0), 0)}
          />
        </div>
      </section>

      <section className="workspace-grid">
        <aside
          id="travel-workspace-panel"
          className={`panel sidebar ${isWorkspacePanelOpen ? 'sidebar-open' : ''}`}
        >
          <div className="sidebar-sheet-header">
            <span className="eyebrow">旅行工作台</span>
            <button className="mini-button sidebar-close-button" onClick={() => setIsWorkspacePanelOpen(false)}>
              关闭
            </button>
          </div>
          <div className="panel-header">
            <div>
              <h2>旅行工作台</h2>
              <p>左侧管理你可访问的旅行，右侧编辑每天的行程事项。</p>
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
                <span>{trip.accessRole === 'shared' ? `共享自 ${trip.ownerEmail || '其他账号'}` : '我创建的旅行'}</span>
              </button>
            ))}
          </div>

          {activeView === 'planner' ? (
            selectedTrip ? (
              <SidebarTripEditor
                tripForm={tripForm}
                onChange={handleTripFormChange}
                onSave={saveTrip}
              />
            ) : (
              <div className="sidebar-note">
                <h3>开始创建你的第一趟旅行</h3>
                <p>创建后它会自动绑定到当前账号，你也可以再把它分享给别人一起编辑。</p>
                <button className="primary-button" onClick={startCreatingTrip}>新建旅行</button>
              </div>
            )
          ) : (
            <div className="sidebar-note">
              <h3>归档旅行</h3>
              <p>这里会展示你自己创建的归档旅行，以及别人分享给你的归档旅行。</p>
            </div>
          )}
        </aside>

        <section className="panel main-panel">
          {activeView === 'journal' ? (
            selectedTrip ? (
              <>
                <JournalView trip={selectedTrip} onDuplicate={duplicateTrip} onDelete={deleteTrip} />
                <SharePanel
                  trip={selectedTrip}
                  shareEmail={shareEmail}
                  shareMessage={shareMessage}
                  shareState={shareState}
                  onShareEmailChange={setShareEmail}
                  onShare={handleShareTrip}
                />
              </>
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
          ) : isLoadingTrips ? (
            <div className="empty-state">
              <h2>正在读取旅行数据</h2>
              <p>请稍等一下，系统正在把当前账号可以访问的旅行加载出来。</p>
            </div>
          ) : !selectedTrip ? (
            <div className="empty-state">
              <h2>先创建你的第一趟旅行</h2>
              <p>创建后会自动同步到当前账号，你也可以把它分享给别人的账号邮箱。</p>
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

              <SharePanel
                trip={selectedTrip}
                shareEmail={shareEmail}
                shareMessage={shareMessage}
                shareState={shareState}
                onShareEmailChange={setShareEmail}
                onShare={handleShareTrip}
              />

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
                <button className="danger-button" onClick={() => deleteTrip(selectedTrip.id)} disabled={selectedTrip.canDelete === false}>
                  {selectedTrip.canDelete === false ? '仅创建者可删除' : '删除这趟旅行'}
                </button>
              </div>
            </>
          )}
        </section>
      </section>
    </main>
  )
}

function serializeTripsForSync(trips: Trip[]) {
  return JSON.stringify(trips.map(stripTripPermissions))
}

export default App
