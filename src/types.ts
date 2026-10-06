export type ReasonType = 'rhythm' | 'spend' | 'category' | 'service'
export type Confidence = 'high' | 'medium' | 'low'
export type Outcome = 'callback' | 'service' | 'category' | 'demand' | 'no_response' | 'order'
export type WorkflowStatus = 'draft' | 'approved' | 'contacted' | 'recorded'
export type TaskStatus = 'open' | 'completed' | 'cancelled'

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
  objective: string
  script: string
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
