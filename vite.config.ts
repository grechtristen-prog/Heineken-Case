import { defineConfig, loadEnv, type Plugin } from 'vite'
import { createN8nApiHandler, type N8nProxyConfig } from './server/n8n-proxy.mjs'

function n8nApiPlugin(config: N8nProxyConfig): Plugin {
  const handler = createN8nApiHandler(config)
  return {
    name: 'heineken-n8n-api',
    configureServer(server) { server.middlewares.use(handler) },
    configurePreviewServer(server) { server.middlewares.use(handler) },
  }
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  return {
    server: { host: '127.0.0.1' },
    plugins: [n8nApiPlugin({
      N8N_ACTION_WEBHOOK_URL: env.N8N_ACTION_WEBHOOK_URL,
      N8N_OUTCOME_WEBHOOK_URL: env.N8N_OUTCOME_WEBHOOK_URL,
      N8N_WEBHOOK_SECRET: env.N8N_WEBHOOK_SECRET,
    })],
    test: { environment: 'jsdom', include: ['src/**/*.test.{ts,tsx}'] },
  }
})
