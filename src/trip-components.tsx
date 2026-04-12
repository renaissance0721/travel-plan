import type { ReactNode } from 'react'
import {
  CATEGORY_LABELS,
  PROGRESS_LABELS,
  TRANSPORT_LABELS,
  computeTripStats,
  formatDate,
  getCitySummary,
  type AuthMode,
  type ItemCategory,
  type ItemDraft,
  type SyncState,
  type TransportMode,
  type Trip,
  type TripDay,
  type TripForm,
  type TripItem,
} from './trip-model'

export function AuthScreen({
  mode,
  email,
  password,
  isBusy,
  message,
  onModeChange,
  onEmailChange,
  onPasswordChange,
  onSubmit,
}: {
  mode: AuthMode
  email: string
  password: string
  isBusy: boolean
  message: string
  onModeChange: (mode: AuthMode) => void
  onEmailChange: (value: string) => void
  onPasswordChange: (value: string) => void
  onSubmit: () => void
}) {
  return (
    <main className="auth-shell">
      <section className="auth-card">
        <span className="eyebrow">账号同步与共享旅行</span>
        <h1>你的旅行手账</h1>
        <p className="auth-copy">注册后，旅行计划会绑定到你的账号，也可以把单独的旅行分享给别的账号一起编辑。</p>
        <div className="view-toggle auth-toggle">
          <button className={mode === 'login' ? 'toggle-active' : ''} onClick={() => onModeChange('login')}>
            登录
          </button>
          <button className={mode === 'register' ? 'toggle-active' : ''} onClick={() => onModeChange('register')}>
            注册
          </button>
        </div>
        <label>
          账号邮箱
          <input value={email} onChange={(event) => onEmailChange(event.target.value)} placeholder="you@example.com" />
        </label>
        <label>
          密码
          <input
            type="password"
            value={password}
            onChange={(event) => onPasswordChange(event.target.value)}
            placeholder="至少 8 位"
          />
        </label>
        <button className="primary-button" onClick={onSubmit} disabled={isBusy}>
          {isBusy ? '提交中...' : mode === 'login' ? '登录并进入旅行手账' : '注册并进入旅行手账'}
        </button>
        <p className="auth-feedback">{message}</p>
      </section>
    </main>
  )
}

export function Metric({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="metric">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  )
}

export function SyncBadge({ syncState, syncMessage }: { syncState: SyncState; syncMessage: string }) {
  return <p className={`sync-status sync-status-${syncState}`}>{syncMessage}</p>
}

export function SharePanel({
  trip,
  shareEmail,
  shareMessage,
  shareState,
  onShareEmailChange,
  onShare,
}: {
  trip: Trip
  shareEmail: string
  shareMessage: string
  shareState: SyncState
  onShareEmailChange: (value: string) => void
  onShare: () => void
}) {
  return (
    <section className="share-card">
      <div className="section-title">
        <h3>共享旅行计划</h3>
        <span className="badge">{trip.accessRole === 'owner' ? '你是创建者' : `来自 ${trip.ownerEmail || '其他账号'}`}</span>
      </div>
      {trip.accessRole === 'owner' ? (
        <>
          <p>把这趟旅行分享给对方的账号邮箱后，对方登录自己的账号就能看到并一起编辑。</p>
          <div className="share-form">
            <input value={shareEmail} onChange={(event) => onShareEmailChange(event.target.value)} placeholder="friend@example.com" />
            <button className="primary-button" onClick={onShare}>分享给这个账号</button>
          </div>
          <p className={`share-feedback share-feedback-${shareState}`}>{shareMessage}</p>
          {trip.sharedWith && trip.sharedWith.length > 0 ? (
            <div className="share-list">
              {trip.sharedWith.map((email) => (
                <span key={email} className="badge">{email}</span>
              ))}
            </div>
          ) : (
            <p className="share-empty">这趟旅行目前还没有分享给其他账号。</p>
          )}
        </>
      ) : (
        <>
          <p>这趟旅行已由 {trip.ownerEmail || '其他账号'} 分享给你，你的修改会同步给所有参与者。</p>
          <p className="share-empty">只有创建者可以继续分享或删除这趟旅行。</p>
        </>
      )}
    </section>
  )
}

