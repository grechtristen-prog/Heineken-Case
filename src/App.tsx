import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Activity, ArrowDownRight, ArrowRight, BadgeCheck, Bell, CalendarClock,
  Check, CheckCircle2, ChevronRight, CircleAlert, Clock3, Filter,
  ListFilter, MessageSquareText, RotateCcw, Search, Send, Star, X,
} from 'lucide-react'
import rawData from './data/demo.json'
import { buildOutcomeRequest, prepareAccountAction, submitOutcome } from './api'
import {
  applyOutcomeResponse, createEventId, currency, displayDate, loadState, OUTCOMES, prepareAction,
  resetState, saveState, shortDate, SIMULATION_DATE,
} from './logic'
import type { Account, DemoData, DemoState, Outcome, ReasonType } from './types'

const data = rawData as DemoData
type View = 'accounts' | 'followups'

const reasonNames: Record<ReasonType, string> = {
  rhythm: 'Order rhythm', spend: 'Spend decline', category: 'Dropped line', service: 'Service experience',
}

function issueText(account: Account): string {
  const issue = account.serviceIssues[0]
  if (!issue) return ''
  return issue.type === 'review'
    ? `${issue.score}/5 review submitted ${displayDate(issue.date)}`
    : `Late delivery recorded ${displayDate(issue.date)}`
}

function reasonText(account: Account, type: ReasonType): string {
  if (type === 'rhythm') return `${account.daysSinceOrder} days since the last order, versus a ${account.typicalIntervalDays}-day typical interval.`
  if (type === 'spend') return `Recent 90-day spend is ${account.spendDeclinePct}% below the previous 90 days (${currency(account.recentSpend)} vs ${currency(account.baselineSpend)}).`
  if (type === 'category') {
    const category = account.droppedCategories[0]
    return category ? `${category.category} appeared in ${category.previousOrders} earlier orders; last seen ${displayDate(category.lastDate)}.` : 'A regular portfolio line is overdue.'
  }
  return issueText(account)
}

function StatusPill({ account }: { account: Account }) {
  const labels = {
    'operational churn': 'Inactive', 'early risk': 'At risk',
    active: 'On track', 'insufficient history': 'Limited history',
  }
  return <span className={`status-pill status-${account.churnStatus.replaceAll(' ', '-')}`}>{labels[account.churnStatus]}</span>
}

function Chart({ account }: { account: Account }) {
  const max = Math.max(...account.monthlySpend.map(month => month.spend), 1)
  return <div className="chart" aria-label="Monthly item spend for the last eight months">
    {account.monthlySpend.map(month => <div className="chart-column" key={month.month} title={`${month.month}: ${currency(month.spend)}`}>
      <div className="chart-track"><div className={`chart-bar ${month.spend === 0 ? 'empty' : ''}`} style={{ height: `${Math.max(3, month.spend / max * 100)}%` }} /></div>
      <span>{month.month.slice(5)}</span>
    </div>)}
  </div>
}

