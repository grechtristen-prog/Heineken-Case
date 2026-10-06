import type {
  Account, Activity, DemoState, Outcome, OutcomeType, RecordOutcomeRequest,
  RecordOutcomeResponse, Task, TaskUpsertInstruction, Workflow,
} from './types'

export const SIMULATION_DATE = '2018-09-03'
export const INITIAL_STATE: DemoState = { workflows: {}, tasks: [], activities: [] }
const STORAGE_KEY = 'heineken-retention-copilot-v1'

const LEGACY_PURPOSES: Record<string, string> = {
  callback: 'retention_callback', service: 'service_issue_resolution', proposal: 'category_proposal',
  review: 'demand_review', 'follow-up': 'retention_contact_reminder', monitor: 'retention_monitoring',
}

export const currency = (value: number) => new Intl.NumberFormat('en-US', {
  style: 'currency', currency: 'BRL', maximumFractionDigits: 0,
}).format(value)

export const displayDate = (value: string | null) => value
  ? new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${value}T12:00:00Z`))
  : 'No order'

export const shortDate = (value: string) => new Intl.DateTimeFormat('en-GB', {
  day: 'numeric', month: 'short', timeZone: 'UTC',
}).format(new Date(`${value}T12:00:00Z`))

function migrateState(parsed: DemoState): DemoState {
  const workflows = Object.fromEntries(Object.entries(parsed.workflows).map(([accountId, workflow]) => [accountId, {
    ...workflow,
    briefing: workflow.briefing || 'Prepared from the account evidence available in this browser session.',
    requiresApproval: true as const,
    generationMode: workflow.generationMode || 'template',
    integrationSource: workflow.integrationSource || 'local_fallback',
    fallbackReason: workflow.fallbackReason || 'Saved before n8n integration was configured.',
  }]))
  const tasks = parsed.tasks.map(task => ({ ...task, purpose: LEGACY_PURPOSES[task.purpose] || task.purpose }))
  return { workflows, tasks, activities: parsed.activities }
}

export function loadState(): DemoState {
  try {
    const value = localStorage.getItem(STORAGE_KEY)
    if (!value) return INITIAL_STATE
    const parsed = JSON.parse(value) as DemoState
    if (parsed && typeof parsed.workflows === 'object' && Array.isArray(parsed.tasks) && Array.isArray(parsed.activities)) return migrateState(parsed)
  } catch { /* Reset invalid or unavailable local storage. */ }
  return INITIAL_STATE
}

export function saveState(state: DemoState): void {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)) } catch { /* The demo remains usable without persistence. */ }
}

export function resetState(): void {
  try { localStorage.removeItem(STORAGE_KEY) } catch { /* State is also reset in React. */ }
}

export function prepareAction(account: Pick<Account, 'riskReasons' | 'droppedCategories' | 'serviceIssues'>): Workflow {
  const has = (type: string) => account.riskReasons.some(reason => reason.type === type)
  if (has('service')) {
    const issue = account.serviceIssues[0]
    const fact = issue?.type === 'review' ? `a ${issue.score}/5 review` : 'a late delivery'
    return {
      status: 'draft', actionType: 'service',
      briefing: `The supplied account evidence includes ${fact}. Verify whether the concern is still unresolved.`,
      objective: 'Investigate the service concern before discussing a new order.',
      script: `Hello, I am following up on ${fact} recorded for your account. Has the issue been resolved? What would help make your next delivery work better for you?`,
      requiresApproval: true, generationMode: 'template', integrationSource: 'local_fallback',
    }
  }
  if (has('category') && account.droppedCategories.length) {
    const category = account.droppedCategories[0].category
    return {
      status: 'draft', actionType: 'category', briefing: `${category} is a supplied dropped-category signal.`,
      objective: `Understand whether ${category} is still relevant without assuming demand.`,
      script: `Hello, I noticed ${category} has not appeared in your recent orders. Has demand changed, or is there another reason? Would it be useful to revisit this line?`,
      requiresApproval: true, generationMode: 'template', integrationSource: 'local_fallback',
    }
  }
  if (has('rhythm')) {
    return {
      status: 'draft', actionType: 'rhythm', briefing: 'The supplied evidence shows a change from the established ordering rhythm.',
      objective: 'Check current needs and whether ordering has become difficult.',
      script: 'Hello, I am checking in on your next order. Your usual order rhythm has changed recently. Have your requirements changed, or has anything made ordering more difficult?',
      requiresApproval: true, generationMode: 'template', integrationSource: 'local_fallback',
    }
  }
  if (has('spend')) {
    return {
      status: 'draft', actionType: 'spend', briefing: 'The supplied evidence shows lower recent spend; this is a risk score input, not a churn probability.',
      objective: 'Understand the lower order volume before suggesting a response.',
      script: 'Hello, I wanted to check how your current stock and demand are looking. Have your requirements changed, or is there anything making ordering more difficult?',
      requiresApproval: true, generationMode: 'template', integrationSource: 'local_fallback',
    }
  }
  return {
    status: 'draft', actionType: 'monitor', briefing: 'No specific risk evidence is available; verify current needs without assuming a decline.',
    objective: 'Review account needs without assuming a decline.',
    script: 'Hello, I am checking in to see how things are going and whether we can help with your next order.',
    requiresApproval: true, generationMode: 'template', integrationSource: 'local_fallback',
  }
}

export const OUTCOMES: { id: Outcome; apiId: OutcomeType; label: string; task: string; purpose: string; days: number }[] = [
  { id: 'callback', apiId: 'callback_requested', label: 'Callback requested', task: 'Call customer back', purpose: 'retention_callback', days: 3 },
  { id: 'service', apiId: 'delivery_unresolved', label: 'Delivery issue unresolved', task: 'Escalate delivery issue', purpose: 'service_issue_resolution', days: 0 },
  { id: 'category', apiId: 'category_interested', label: 'Interested in product line', task: 'Prepare product proposal', purpose: 'category_proposal', days: 2 },
  { id: 'demand', apiId: 'demand_reduced', label: 'Demand has fallen', task: 'Review changed requirements', purpose: 'demand_review', days: 30 },
  { id: 'no_response', apiId: 'no_response', label: 'No response', task: 'Make one follow-up attempt', purpose: 'retention_contact_reminder', days: 3 },
  { id: 'order', apiId: 'order_received', label: 'Order received', task: 'Monitor next order cycle', purpose: 'retention_monitoring', days: 30 },
]

export function addDays(value: string, days: number): string {
  const result = new Date(`${value}T12:00:00Z`)
  result.setUTCDate(result.getUTCDate() + days)
  return result.toISOString().slice(0, 10)
}

function fnv1a(text: string): string {
  let hash = 0x811c9dc5
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193)
  }
  return (hash >>> 0).toString(16).padStart(8, '0')
}

export function createEventId(state: DemoState, accountId: string): string {
  const sequence = state.activities.filter(activity => activity.accountId === accountId).length + 1
  return `event_${accountId}_${SIMULATION_DATE}_${sequence}`
}

export function buildLocalOutcome(request: RecordOutcomeRequest): RecordOutcomeResponse {
  const option = OUTCOMES.find(item => item.apiId === request.outcome)
  if (!option) throw new Error('Unsupported outcome')
  const typeByOutcome: Record<OutcomeType, string> = {
    callback_requested: 'callback', delivery_unresolved: 'service_escalation',
    category_interested: 'category_proposal', demand_reduced: 'account_review',
    no_response: 'follow_up_attempt', order_received: 'recovery_monitoring',
  }
  const statusByOutcome: Record<OutcomeType, string> = {
    callback_requested: 'callback_scheduled', delivery_unresolved: 'service_escalation_required',
    category_interested: 'proposal_preparation_required', demand_reduced: 'account_review_scheduled',
    no_response: 'follow_up_scheduled', order_received: 'monitoring_scheduled',
  }
  const taskType = typeByOutcome[request.outcome]
  const dueAt = request.outcome === 'callback_requested'
    ? request.callbackAt!
    : request.outcome === 'order_received'
      ? ('date' in request.monitoring! ? request.monitoring.date : addDays(request.contactDate, request.monitoring!.intervalDays))
      : addDays(request.contactDate, option.days)
  const instructionByOutcome: Record<OutcomeType, string> = {
    callback_requested: 'Contact the account at the requested callback time.',
    delivery_unresolved: 'Escalate the unresolved delivery issue to the service team for investigation.',
    category_interested: 'Prepare a category proposal for representative review; do not send automatically.',
    demand_reduced: 'Review the account later using updated evidence; reduced demand is not necessarily churn.',
    no_response: 'Make one follow-up contact attempt on the configured date.',
    order_received: 'Monitor the account on the requested date. This order is not proof of sustained recovery.',
  }
  return {
    eventId: request.eventId, accountId: request.accountId, outcome: request.outcome,
    actionStatus: statusByOutcome[request.outcome], calendarConvention: 'calendar_days_utc',
    taskInstructions: {
      upsert: [{
        taskId: `task_${taskType}_${fnv1a(`${request.eventId}|${taskType}`)}`,
        accountId: request.accountId, type: taskType, purpose: option.purpose, dueAt,
        status: 'open', sourceEventId: request.eventId,
        notes: request.representativeNotes || null, instruction: instructionByOutcome[request.outcome],
      }],
      cancel: request.outcome === 'order_received' ? [{
        accountId: request.accountId, purpose: 'retention_contact_reminder', scope: 'open_tasks_only',
        excludePurposes: ['service_issue_resolution'], reason: 'order_received',
      }] : [],
    },
  }
}

function taskTitle(instruction: TaskUpsertInstruction): string {
  return OUTCOMES.find(option => option.purpose === instruction.purpose)?.task || instruction.instruction
}

export function applyOutcomeResponse(state: DemoState, accountId: string, outcome: Outcome,
                                     notes: string, response: RecordOutcomeResponse,
                                     source: 'n8n' | 'local_fallback', fallbackReason?: string): DemoState {
  const workflow = state.workflows[accountId]
  if (!workflow || workflow.status !== 'contacted') return state
  let tasks = state.tasks.map(task => {
    const cancel = response.taskInstructions.cancel.some(instruction =>
      instruction.scope === 'open_tasks_only' && task.status === 'open' &&
      task.accountId === instruction.accountId && task.purpose === instruction.purpose &&
      !instruction.excludePurposes.includes(task.purpose))
    return cancel ? { ...task, status: 'cancelled' as const } : task
  })
  for (const instruction of response.taskInstructions.upsert) {
    const exactIndex = tasks.findIndex(task => task.id === instruction.taskId)
    const task: Task = {
      id: instruction.taskId, accountId: instruction.accountId, purpose: instruction.purpose,
      title: taskTitle(instruction), dueDate: instruction.dueAt.slice(0, 10),
      status: instruction.status, createdAt: SIMULATION_DATE,
    }
    if (exactIndex >= 0) tasks = tasks.map((current, index) => index === exactIndex ? task : current)
    else if (!tasks.some(current => current.accountId === task.accountId && current.purpose === task.purpose && current.status === 'open')) tasks = [task, ...tasks]
  }
  const option = OUTCOMES.find(item => item.id === outcome)!
  const activityId = `activity_${response.eventId}`
  const existingActivity = state.activities.some(activity => activity.id === activityId)
  const activity: Activity = {
    id: activityId, accountId,
    text: `Simulated contact: ${option.label.toLowerCase()}. Task instructions applied from ${source === 'n8n' ? 'n8n' : 'local fallback'}.`,
    date: SIMULATION_DATE,
  }
  return {
    workflows: { ...state.workflows, [accountId]: {
      ...workflow, status: 'recorded', outcome, notes,
      integrationSource: source, fallbackReason,
    } },
    tasks,
    activities: existingActivity ? state.activities : [activity, ...state.activities],
  }
}

export function recordOutcome(state: DemoState, accountId: string, outcome: Outcome,
                              notes: string, dueDate?: string): DemoState {
  const workflow = state.workflows[accountId]
  if (!workflow || workflow.status !== 'contacted') return state
  const option = OUTCOMES.find(item => item.id === outcome)
  if (!option) return state
  const eventId = workflow.eventId || createEventId(state, accountId)
  const request: RecordOutcomeRequest = {
    eventId, accountId, approved: true, mode: 'simulation', contactDate: SIMULATION_DATE,
    outcome: option.apiId, representativeNotes: notes,
    ...(outcome === 'callback' ? { callbackAt: dueDate } : {}),
    ...(outcome === 'order' ? { monitoring: dueDate ? { date: dueDate } : { intervalDays: option.days } } : {}),
  }
  if (outcome === 'callback' && !dueDate) return state
  return applyOutcomeResponse(state, accountId, outcome, notes, buildLocalOutcome(request), 'local_fallback', 'Local workflow used directly.')
}