export function SidebarTripEditor({
  tripForm,
  onChange,
  onSave,
}: {
  tripForm: TripForm
  onChange: <K extends keyof TripForm>(key: K, value: TripForm[K]) => void
  onSave: () => void
}) {
  return (
    <section className="sidebar-trip-info">
      <div className="section-title">
        <h3>旅行基础信息</h3>
        <span className="badge">{tripForm.cover || '未填写主题'}</span>
      </div>
      <label>
        旅行名称
        <input value={tripForm.title} onChange={(event) => onChange('title', event.target.value)} placeholder="例如：京都红叶五日" />
      </label>
      <div className="two-column">
        <label>
          出发地
          <input value={tripForm.departure} onChange={(event) => onChange('departure', event.target.value)} placeholder="上海" />
        </label>
        <label>
          目的地
          <input value={tripForm.destination} onChange={(event) => onChange('destination', event.target.value)} placeholder="东京" />
        </label>
      </div>
      <div className="two-column">
        <label>
          开始日期
          <input type="date" value={tripForm.startDate} onChange={(event) => onChange('startDate', event.target.value)} />
        </label>
        <label>
          结束日期
          <input type="date" value={tripForm.endDate} onChange={(event) => onChange('endDate', event.target.value)} />
        </label>
      </div>
      <label>
        封面主题
        <input value={tripForm.cover} onChange={(event) => onChange('cover', event.target.value)} placeholder="海岸、雪山、古城" />
      </label>
      <label>
        旅行说明
        <textarea rows={3} value={tripForm.summary} onChange={(event) => onChange('summary', event.target.value)} placeholder="这趟旅行主要想玩什么？" />
      </label>
      <div className="sidebar-trip-actions">
        <button className="ghost-button" onClick={onSave}>保存基础信息</button>
      </div>
    </section>
  )
}

export function TripBasicsForm({
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
      <label>
        旅行名称
        <input value={tripForm.title} onChange={(event) => onChange('title', event.target.value)} placeholder="例如：京都红叶五日" />
      </label>
      <div className="two-column">
        <label>
          出发地
          <input value={tripForm.departure} onChange={(event) => onChange('departure', event.target.value)} placeholder="上海" />
        </label>
        <label>
          目的地
          <input value={tripForm.destination} onChange={(event) => onChange('destination', event.target.value)} placeholder="东京" />
        </label>
      </div>
      <div className="two-column">
        <label>
          开始日期
          <input type="date" value={tripForm.startDate} onChange={(event) => onChange('startDate', event.target.value)} />
        </label>
        <label>
          结束日期
          <input type="date" value={tripForm.endDate} onChange={(event) => onChange('endDate', event.target.value)} />
        </label>
      </div>
      <label>
        封面主题
        <input value={tripForm.cover} onChange={(event) => onChange('cover', event.target.value)} placeholder="海岸、雪山、古城" />
      </label>
      <label>
        旅行说明
        <textarea rows={3} value={tripForm.summary} onChange={(event) => onChange('summary', event.target.value)} placeholder="这趟旅行主要想玩什么？" />
      </label>
      <button className="primary-button" onClick={onSubmit}>{actionLabel}</button>
    </section>
  )
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label>
      {label}
      {children}
    </label>
  )
}

