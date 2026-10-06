const ROUTES = {
  '/api/prepare-action': 'N8N_ACTION_WEBHOOK_URL',
  '/api/record-outcome': 'N8N_OUTCOME_WEBHOOK_URL',
}

const ACTIONS = new Set(['ordering_check', 'category_reintroduction', 'service_recovery'])
const OUTCOMES = new Set(['callback_requested', 'delivery_unresolved', 'category_interested', 'demand_reduced', 'no_response', 'order_received'])
const jsonHeaders = { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }

function send(res, status, body) {
  res.writeHead(status, jsonHeaders)
  res.end(JSON.stringify(body))
}

function error(status, code, message, details = []) {
  return { status, body: { error: { code, message, details } } }
}

function validate(path, body) {
  const details = []
  const isDate = value => {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
    const parsed = new Date(`${value}T00:00:00Z`)
    return !Number.isNaN(parsed.valueOf()) && parsed.toISOString().slice(0, 10) === value
  }
  const requiredString = key => {
    if (typeof body?.[key] !== 'string' || !body[key].trim()) details.push({ field: key, message: `${key} is required` })
  }
  if (path === '/api/prepare-action') {
    requiredString('accountId')
    if (!isDate(body?.analysisDate)) details.push({ field: 'analysisDate', message: 'analysisDate must use YYYY-MM-DD' })
    if (!ACTIONS.has(body?.actionType)) details.push({ field: 'actionType', message: 'Unsupported actionType' })
    if (!body?.evidence || typeof body.evidence !== 'object' || Array.isArray(body.evidence)) details.push({ field: 'evidence', message: 'evidence must be an object' })
  } else {
    requiredString('eventId')
    requiredString('accountId')
    if (!isDate(body?.contactDate)) details.push({ field: 'contactDate', message: 'contactDate must use YYYY-MM-DD' })
    if (body?.approved !== true) details.push({ field: 'approved', message: 'approved must be exactly true' })
    if (body?.mode !== 'simulation') details.push({ field: 'mode', message: 'mode must be simulation' })
    if (!OUTCOMES.has(body?.outcome)) details.push({ field: 'outcome', message: 'Unsupported outcome' })
    if (body?.outcome === 'callback_requested' && (typeof body.callbackAt !== 'string' || Number.isNaN(Date.parse(body.callbackAt)))) details.push({ field: 'callbackAt', message: 'callbackAt must be an ISO date or datetime' })
    if (body?.outcome === 'order_received') {
      const monitoring = body.monitoring
      const validDate = monitoring && Object.keys(monitoring).length === 1 && isDate(monitoring.date)
      const validInterval = monitoring && Object.keys(monitoring).length === 1 && Number.isInteger(monitoring.intervalDays) && monitoring.intervalDays > 0
      if (!validDate && !validInterval) details.push({ field: 'monitoring', message: 'monitoring requires exactly one valid date or positive intervalDays' })
    }
  }
  return details
}

async function readJson(req) {
  const chunks = []
  let size = 0
  for await (const chunk of req) {
    size += chunk.length
    if (size > 256 * 1024) throw Object.assign(new Error('Request body exceeds 256 KiB.'), { status: 413 })
    chunks.push(chunk)
  }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')) }
  catch { throw Object.assign(new Error('Request body must be valid JSON.'), { status: 400 }) }
}

export function createN8nApiHandler(config = process.env) {
  return async function n8nApiHandler(req, res, next = () => {}) {
    const path = new URL(req.url || '/', 'http://localhost').pathname
    const envName = ROUTES[path]
    if (!envName) return next()
    if (req.method !== 'POST') {
      res.setHeader('allow', 'POST')
      return send(res, 405, error(405, 'METHOD_NOT_ALLOWED', 'Use POST for this endpoint.').body)
    }
    if (!String(req.headers['content-type'] || '').toLowerCase().includes('application/json')) {
      return send(res, 415, error(415, 'UNSUPPORTED_MEDIA_TYPE', 'Use application/json.').body)
    }
    let body
    try { body = await readJson(req) }
    catch (caught) {
      const status = caught.status || 400
      return send(res, status, error(status, 'INVALID_REQUEST', caught.message).body)
    }
    const details = validate(path, body)
    if (details.length) return send(res, 400, error(400, 'INVALID_REQUEST', 'Request failed proxy validation.', details).body)
    const webhookUrl = config[envName]
    const secret = config.N8N_WEBHOOK_SECRET
    if (!webhookUrl || !secret) return send(res, 503, error(503, 'N8N_UNCONFIGURED', 'The n8n integration is not configured.').body)
    let upstream
    try {
      upstream = await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-webhook-secret': secret },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(10_000),
      })
    } catch (caught) {
      const timedOut = caught?.name === 'TimeoutError'
      const status = timedOut ? 504 : 502
      return send(res, status, error(status, timedOut ? 'N8N_TIMEOUT' : 'N8N_UNAVAILABLE', timedOut ? 'The n8n request timed out.' : 'The n8n webhook is unavailable.').body)
    }
    const text = await upstream.text()
    let payload
    try { payload = JSON.parse(text) }
    catch { return send(res, 502, error(502, 'INVALID_N8N_RESPONSE', 'n8n returned a non-JSON response.').body) }
    return send(res, upstream.status, payload)
  }
}
