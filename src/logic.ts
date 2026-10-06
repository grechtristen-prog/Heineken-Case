import type { Account, Activity, DemoState, Outcome, Task, Workflow } from './types'

export const SIMULATION_DATE = '2018-09-03'
export const INITIAL_STATE: DemoState = { workflows: {}, tasks: [], activities: [] }
const STORAGE_KEY = 'heineken-retention-copilot-v1'

export const currency = (value: number) => new Intl.NumberFormat('en-US', {
  style: 'currency', currency: 'BRL', maximumFractionDigits: 0,
}).format(value)

export const displayDate = (value: string | null) => value
  ? new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${value}T12:00:00Z`))
  : 'No order'

export const shortDate = (value: string) => new Intl.DateTimeFormat('en-GB', {
  day: 'numeric', month: 'short', timeZone: 'UTC',
}).format(new Date(`${value}T12:00:00Z`))

export function loadState(): DemoState {
  try {
    const value = localStorage.getItem(STORAGE_KEY)
    if (!value) return INITIAL_STATE
    const parsed = JSON.parse(value) as DemoState
    if (parsed && typeof parsed.workflows === 'object' && Array.isArray(parsed.tasks) && Array.isArray(parsed.activities)) return parsed
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
      status: 'draft', actionType: 'service', objective: 'Resolve the service concern before discussing a new order.',
      script: `Hello, I am following up on ${fact} recorded for your account. Has the issue been resolved? What would help make your next delivery work better for you?`,
    }
  }
  if (has('category') && account.droppedCategories.length) {
    const category = account.droppedCategories[0].category
    return {
      status: 'draft', actionType: 'category', objective: `Understand why ${category} is no longer in the order mix.`,
      script: `Hello, I noticed ${category} has not appeared in your recent orders. Has demand changed, or is there another reason? We can review a suitable option for your next order.`,
    }
  }
  if (has('rhythm')) {
    return {
      status: 'draft', actionType: 'rhythm', objective: 'Check current needs and whether ordering has become difficult.',
      script: `Hello, I am checking in on your next order. Your usual order rhythm has changed recently. Have your requirements changed, or has anything made ordering more difficult?`,
    }
  }
  if (has('spend')) {
    return {
      status: 'draft', actionType: 'spend', objective: 'Understand the lower order volume before suggesting a response.',
      script: `Hello, I wanted to check how your current stock and demand are looking. Is there anything you need us to adjust for your next order?`,
    }
  }
  return {
    status: 'draft', actionType: 'monitor', objective: 'Review account needs without assuming a decline.',
    script: `Hello, I am checking in to see how things are going and whether we can help with your next order.`,
  }
}

export const OUTCOMES: { id: Outcome; label: string; task: string; purpose: string; days: number }[] = [
  { id: 'callback', label: 'Callback requested', task: 'Call customer back', purpose: 'callback', days: 3 },
  { id: 'service', label: 'Delivery issue unresolved', task: 'Escalate delivery issue', purpose: 'service', days: 1 },
  { id: 'category', label: 'Interested in product line', task: 'Prepare product proposal', purpose: 'proposal', days: 1 },
  { id: 'demand', label: 'Demand has fallen', task: 'Review changed requirements', purpose: 'review', days: 7 },
  { id: 'no_response', label: 'No response', task: 'Make one follow-up attempt', purpose: 'follow-up', days: 3 },
  { id: 'order', label: 'Order received', task: 'Monitor next order cycle', purpose: 'monitor', days: 30 },
]

export function addDays(value: string, days: number): string {
  const result = new Date(`${value}T12:00:00Z`)
  result.setUTCDate(result.getUTCDate() + days)
  return result.toISOString().slice(0, 10)
}

export function recordOutcome(state: DemoState, accountId: string, outcome: Outcome,
                              notes: string, dueDate?: string): DemoState {
  const workflow = state.workflows[accountId]
  if (!workflow || workflow.status !== 'contacted') return state
  const option = OUTCOMES.find(item => item.id === outcome)
  if (!option) return state
  let tasks = state.tasks
  if (outcome === 'order') {
    tasks = tasks.map(task => task.accountId === accountId && task.status === 'open'
      ? { ...task, status: 'cancelled' as const } : task)
  }
  const existing = tasks.some(task => task.accountId === accountId && task.purpose === option.purpose && task.status === 'open')
  if (!existing) {
    const task: Task = {
      id: `${accountId}-${option.purpose}-${state.activities.length + 1}`, accountId,
      purpose: option.purpose, title: option.task,
      dueDate: dueDate || addDays(SIMULATION_DATE, option.days),
      status: 'open', createdAt: SIMULATION_DATE,
    }
    tasks = [task, ...tasks]
  }
  const activity: Activity = {
    id: `${accountId}-${state.activities.length + 1}`, accountId,
    text: `Simulated contact: ${option.label.toLowerCase()}. ${existing ? 'Existing task retained.' : option.task + ' created.'}`,
    date: SIMULATION_DATE,
  }
  return {
    workflows: { ...state.workflows, [accountId]: { ...workflow, status: 'recorded', outcome, notes } },
    tasks, activities: [activity, ...state.activities],
  }
}