export function DayEditor({
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
        <label>
          当天备注
          <textarea rows={2} value={day.note} onChange={(event) => onDayChange(day.id, { note: event.target.value })} placeholder="写下今天的重点安排。" />
        </label>
      </div>

      <div className="editor-card">
        <div className="section-title">
          <h3>新增事项</h3>
          <p>每个事项都可以单独修改、排序和删除。</p>
        </div>
        <label>
          事项标题
          <input value={draft.title} onChange={(event) => onDraftChange(day.id, 'title', event.target.value)} placeholder="例如：从酒店前往清水寺" />
        </label>
        <div className="three-column">
          <label>
            开始时间
            <input type="time" value={draft.startTime} onChange={(event) => onDraftChange(day.id, 'startTime', event.target.value)} />
          </label>
          <label>
            结束时间
            <input type="time" value={draft.endTime} onChange={(event) => onDraftChange(day.id, 'endTime', event.target.value)} />
          </label>
          <label>
            事项类型
            <select value={draft.category} onChange={(event) => onDraftChange(day.id, 'category', event.target.value as ItemCategory)}>
              {Object.entries(CATEGORY_LABELS).map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          </label>
        </div>
        <div className="two-column">
          <label>
            从哪里
            <input value={draft.from} onChange={(event) => onDraftChange(day.id, 'from', event.target.value)} placeholder="京都站" />
          </label>
          <label>
            到哪里
            <input value={draft.to} onChange={(event) => onDraftChange(day.id, 'to', event.target.value)} placeholder="伏见稻荷大社" />
          </label>
        </div>
        <div className="three-column">
          <label>
            交通方式
            <select value={draft.transportMode} onChange={(event) => onDraftChange(day.id, 'transportMode', event.target.value as TransportMode)}>
              {Object.entries(TRANSPORT_LABELS).map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          </label>
          <label>
            实际费用
            <input value={draft.actualCost} onChange={(event) => onDraftChange(day.id, 'actualCost', event.target.value)} placeholder="42" />
          </label>
        </div>
        <label>
          备注
          <textarea rows={2} value={draft.notes} onChange={(event) => onDraftChange(day.id, 'notes', event.target.value)} placeholder="预约信息、提醒事项、路线细节等。" />
        </label>
        <button className="primary-button" onClick={() => onAddItem(day.id)}>添加到当天行程</button>
      </div>

      <div className="item-list">
        {day.items.length === 0 ? (
          <div className="empty-state compact"><p>还没有添加事项，可以先在上方新增一条行程。</p></div>
        ) : (
          day.items.map((item) => (
            <details key={item.id} className="item-card collapsible-item">
              <summary className="collapsible-summary">
                <span className="badge">{CATEGORY_LABELS[item.category]}</span>
                <strong className="item-summary-title">{item.title || '未填写标题'}</strong>
              </summary>
              <div className="item-card-body">
                <div className="item-detail-badges">
                  <span className="badge">{TRANSPORT_LABELS[item.transportMode]}</span>
                  <span className={`badge ${item.progress === 'done' ? 'done' : ''}`}>{PROGRESS_LABELS[item.progress]}</span>
                </div>
                <div className="item-grid">
                  <Field label="标题"><input value={item.title} onChange={(event) => onUpdateItem(day.id, item.id, { title: event.target.value })} /></Field>
                  <Field label="开始时间"><input type="time" value={item.startTime} onChange={(event) => onUpdateItem(day.id, item.id, { startTime: event.target.value })} /></Field>
                  <Field label="结束时间"><input type="time" value={item.endTime} onChange={(event) => onUpdateItem(day.id, item.id, { endTime: event.target.value })} /></Field>
                  <Field label="起点"><input value={item.from} onChange={(event) => onUpdateItem(day.id, item.id, { from: event.target.value })} /></Field>
                  <Field label="终点"><input value={item.to} onChange={(event) => onUpdateItem(day.id, item.id, { to: event.target.value })} /></Field>
                  <Field label="交通方式">
                    <select value={item.transportMode} onChange={(event) => onUpdateItem(day.id, item.id, { transportMode: event.target.value as TransportMode })}>
                      {Object.entries(TRANSPORT_LABELS).map(([value, label]) => (
                        <option key={value} value={value}>{label}</option>
                      ))}
                    </select>
                  </Field>
                  <Field label="事项类型">
                    <select value={item.category} onChange={(event) => onUpdateItem(day.id, item.id, { category: event.target.value as ItemCategory })}>
                      {Object.entries(CATEGORY_LABELS).map(([value, label]) => (
                        <option key={value} value={value}>{label}</option>
                      ))}
                    </select>
                  </Field>
                  <Field label="实际费用"><input value={item.actualCost} onChange={(event) => onUpdateItem(day.id, item.id, { actualCost: event.target.value })} /></Field>
                </div>
                <label>
                  备注
                  <textarea rows={2} value={item.notes} onChange={(event) => onUpdateItem(day.id, item.id, { notes: event.target.value })} />
                </label>
                <div className="item-actions">
                  <button className="mini-button" onClick={() => onUpdateItem(day.id, item.id, { progress: item.progress === 'done' ? 'todo' : 'done' })}>
                    {item.progress === 'done' ? '标记为待完成' : '标记为已完成'}
                  </button>
                  <button className="mini-button" onClick={() => onMoveItem(day.id, item.id, 'up')}>上移</button>
                  <button className="mini-button" onClick={() => onMoveItem(day.id, item.id, 'down')}>下移</button>
                  <button className="danger-button" onClick={() => onRemoveItem(day.id, item.id)}>删除事项</button>
                </div>
              </div>
            </details>
          ))
        )}
      </div>
    </div>
  )
}

export function JournalView({
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
            <Metric label="实际总花费" value={`楼 ${stats.actualTotal || 0}`} />
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
              {day.items.length === 0 ? (
                <div className="empty-state compact"><p>这一天没有记录事项。</p></div>
              ) : (
                day.items.map((item) => (
                  <details key={item.id} className="timeline-card collapsible-item">
                    <summary className="collapsible-summary">
                      <span className="badge">{CATEGORY_LABELS[item.category]}</span>
                      <strong className="item-summary-title">{item.title || '未填写标题'}</strong>
                    </summary>
                    <div className="timeline-card-body">
                      <div className="timeline-time">
                        <strong>{item.startTime || '--:--'}</strong>
                        <span>{item.endTime || '未结束'}</span>
                      </div>
                      <div className="timeline-content">
                        <div className="item-detail-badges">
                          <span className="badge">{TRANSPORT_LABELS[item.transportMode]}</span>
                          <span className={`badge ${item.progress === 'done' ? 'done' : ''}`}>{PROGRESS_LABELS[item.progress]}</span>
                        </div>
                        <p>{item.from || '未填写起点'} 到 {item.to || '未填写终点'}</p>
                        <p>实际花费 楼 {item.actualCost || '0'}</p>
                        {item.notes ? <p>{item.notes}</p> : null}
                      </div>
                    </div>
                  </details>
                ))
              )}
            </div>
          </section>
        ))}
      </div>
      <div className="danger-action-row">
        <button className="danger-button" onClick={() => onDelete(trip.id)} disabled={!trip.canDelete}>
          {trip.canDelete === false ? '仅创建者可删除' : '删除这趟旅行'}
        </button>
      </div>
    </div>
  )
}
