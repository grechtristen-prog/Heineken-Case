import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { after, before, test } from 'node:test'
import { createVercelN8nHandler } from './vercel-handler.mjs'

let upstream
let adapter
let upstreamCalls = 0
let adapterUrl

before(async () => {
  upstream = createServer(async (request, response) => {
    upstreamCalls++
    assert.equal(request.headers['x-webhook-secret'], 'test-secret')
    const chunks = []
    for await (const chunk of request) chunks.push(chunk)
    const body = JSON.parse(Buffer.concat(chunks).toString('utf8'))
    response.writeHead(200, { 'content-type': 'application/json' })
    response.end(JSON.stringify(request.url === '/outcome'
      ? { eventId: body.eventId, accountId: body.accountId, outcome: body.outcome,
          calendarConvention: 'calendar_days_utc', actionStatus: 'recorded',
          taskInstructions: { upsert: [], cancel: [] } }
      : { accountId: body.accountId, actionType: body.actionType,
          briefing: 'Live n8n response', objective: 'Check needs', script: 'Hello',
          requiresApproval: true, generationMode: 'template' }))
  })
  await new Promise(resolve => upstream.listen(0, '127.0.0.1', resolve))
  const config = {
    N8N_ACTION_WEBHOOK_URL: `http://127.0.0.1:${upstream.address().port}/prepare`,
    N8N_OUTCOME_WEBHOOK_URL: `http://127.0.0.1:${upstream.address().port}/outcome`,
    N8N_WEBHOOK_SECRET: 'test-secret',
  }
  const actionHandler = createVercelN8nHandler('/api/prepare-action', config)
  const outcomeHandler = createVercelN8nHandler('/api/record-outcome', config)
  adapter = createServer(async (request, response) => {
    const chunks = []
    for await (const chunk of request) chunks.push(chunk)
    let body
    try { body = JSON.parse(Buffer.concat(chunks).toString('utf8')) }
    catch { body = Buffer.concat(chunks).toString('utf8') }
    const handler = request.url === '/api/record-outcome' ? outcomeHandler : actionHandler
    await handler({ body, method: request.method, headers: request.headers }, response)
  })
  await new Promise(resolve => adapter.listen(0, '127.0.0.1', resolve))
  adapterUrl = `http://127.0.0.1:${adapter.address().port}`
})

after(async () => {
  await Promise.all([new Promise(resolve => adapter.close(resolve)), new Promise(resolve => upstream.close(resolve))])
})

test('Vercel adapter forwards valid requests to n8n with the secret', async () => {
  const response = await fetch(`${adapterUrl}/api/prepare-action`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ accountId: 'A1', analysisDate: '2018-08-31', actionType: 'ordering_check', evidence: {} }),
  })
  assert.equal(response.status, 200)
  assert.equal((await response.json()).briefing, 'Live n8n response')
  assert.equal(upstreamCalls, 1)
})

test('Vercel adapter rejects invalid payloads before forwarding', async () => {
  const response = await fetch(`${adapterUrl}/api/prepare-action`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}',
  })
  assert.equal(response.status, 400)
  assert.equal((await response.json()).error.code, 'INVALID_REQUEST')
  assert.equal(upstreamCalls, 1)
})

test('Vercel adapter forwards approved simulated outcomes to the outcome webhook', async () => {
  const response = await fetch(`${adapterUrl}/api/record-outcome`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ eventId: 'demo-event', accountId: 'A1', approved: true,
      mode: 'simulation', contactDate: '2018-09-03', outcome: 'delivery_unresolved' }),
  })
  assert.equal(response.status, 200)
  assert.equal((await response.json()).eventId, 'demo-event')
  assert.equal(upstreamCalls, 2)
})
