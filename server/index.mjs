import { createReadStream, existsSync, readFileSync, statSync } from 'node:fs'
import { createServer } from 'node:http'
import { extname, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createN8nApiHandler } from './n8n-proxy.mjs'

const root = resolve(fileURLToPath(new URL('..', import.meta.url)))
const dist = resolve(root, 'dist')

function loadEnvironment() {
  const path = resolve(root, '.env')
  if (!existsSync(path)) return
  for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^([A-Z][A-Z0-9_]*)=(.*)$/)
    if (!match || process.env[match[1]] !== undefined) continue
    process.env[match[1]] = match[2].trim().replace(/^(['"])(.*)\1$/, '$2')
  }
}

loadEnvironment()
if (!existsSync(resolve(dist, 'index.html'))) {
  console.error('Missing dist/index.html. Run npm run build first.')
  process.exit(1)
}

const contentTypes = {
  '.css': 'text/css; charset=utf-8', '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon',
}
const api = createN8nApiHandler(process.env)

const server = createServer((req, res) => {
  api(req, res, () => {
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.writeHead(404).end()
      return
    }
    const pathname = decodeURIComponent(new URL(req.url || '/', 'http://localhost').pathname)
    const candidate = resolve(dist, `.${pathname}`)
    const safeCandidate = candidate === dist || candidate.startsWith(`${dist}${sep}`)
    const file = safeCandidate && existsSync(candidate) && statSync(candidate).isFile() ? candidate : resolve(dist, 'index.html')
    res.writeHead(200, { 'content-type': contentTypes[extname(file)] || 'application/octet-stream' })
    if (req.method === 'HEAD') res.end()
    else createReadStream(file).pipe(res)
  })
})

const port = Number(process.env.PORT || 4173)
server.listen(port, '127.0.0.1', () => console.log(`HEINEKEN Retention Copilot listening on http://127.0.0.1:${port}`))
