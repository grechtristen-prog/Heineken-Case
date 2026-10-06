import { describe, expect, it } from 'vitest'
import { buildLocalOutcome, prepareAction, recordOutcome } from './logic'
import type { RecordOutcomeRequest } from './types'
import type { Account, DemoState, Workflow } from './types'

const account: Pick<Account, 'riskReasons' | 'droppedCategories' | 'serviceIssues'> = {
  riskReasons: [{ type: 'category', points: 20 }],
  droppedCategories: [{ category: 'Portfolio line 04', lastDate: '2018-05-01', previousOrders: 4 }],
  serviceIssues: [],
}

function state(status: Workflow['status']): DemoState {
  return { workflows: { A01003: { ...prepareAction(account), status } }, tasks: [], activities: [] }
}

describe('action workflow', () => {
  it('selects an evidence-specific conversation', () => {
    const action = prepareAction(account)
    expect(action.actionType).toBe('category')
    expect(action.script).toContain('Portfolio line 04')
  })

  it('requires a simulated contact before recording an outcome', () => {
    const approved = state('approved')
    expect(recordOutcome(approved, 'A01003', 'service', '')).toBe(approved)
    expect(approved.tasks).toHaveLength(0)
  })

  it('creates the right task and prevents a duplicate open task', () => {
    const contacted = state('contacted')
    const recorded = recordOutcome(contacted, 'A01003', 'service', 'Delivery still late')
    expect(recorded.tasks).toHaveLength(1)
    expect(recorded.tasks[0]).toMatchObject({ purpose: 'service_issue_resolution', dueDate: '2018-09-03', status: 'open' })
    const again = recordOutcome({ ...recorded, workflows: contacted.workflows }, 'A01003', 'service', '')
    expect(again.tasks).toHaveLength(1)
  })

  it('closes outstanding reminders after a simulated order', () => {
    const withReminder = recordOutcome(state('contacted'), 'A01003', 'no_response', '')
    const next = recordOutcome({ ...withReminder, workflows: state('contacted').workflows }, 'A01003', 'order', '')
    expect(next.tasks.find(task => task.purpose === 'retention_contact_reminder')?.status).toBe('cancelled')
    expect(next.tasks.find(task => task.purpose === 'retention_monitoring')?.status).toBe('open')
  })

  it('does not cancel an unrelated service task after an order', () => {
    const service = recordOutcome(state('contacted'), 'A01003', 'service', '')
    const reminder = recordOutcome({ ...service, workflows: state('contacted').workflows }, 'A01003', 'no_response', '')
    const next = recordOutcome({ ...reminder, workflows: state('contacted').workflows }, 'A01003', 'order', '')
    expect(next.tasks.find(task => task.purpose === 'service_issue_resolution')?.status).toBe('open')
    expect(next.tasks.find(task => task.purpose === 'retention_contact_reminder')?.status).toBe('cancelled')
  })

  it('creates deterministic task IDs from the event and task type', () => {
    const request: RecordOutcomeRequest = {
      eventId: 'EVT-100', accountId: 'A01003', approved: true, mode: 'simulation',
      contactDate: '2018-09-03', outcome: 'no_response',
    }
    expect(buildLocalOutcome(request).taskInstructions.upsert[0].taskId)
      .toBe(buildLocalOutcome(request).taskInstructions.upsert[0].taskId)
  })

  it.each([
    ['callback_requested', { callbackAt: '2018-09-05' }, 'callback'],
    ['delivery_unresolved', {}, 'service_escalation'],
    ['category_interested', {}, 'category_proposal'],
    ['demand_reduced', {}, 'account_review'],
    ['no_response', {}, 'follow_up_attempt'],
    ['order_received', { monitoring: { intervalDays: 30 } }, 'recovery_monitoring'],
  ] as const)('builds the %s task instruction', (outcome, extra, taskType) => {
    const response = buildLocalOutcome({
      eventId: `EVT-${outcome}`, accountId: 'A01003', approved: true, mode: 'simulation',
      contactDate: '2018-09-03', outcome, ...extra,
    })
    expect(response.taskInstructions.upsert[0].type).toBe(taskType)
  })
})
