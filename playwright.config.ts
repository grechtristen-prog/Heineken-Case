import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './browser-tests',
  use: { baseURL: 'http://127.0.0.1:4173', browserName: 'chromium', channel: 'chrome' },
  webServer: {
    command: process.platform === 'win32' ? 'npm.cmd run dev -- --port 4173' : 'npm run dev -- --port 4173',
    url: 'http://127.0.0.1:4173',
    reuseExistingServer: true,
    timeout: 30_000,
  },
})
