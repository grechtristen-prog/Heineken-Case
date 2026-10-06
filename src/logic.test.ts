import { describe, expect, it } from 'vitest'
import { prepareAction, recordOutcome } from './logic'
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
    expect(recorded.tasks[0]).toMatchObject({ purpose: 'service', dueDate: '2018-09-04', status: 'open' })
    const again = recordOutcome({ ...recorded, workflows: contacted.workflows }, 'A01003', 'service', '')
    expect(again.tasks).toHaveLength(1)
  })

  it('closes outstanding reminders after a simulated order', () => {
    const withReminder = recordOutcome(state('contacted'), 'A01003', 'no_response', '')
    const next = recordOutcome({ ...withReminder, workflows: state('contacted').workflows }, 'A01003', 'order', '')
    expect(next.tasks.find(task => task.purpose === 'follow-up')?.status).toBe('cancelled')
    expect(next.tasks.find(task => task.purpose === 'monitor')?.status).toBe('open')
  })
})
