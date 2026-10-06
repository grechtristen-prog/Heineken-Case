import { Readable } from 'node:stream'
import { createN8nApiHandler } from './n8n-proxy.mjs'

export function createVercelN8nHandler(path, config = process.env) {
  const proxy = createN8nApiHandler(config)
  return async function vercelN8nHandler(request, response) {
    let body
    try {
      const parsed = request.body
      body = Buffer.isBuffer(parsed) ? parsed
        : typeof parsed === 'string' ? Buffer.from(parsed)
          : parsed === undefined ? Buffer.alloc(0) : Buffer.from(JSON.stringify(parsed))
    } catch {
      body = Buffer.from('{')
    }
    const stream = Readable.from([body])
    stream.url = path
    stream.method = request.method
    stream.headers = request.headers
    await proxy(stream, response)
  }
}
