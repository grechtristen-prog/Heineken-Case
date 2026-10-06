import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { after, before, test } from 'node:test'
import { createN8nApiHandler } from './n8n-proxy.mjs'

let upstream
let proxy
let upstreamUrl
let proxyUrl

function closeServer(server) {
  return new Promise((resolve, reject) => {
    server.close(error => error ? reject(error) : resolve())
    server.closeAllConnections()
  })
}

before(async () => {
  upstream = createServer(async (req, res) => {
    const chunks = []
    for await (const chunk of req) chunks.push(chunk)
    assert.equal(req.headers['x-webhook-secret'], 'test-secret')
    const body = JSON.parse(Buffer.concat(chunks))
    res.writeHead(200, { 'content-type': 'application/json' })
    res.end(JSON.stringify({ accountId: body.accountId, actionType: body.actionType, briefing: 'ok', objective: 'ok', script: 'ok', requiresApproval: true, generationMode: 'template' }))
  })
  await new Promise(resolve => upstream.listen(0, '127.0.0.1', resolve))
  upstreamUrl = `http://127.0.0.1:${upstream.address().port}`
  const handler = createN8nApiHandler({ N8N_ACTION_WEBHOOK_URL: upstreamUrl, N8N_OUTCOME_WEBHOOK_URL: upstreamUrl, N8N_WEBHOOK_SECRET: 'test-secret' })
  proxy = createServer((req, res) => handler(req, res))
  await new Promise(resolve => proxy.listen(0, '127.0.0.1', resolve))
  proxyUrl = `http://127.0.0.1:${proxy.address().port}`
})

after(async () => {
  await closeServer(proxy)
  await closeServer(upstream)
})

test('forwards validated JSON and keeps the secret server-side', async () => {
  const response = await fetch(`${proxyUrl}/api/prepare-action`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ accountId: 'A1', analysisDate: '2018-08-31', actionType: 'ordering_check', evidence: {} }),
  })
  assert.equal(response.status, 200)
  assert.equal((await response.json()).accountId, 'A1')
})

test('rejects invalid requests before forwarding', async () => {
  const response = await fetch(`${proxyUrl}/api/record-outcome`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}',
  })
  assert.equal(response.status, 400)
  assert.equal((await response.json()).error.code, 'INVALID_REQUEST')
})

test('reports unconfigured n8n without leaking configuration', async () => {
  const handler = createN8nApiHandler({})
  const server = createServer((req, res) => handler(req, res))
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  const response = await fetch(`http://127.0.0.1:${server.address().port}/api/prepare-action`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ accountId: 'A1', analysisDate: '2018-08-31', actionType: 'ordering_check', evidence: {} }),
  })
  assert.equal(response.status, 503)
  assert.equal((await response.json()).error.code, 'N8N_UNCONFIGURED')
  await closeServer(server)
})
