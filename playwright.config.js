// @ts-check
const { defineConfig, devices } = require('@playwright/test');

module.exports = defineConfig({
  testDir: './test/e2e',
  timeout: 30_000,
  retries: process.env.CI ? 1 : 0, // 1 retry no CI (flaky), 0 local; 2 inflava o tempo dos fails (×3)
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: process.env.RHINO_URL || 'http://localhost:3001',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure'
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } }
  ]
});
