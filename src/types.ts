export type ReasonType = 'rhythm' | 'spend' | 'category' | 'service'
export type Confidence = 'high' | 'medium' | 'low'
export type Outcome = 'callback' | 'service' | 'category' | 'demand' | 'no_response' | 'order'
export type WorkflowStatus = 'draft' | 'approved' | 'contacted' | 'recorded'
export type TaskStatus = 'open' | 'completed' | 'cancelled'
export type IntegrationSource = 'n8n' | 'local_fallback'
export type GenerationMode = 'template' | 'ai'

export interface RiskReason { type: ReasonType; points: number }
export interface ServiceIssue { type: 'late' | 'review'; date: string; score?: number }
export interface Account {
  accountId: string
  city: string
  state: string
  orderCount: number
  activeMonths: number
  established: boolean
  lastOrderDate: string | null
  daysSinceOrder: number | null
  typicalIntervalDays: number | null
  recentSpend: number
  baselineSpend: number
  spendDeclinePct: number
  historicalSpend: number
  droppedCategories: { category: string; lastDate: string; previousOrders: number }[]
  serviceIssues: ServiceIssue[]
  riskScore: number
  riskReasons: RiskReason[]
  confidence: Confidence
  churnStatus: 'operational churn' | 'early risk' | 'active' | 'insufficient history'
  valueTier: 'high' | 'medium' | 'low'
  priorityScore: number
  monthlySpend: { month: string; spend: number }[]
  recentOrders: { date: string; revenue: number; categories: string[]; status: string }[]
}

export interface DemoData {
  analysisDate: string
  sourceOrders: number
  sourceAccounts: number
  eligibleAccounts: number
  rankedAccounts: number
  historicalCheck: {
    cutoff: string
    horizonEnd: string
    eligibleAccounts: number
    topQuintileAccounts: number
    topQuintileNoOrderPct: number
    cohortNoOrderPct: number
    outcome: string
  }
  accounts: Account[]
}

export interface Workflow {
  status: WorkflowStatus
  actionType: 'service' | 'category' | 'rhythm' | 'spend' | 'monitor'
  briefing: string
  objective: string
  script: string
  requiresApproval: true
  generationMode: GenerationMode
  integrationSource: IntegrationSource
  fallbackReason?: string
  eventId?: string
  outcome?: Outcome
  notes?: string
}

export interface Task {
  id: string
  accountId: string
  purpose: string
  title: string
  dueDate: string
  status: TaskStatus
  createdAt: string
}

export interface Activity {
  id: string
  accountId: string
  text: string
  date: string
}

export interface DemoState {
  workflows: Record<string, Workflow>
  tasks: Task[]
  activities: Activity[]
}

export type PrepareActionType = 'ordering_check' | 'category_reintroduction' | 'service_recovery'
export type OutcomeType = 'callback_requested' | 'delivery_unresolved' | 'category_interested' | 'demand_reduced' | 'no_response' | 'order_received'

export interface AccountEvidence {
  daysSinceLastOrder: number | null
  typicalOrderingIntervalDays: number | null
  spendingDeclinePercent: number | null
  droppedCategories: string[] | null
  recentReviewScore: number | null
  deliveryLatenessDays: number | null
  riskReasons: string[] | null
  riskScore: number | null
  evidenceConfidence: Confidence | 'unavailable'
  unresolvedServiceIssue: boolean | null
}

export interface PrepareActionRequest {
  accountId: string
  analysisDate: string
  actionType: PrepareActionType
  evidence: AccountEvidence
}

export interface PrepareActionResponse {
  accountId: string
  actionType: PrepareActionType
  briefing: string
  objective: string
  script: string
  requiresApproval: true
  generationMode: GenerationMode
}

export interface RecordOutcomeRequest {
  eventId: string
  accountId: string
  approved: true
  mode: 'simulation'
  contactDate: string
  outcome: OutcomeType
  callbackAt?: string
  representativeNotes?: string
  monitoring?: { date: string } | { intervalDays: number }
}

export interface TaskUpsertInstruction {
  taskId: string
  accountId: string
  type: string
  purpose: string
  dueAt: string
  status: 'open'
  sourceEventId: string
  notes: string | null
  instruction: string
}

export interface TaskCancellationInstruction {
  accountId: string
  purpose: string
  scope: 'open_tasks_only'
  excludePurposes: string[]
  reason: string
}

export interface RecordOutcomeResponse {
  eventId: string
  accountId: string
  outcome: OutcomeType
  actionStatus: string
  calendarConvention: 'calendar_days_utc'
  taskInstructions: {
    upsert: TaskUpsertInstruction[]
    cancel: TaskCancellationInstruction[]
  }
}

export interface IntegrationResult<T> {
  data: T
  source: IntegrationSource
  fallbackReason?: string
}