function App() {
  const [view, setView] = useState<View>('accounts')
  const [state, setState] = useState<DemoState>(loadState)
  const [selectedId, setSelectedId] = useState(data.accounts[0].accountId)
  const [query, setQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [signalFilter, setSignalFilter] = useState('all')
  const [outcome, setOutcome] = useState<Outcome>('callback')
  const [notes, setNotes] = useState('')
  const [dueDate, setDueDate] = useState('')
  const [reschedulingId, setReschedulingId] = useState('')
  const [rescheduleDate, setRescheduleDate] = useState('')
  const [notice, setNotice] = useState('')
  const [integrationError, setIntegrationError] = useState('')
  const [preparePending, setPreparePending] = useState(false)
  const [recordPending, setRecordPending] = useState(false)
  const detailRef = useRef<HTMLElement>(null)

  useEffect(() => saveState(state), [state])
  useEffect(() => {
    if (!notice) return
    const timer = window.setTimeout(() => setNotice(''), 3500)
    return () => window.clearTimeout(timer)
  }, [notice])

  const account = data.accounts.find(item => item.accountId === selectedId) || data.accounts[0]
  const workflow = state.workflows[account.accountId]
  const openTasks = state.tasks.filter(task => task.status === 'open')
  const queue = useMemo(() => data.accounts.filter(item => {
    const matchesQuery = `${item.accountId} ${item.city} ${item.state}`.toLowerCase().includes(query.toLowerCase().trim())
    const matchesStatus = statusFilter === 'all' || item.churnStatus === statusFilter
    const matchesSignal = signalFilter === 'all' || item.riskReasons.some(reason => reason.type === signalFilter)
    return matchesQuery && matchesStatus && matchesSignal
  }), [query, statusFilter, signalFilter])

  function selectAccount(id: string) {
    setSelectedId(id)
    setView('accounts')
    setOutcome('callback')
    setNotes('')
    setDueDate('')
    setIntegrationError('')
    if (window.innerWidth < 1120) window.setTimeout(() => detailRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 30)
  }

  function updateWorkflow(update: Partial<NonNullable<typeof workflow>>) {
    setState(previous => ({
      ...previous,
      workflows: { ...previous.workflows, [account.accountId]: { ...previous.workflows[account.accountId], ...update } },
    }))
  }

  function handleReset() {
    resetState()
    setState({ workflows: {}, tasks: [], activities: [] })
    setNotice('Demo activity reset')
  }

  async function handlePrepare() {
    if (preparePending) return
    setPreparePending(true)
    setIntegrationError('')
    try {
      const result = await prepareAccountAction(account, data.analysisDate)
      const local = prepareAction(account)
      setState(previous => ({
        ...previous,
        workflows: { ...previous.workflows, [account.accountId]: {
          ...local,
          briefing: result.data.briefing,
          objective: result.data.objective,
          script: result.data.script,
          requiresApproval: result.data.requiresApproval,
          generationMode: result.data.generationMode,
          integrationSource: result.source,
          fallbackReason: result.fallbackReason,
        } },
      }))
      setNotice(result.source === 'n8n' ? 'Draft prepared by n8n' : 'Draft prepared with local fallback')
    } catch (error) {
      setIntegrationError(error instanceof Error ? error.message : 'Unable to prepare this action.')
    } finally {
      setPreparePending(false)
    }
  }

  async function handleRecord() {
    if (recordPending || !workflow || workflow.status !== 'contacted') return
    if (outcome === 'callback' && !dueDate) {
      setNotice('Choose the requested callback date')
      return
    }
    setRecordPending(true)
    setIntegrationError('')
    try {
      const eventId = workflow.eventId || createEventId(state, account.accountId)
      const request = buildOutcomeRequest(account.accountId, eventId, outcome, notes.trim(), dueDate || undefined)
      const result = await submitOutcome(request)
      setState(previous => applyOutcomeResponse(previous, account.accountId, outcome, notes.trim(), result.data, result.source, result.fallbackReason))
      setNotice(result.source === 'n8n' ? 'Outcome recorded through n8n' : 'Outcome recorded with local fallback')
    } catch (error) {
      setIntegrationError(error instanceof Error ? error.message : 'Unable to record this outcome.')
    } finally {
      setRecordPending(false)
    }
  }

  return <div className="app-shell">
    <aside className="sidebar">
      <div className="brand"><span className="brand-mark"><Star size={18} fill="currentColor" strokeWidth={2.5} /></span><span>HEINEKEN<small>Retention Copilot</small></span></div>
      <div className="sidebar-label">WORKSPACE</div>
      <nav aria-label="Primary navigation">
        <button className={`nav-item ${view === 'accounts' ? 'active' : ''}`} onClick={() => setView('accounts')}><ListFilter size={18} /> Accounts <span>{data.rankedAccounts}</span></button>
        <button className={`nav-item ${view === 'followups' ? 'active' : ''}`} onClick={() => setView('followups')}><CalendarClock size={18} /> Follow-ups <span>{openTasks.length}</span></button>
      </nav>
      <div className="sidebar-bottom">
        <div className="simulation-label"><span className="live-dot" /> STUDENT PROTOTYPE</div>
        <p>Real anonymized purchase history.<br />Contact and outcomes are simulated.</p>
        <button className="reset-button" onClick={handleReset} title="Clear demo activity"><RotateCcw size={15} /> Reset demo</button>
      </div>
    </aside>

    <main className="main-area">
      <header className="topbar">
        <div><span className="topbar-eyebrow">SALES ADVISOR WORKSPACE</span><h1>{view === 'accounts' ? 'Account priorities' : 'Follow-up queue'}</h1></div>
        <div className="topbar-right"><span className="date-badge"><Clock3 size={15} /> As of {displayDate(data.analysisDate)}</span><span className="rep-avatar" title="Demo sales representative">SR</span></div>
      </header>

      {view === 'accounts' ? <>
        <section className="overview" aria-label="Portfolio overview">
          <div className="overview-item"><span>PORTFOLIO</span><strong>{data.sourceAccounts.toLocaleString()}</strong><small>anonymized accounts</small></div>
          <div className="overview-item"><span>SCORABLE HISTORY</span><strong>{data.eligibleAccounts.toLocaleString()}</strong><small>6+ orders across 3+ months</small></div>
          <div className="overview-item"><span>PRIORITY QUEUE</span><strong>{data.rankedAccounts}</strong><small>highest ranked in this demo</small></div>
          <div className="overview-item emphasis"><span>OPEN FOLLOW-UPS</span><strong>{openTasks.length}</strong><small>from simulated contact</small></div>
        </section>

        <div className="workspace-grid">
          <section className="queue-pane" aria-label="Account queue">
            <div className="section-heading"><div><span className="eyebrow">IDENTIFY & PRIORITISE</span><h2>Accounts to review <span className="count">{queue.length}</span></h2></div><span className="sort-label"><Filter size={14} /> Priority order</span></div>
            <div className="queue-controls">
              <label className="search-field"><Search size={17} /><input value={query} onChange={event => setQuery(event.target.value)} placeholder="Search account or city" aria-label="Search account or city" />{query && <button onClick={() => setQuery('')} aria-label="Clear search"><X size={15} /></button>}</label>
              <div className="filters"><label><span>Status</span><select value={statusFilter} onChange={event => setStatusFilter(event.target.value)}><option value="all">All statuses</option><option value="early risk">At risk</option><option value="operational churn">Inactive</option><option value="active">On track</option><option value="insufficient history">Limited history</option></select></label><label><span>Signal</span><select value={signalFilter} onChange={event => setSignalFilter(event.target.value)}><option value="all">All signals</option><option value="rhythm">Order rhythm</option><option value="spend">Spend decline</option><option value="category">Dropped line</option><option value="service">Service experience</option></select></label></div>
            </div>
            <div className="queue-table-head"><span>ACCOUNT</span><span>KEY SIGNAL</span><span>PRIORITY</span><span></span></div>
            <div className="queue-list">
              {queue.map(item => <button className={`queue-row ${item.accountId === selectedId ? 'selected' : ''}`} key={item.accountId} onClick={() => selectAccount(item.accountId)} aria-label={`View ${item.accountId}`}>
                <div className="account-cell"><strong>{item.accountId}</strong><small>{item.city}, {item.state}</small></div>
                <div className="signal-cell"><StatusPill account={item} /><small>{item.riskReasons[0] ? reasonNames[item.riskReasons[0].type] : item.churnStatus === 'active' ? 'Normal ordering' : 'Monitor manually'}</small></div>
                <div className="priority-cell"><strong>{item.priorityScore.toFixed(1)}</strong><span className={`confidence-dot ${item.confidence}`} title={`${item.confidence} confidence`} /></div>
                <ChevronRight className="row-chevron" size={17} />
              </button>)}
              {queue.length === 0 && <div className="empty-state"><Search size={22} /><strong>No matching accounts</strong><span>Try a different search or filter.</span></div>}
            </div>
            <div className="queue-footnote"><CircleAlert size={15} /><span>Scores rank relative attention. They are not churn probabilities.</span></div>
          </section>

          <section className="detail-pane" ref={detailRef} aria-label="Account detail">
            <div className="detail-top"><div><span className="eyebrow">ACCOUNT BRIEFING</span><div className="detail-title"><h2>{account.accountId}</h2><StatusPill account={account} /></div><p>{account.city}, {account.state} <span className="separator">·</span> {account.orderCount} orders across {account.activeMonths} months</p></div><div className="priority-badge"><small>PRIORITY</small><strong>{account.priorityScore.toFixed(1)}</strong></div></div>
            <div className="confidence-line"><BadgeCheck size={16} /><span><strong>{account.confidence} confidence</strong> in the purchasing pattern</span><span className="value-tag">{account.valueTier} value</span></div>

            <div className="detail-section"><div className="detail-section-head"><h3>What changed</h3><span>Risk score {account.riskScore}/100</span></div>
              {account.riskReasons.length ? <div className="reason-list">{account.riskReasons.map(reason => <div className="reason-row" key={reason.type}><div className="reason-icon">{reason.type === 'service' ? <CircleAlert size={16} /> : reason.type === 'spend' ? <ArrowDownRight size={16} /> : <Activity size={16} />}</div><div><strong>{reasonNames[reason.type]}</strong><p>{reasonText(account, reason.type)}</p></div><span>+{reason.points}</span></div>)}</div> : <div className="neutral-message"><CheckCircle2 size={18} /><span>{account.established ? 'Ordering remains within the observed pattern.' : 'Too little history for a confident decline assessment. Review manually.'}</span></div>}
            </div>

            <div className="detail-section"><div className="detail-section-head"><h3>Purchase pattern</h3><span>Item spend · BRL</span></div><Chart account={account} /><div className="pattern-stats"><div><span>LAST ORDER</span><strong>{displayDate(account.lastOrderDate)}</strong></div><div><span>TYPICAL GAP</span><strong>{account.typicalIntervalDays ? `${account.typicalIntervalDays} days` : 'Not established'}</strong></div><div><span>LAST 90 DAYS</span><strong>{currency(account.recentSpend)}</strong></div></div></div>

            <div className="detail-section recent-orders"><div className="detail-section-head"><h3>Recent orders</h3><span>Latest 8</span></div>{account.recentOrders.map((order, index) => <div className="order-row" key={`${order.date}-${index}`}><span>{displayDate(order.date)}</span><span>{order.categories.slice(0, 2).join(', ') || 'No line data'}</span><strong>{currency(order.revenue)}</strong></div>)}</div>

            <div className="action-section"><div className="action-heading"><div><span className="eyebrow">ACT</span><h3>Next best conversation</h3></div><MessageSquareText size={20} /></div>
              {integrationError && <div className="integration-error" role="alert"><CircleAlert size={17} /><span>{integrationError}</span></div>}
              {!workflow ? <><p className="action-intro">Prepare a conversation based on this account’s observed signals.</p><button className="primary-button" disabled={preparePending} onClick={handlePrepare}>{preparePending ? 'Preparing…' : 'Prepare action'} {!preparePending && <ArrowRight size={17} />}</button></> : <>
                <div className="workflow-steps"><span className="done">Draft</span><span className={workflow.status === 'approved' || workflow.status === 'contacted' || workflow.status === 'recorded' ? 'done' : ''}>Approve</span><span className={workflow.status === 'contacted' || workflow.status === 'recorded' ? 'done' : ''}>Contact</span><span className={workflow.status === 'recorded' ? 'done' : ''}>Outcome</span></div>
                <div className={`integration-source ${workflow.integrationSource}`} title={workflow.fallbackReason || ''}>{workflow.integrationSource === 'n8n' ? 'n8n workflow' : 'Local fallback'} <span>· {workflow.generationMode}</span></div>
                <div className="briefing"><span>BRIEFING</span><p>{workflow.briefing}</p></div>
                <div className="objective"><span>OBJECTIVE</span><strong>{workflow.objective}</strong></div>
                <label className="script-label" htmlFor="script">Call script</label><textarea id="script" value={workflow.script} disabled={workflow.status === 'contacted' || workflow.status === 'recorded'} onChange={event => updateWorkflow({ script: event.target.value, status: 'draft' })} rows={5} />
                {workflow.status === 'draft' && <button className="primary-button" disabled={!workflow.script.trim()} onClick={() => { updateWorkflow({ status: 'approved' }); setNotice('Script approved') }}><Check size={17} /> Approve script</button>}
                {workflow.status === 'approved' && <button className="primary-button" onClick={() => { updateWorkflow({ status: 'contacted', eventId: createEventId(state, account.accountId) }); setNotice('Contact simulated. Select a response.') }}><Send size={17} /> Simulate contact</button>}
                {workflow.status === 'contacted' && <div className="outcome-form"><span className="form-overline">SIMULATED RESPONSE</span><div className="outcome-grid">{OUTCOMES.map(option => <button disabled={recordPending} className={outcome === option.id ? 'chosen' : ''} key={option.id} onClick={() => { setOutcome(option.id); setDueDate('') }}>{option.label}</button>)}</div><label className="field-label">Notes <textarea disabled={recordPending} value={notes} onChange={event => setNotes(event.target.value)} rows={2} placeholder="Optional context for the next step" /></label>{outcome === 'callback' && <label className="field-label">Requested callback date <input disabled={recordPending} type="date" min={SIMULATION_DATE} value={dueDate} onChange={event => setDueDate(event.target.value)} /></label>}<button className="primary-button" disabled={recordPending} onClick={handleRecord}>{recordPending ? 'Recording…' : 'Record outcome'} {!recordPending && <ArrowRight size={17} />}</button></div>}
                {workflow.status === 'recorded' && <><div className="recorded"><CheckCircle2 size={19} /><div><strong>Outcome recorded</strong><span>{OUTCOMES.find(item => item.id === workflow.outcome)?.label}. Follow-up appears in the queue.</span></div><button onClick={() => setView('followups')}>View tasks <ArrowRight size={14} /></button></div><button className="new-action-button" onClick={() => { setState(previous => { const workflows = { ...previous.workflows }; delete workflows[account.accountId]; return { ...previous, workflows } }); setOutcome('callback'); setNotes(''); setDueDate(''); setIntegrationError('') }}>Prepare another action</button></>}
              </>}
            </div>
          </section>
        </div>
        <section className="evidence-strip"><div><span className="eyebrow">HISTORICAL CHECK</span><h2>A useful signal, with limits</h2></div><p>Using a {displayDate(data.historicalCheck.cutoff)} snapshot, <strong>{data.historicalCheck.topQuintileNoOrderPct}%</strong> of the highest-risk fifth had no qualifying order through {displayDate(data.historicalCheck.horizonEnd)}, versus <strong>{data.historicalCheck.cohortNoOrderPct}%</strong> across {data.historicalCheck.eligibleAccounts.toLocaleString()} established accounts. This is a retrospective ordering check, not a measured retention impact or a churn probability.</p></section>
      </> : <section className="followups-view"><div className="section-heading"><div><span className="eyebrow">ACT & FOLLOW THROUGH</span><h2>Tasks requiring attention <span className="count">{openTasks.length}</span></h2></div><span className="simulation-date"><Bell size={16} /> Simulation date {displayDate(SIMULATION_DATE)}</span></div>
        {state.tasks.length ? <div className="task-list">{state.tasks.map(task => <div className={`task-row ${task.status !== 'open' ? 'task-closed' : ''}`} key={task.id}><div className="task-icon">{task.status === 'open' ? <CalendarClock size={19} /> : <CheckCircle2 size={19} />}</div><div className="task-main"><strong>{task.title}</strong><button onClick={() => selectAccount(task.accountId)}>{task.accountId} <ChevronRight size={14} /></button></div><div className="task-date"><span>Due {displayDate(task.dueDate)}</span><small>{task.status}</small></div>{task.status === 'open' && <div className="task-actions"><button title="Reschedule task" aria-label={`Reschedule ${task.title}`} onClick={() => { setReschedulingId(task.id); setRescheduleDate(task.dueDate) }}><CalendarClock size={16} /></button><button title="Complete task" aria-label={`Complete ${task.title}`} onClick={() => { setState(previous => ({ ...previous, tasks: previous.tasks.map(item => item.id === task.id ? { ...item, status: 'completed' } : item) })); setNotice('Task completed') }}><Check size={17} /></button><button title="Cancel task" aria-label={`Cancel ${task.title}`} onClick={() => { setState(previous => ({ ...previous, tasks: previous.tasks.map(item => item.id === task.id ? { ...item, status: 'cancelled' } : item) })); setNotice('Task cancelled') }}><X size={17} /></button></div>}{reschedulingId === task.id && task.status === 'open' && <form className="reschedule-form" onSubmit={event => { event.preventDefault(); if (!rescheduleDate) return; setState(previous => ({ ...previous, tasks: previous.tasks.map(item => item.id === task.id ? { ...item, dueDate: rescheduleDate } : item) })); setReschedulingId(''); setNotice('Task rescheduled') }}><label>New due date <input type="date" min={SIMULATION_DATE} value={rescheduleDate} onChange={event => setRescheduleDate(event.target.value)} /></label><button className="secondary-button" type="submit">Save date</button><button className="text-button" type="button" onClick={() => setReschedulingId('')}>Cancel</button></form>}</div>)}</div> : <div className="followup-empty"><CalendarClock size={30} /><h3>No follow-ups yet</h3><p>Record an account response to create a task here.</p><button className="secondary-button" onClick={() => setView('accounts')}>Review accounts <ArrowRight size={16} /></button></div>}
        {state.activities.length > 0 && <div className="activity-log"><h3>Activity history</h3>{state.activities.map(entry => <div key={entry.id}><span>{shortDate(entry.date)}</span><p><strong>{entry.accountId}</strong> {entry.text}</p></div>)}</div>}
      </section>}
      <footer><span>Student prototype · Real anonymized account data · Simulated outreach</span><span>Built for the HEINEKEN × AISO challenge</span></footer>
    </main>
    {notice && <div className="toast" role="status"><CheckCircle2 size={17} /> {notice}</div>}
  </div>
}

export default App
