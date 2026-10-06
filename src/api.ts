import { buildLocalOutcome, OUTCOMES, prepareAction } from './logic'
import type {
  Account, IntegrationResult, Outcome, PrepareActionRequest, PrepareActionResponse,
  PrepareActionType, RecordOutcomeRequest, RecordOutcomeResponse,
} from './types'

class IntegrationError extends Error {
  constructor(message: string, readonly status?: number) { super(message) }
}

const reasonLabels = {
  rhythm: 'Ordering interval exceeded', spend: 'Recent spend declined',
  category: 'Previously ordered category is absent', service: 'Service experience requires review',
}

export function buildPrepareRequest(account: Account, analysisDate: string): PrepareActionRequest {
  const review = account.serviceIssues.find(issue => issue.type === 'review')
  const has = (type: string) => account.riskReasons.some(reason => reason.type === type)
  const actionType: PrepareActionType = has('service')
    ? 'service_recovery'
    : has('category') && account.droppedCategories.length
      ? 'category_reintroduction'
      : 'ordering_check'
  return {
    accountId: account.accountId,
    analysisDate,
    actionType,
    evidence: {
      daysSinceLastOrder: account.daysSinceOrder,
      typicalOrderingIntervalDays: account.typicalIntervalDays,
      spendingDeclinePercent: Number.isFinite(account.spendDeclinePct) ? account.spendDeclinePct : null,
      droppedCategories: account.droppedCategories.length ? account.droppedCategories.map(item => item.category) : null,
      recentReviewScore: review?.score ?? null,
      deliveryLatenessDays: null,
      riskReasons: account.riskReasons.length
        ? account.riskReasons.map(reason => `${reasonLabels[reason.type]} (${reason.points} risk-score points)`)
        : null,
      riskScore: Number.isFinite(account.riskScore) ? account.riskScore : null,
      evidenceConfidence: account.confidence,
      unresolvedServiceIssue: null,
    },
  }
}

function localPrepare(account: Account, request: PrepareActionRequest): PrepareActionResponse {
  const workflow = prepareAction(account)
  return {
    accountId: request.accountId,
    actionType: request.actionType,
    briefing: workflow.briefing,
    objective: workflow.objective,
    script: workflow.script,
    requiresApproval: true,
    generationMode: 'template',
  }
}

async function postJson<T>(path: string, body: unknown): Promise<T> {
  let response: Response
  try {
    response = await fetch(path, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body), signal: AbortSignal.timeout(12_000),
    })
  } catch {
    throw new IntegrationError('The n8n proxy is unavailable.')
  }
  const payload = await response.json().catch(() => null)
  if (!response.ok) {
    const message = payload?.error?.message || `The n8n proxy returned HTTP ${response.status}.`
    throw new IntegrationError(message, response.status)
  }
  return payload as T
}

function validPrepareResponse(value: PrepareActionResponse, accountId: string): boolean {
  return Boolean(value && value.accountId === accountId && typeof value.briefing === 'string' &&
    typeof value.objective === 'string' && typeof value.script === 'string' &&
    value.requiresApproval === true && ['template', 'ai'].includes(value.generationMode) &&
    ['ordering_check', 'category_reintroduction', 'service_recovery'].includes(value.actionType))
}

function validOutcomeResponse(value: RecordOutcomeResponse, request: RecordOutcomeRequest): boolean {
  return Boolean(value && value.eventId === request.eventId && value.accountId === request.accountId &&
    value.outcome === request.outcome && value.calendarConvention === 'calendar_days_utc' &&
    typeof value.actionStatus === 'string' &&
    Array.isArray(value.taskInstructions?.upsert) && value.taskInstructions.upsert.every(instruction =>
      instruction && typeof instruction.taskId === 'string' && instruction.accountId === request.accountId &&
      typeof instruction.type === 'string' && typeof instruction.purpose === 'string' &&
      typeof instruction.dueAt === 'string' && instruction.status === 'open' &&
      instruction.sourceEventId === request.eventId && typeof instruction.instruction === 'string') &&
    Array.isArray(value.taskInstructions?.cancel) && value.taskInstructions.cancel.every(instruction =>
      instruction && instruction.accountId === request.accountId && typeof instruction.purpose === 'string' &&
      instruction.scope === 'open_tasks_only' && Array.isArray(instruction.excludePurposes) &&
      instruction.excludePurposes.every(purpose => typeof purpose === 'string')))
}

function shouldUseFallback(error: unknown): boolean {
  return import.meta.env.VITE_REQUIRE_N8N !== 'true' &&
    !(error instanceof IntegrationError && (error.status === 400 || error.status === 403))
}

export async function prepareAccountAction(account: Account, analysisDate: string): Promise<IntegrationResult<PrepareActionResponse>> {
  const request = buildPrepareRequest(account, analysisDate)
  try {
    const data = await postJson<PrepareActionResponse>('/api/prepare-action', request)
    if (!validPrepareResponse(data, request.accountId)) throw new IntegrationError('n8n returned an invalid Prepare Action response.')
    return { data, source: 'n8n' }
  } catch (error) {
    if (!shouldUseFallback(error)) throw error
    const fallbackReason = error instanceof Error ? error.message : 'n8n is unavailable.'
    return { data: localPrepare(account, request), source: 'local_fallback', fallbackReason }
  }
}

export function buildOutcomeRequest(accountId: string, eventId: string, outcome: Outcome,
                                    notes: string, dueDate?: string): RecordOutcomeRequest {
  const option = OUTCOMES.find(item => item.id === outcome)
  if (!option) throw new IntegrationError('Unsupported outcome.')
  return {
    eventId, accountId, approved: true, mode: 'simulation', contactDate: '2018-09-03',
    outcome: option.apiId, representativeNotes: notes || undefined,
    ...(outcome === 'callback' ? { callbackAt: dueDate } : {}),
    ...(outcome === 'order' ? { monitoring: dueDate ? { date: dueDate } : { intervalDays: option.days } } : {}),
  }
}

export async function submitOutcome(request: RecordOutcomeRequest): Promise<IntegrationResult<RecordOutcomeResponse>> {
  try {
    const data = await postJson<RecordOutcomeResponse>('/api/record-outcome', request)
    if (!validOutcomeResponse(data, request)) throw new IntegrationError('n8n returned an invalid Record Outcome response.')
    return { data, source: 'n8n' }
  } catch (error) {
    if (!shouldUseFallback(error)) throw error
    const fallbackReason = error instanceof Error ? error.message : 'n8n is unavailable.'
    return { data: buildLocalOutcome(request), source: 'local_fallback', fallbackReason }
  }
}
