import { defineConfig, devices } from '@playwright/test'

/**
 * 浏览器端到端测试配置。
 *
 * 与 Vitest 分工：Vitest 跑 core / adapters 的单元与集成测试，这里跑真实浏览器里
 * 组装完成的整个应用。测试期间由 Playwright 自己拉起 Vite dev server，并强制
 * VITE_CHAT_PROVIDER=mock，避免依赖真实密钥。
 */
const PORT = 5174
const BASE_URL = `http://localhost:${PORT}`

export default defineConfig({
  testDir: './e2e',
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: [['list'], ['html', { open: 'never' }]],

  use: {
    baseURL: BASE_URL,
    trace: 'on-first-retry',
  },

  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile', use: { viewport: { width: 390, height: 844 } } },
  ],

  webServer: {
    command: `npm run dev -- --port ${PORT} --strictPort`,
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
    env: { VITE_CHAT_PROVIDER: 'mock' },
  },
})
