import type { IncomingMessage, ServerResponse } from 'node:http'

export interface N8nProxyConfig {
  N8N_ACTION_WEBHOOK_URL?: string
  N8N_OUTCOME_WEBHOOK_URL?: string
  N8N_WEBHOOK_SECRET?: string
}

export function createN8nApiHandler(config?: N8nProxyConfig): (
  request: IncomingMessage,
  response: ServerResponse,
  next?: () => void,
) => Promise<void>
