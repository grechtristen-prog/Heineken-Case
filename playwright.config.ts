import { defineConfig } from '@playwright/test'

const remoteURL = process.env.PLAYWRIGHT_BASE_URL

export default defineConfig({
  testDir: './browser-tests',
  use: { baseURL: remoteURL || 'http://127.0.0.1:4173', browserName: 'chromium', channel: 'chrome' },
  webServer: remoteURL ? undefined : {
    command: process.platform === 'win32' ? 'npm.cmd run dev -- --port 4173' : 'npm run dev -- --port 4173',
    url: 'http://127.0.0.1:4173',
    reuseExistingServer: true,
    timeout: 30_000,
  },
})
