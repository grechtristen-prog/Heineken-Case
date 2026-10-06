import { afterEach, describe, expect, it, vi } from 'vitest'
import rawData from './data/demo.json'
import { buildPrepareRequest, prepareAccountAction } from './api'
import type { Account, DemoData } from './types'

const data = rawData as DemoData

afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs() })

describe('n8n contract adapter', () => {
  it('maps real account evidence without converting missing values to zero', () => {
    const account: Account = { ...data.accounts[0], daysSinceOrder: null, typicalIntervalDays: null, serviceIssues: [] }
    const request = buildPrepareRequest(account, data.analysisDate)
    expect(request.accountId).toBe(account.accountId)
    expect(request.evidence.daysSinceLastOrder).toBeNull()
    expect(request.evidence.typicalOrderingIntervalDays).toBeNull()
    expect(request.evidence.riskScore).toBe(account.riskScore)
    expect(request.evidence.riskReasons?.[0]).toContain('risk-score points')
  })

  it('labels a valid proxy response as n8n', async () => {
    const account = data.accounts[0]
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      accountId: account.accountId, actionType: 'ordering_check', briefing: 'From n8n',
      objective: 'Check needs', script: 'Approved facts only', requiresApproval: true,
      generationMode: 'template',
    }), { status: 200, headers: { 'content-type': 'application/json' } })))
    const result = await prepareAccountAction(account, data.analysisDate)
    expect(result.source).toBe('n8n')
    expect(result.data.briefing).toBe('From n8n')
  })

  it('uses and labels local fallback when the proxy is unavailable', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('offline') }))
    const result = await prepareAccountAction(data.accounts[0], data.analysisDate)
    expect(result.source).toBe('local_fallback')
    expect(result.fallbackReason).toBeTruthy()
    expect(result.data.requiresApproval).toBe(true)
  })

  it('surfaces proxy failure when live n8n is required', async () => {
    vi.stubEnv('VITE_REQUIRE_N8N', 'true')
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('offline') }))
    await expect(prepareAccountAction(data.accounts[0], data.analysisDate)).rejects.toThrow('n8n proxy is unavailable')
  })
})
