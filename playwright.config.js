const { defineConfig, devices } = require('@playwright/test');

module.exports = defineConfig({
  testDir: './tests/e2e',
  timeout: 30000,
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL: 'http://127.0.0.1:3100',
    locale: 'pt-BR',
    timezoneId: 'America/Sao_Paulo',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'off',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
  webServer: {
    command: 'node tests/e2e/servidor-e2e.js',
    url: 'http://127.0.0.1:3100/',
    reuseExistingServer: false,
    timeout: 30000,
    env: {
      PORT: '3100',
      HOST: '127.0.0.1',
      DB_PATH: './data/historicos-e2e.db',
      PDF_ROOT: './data/e2e-pdfs',
      LOGO_DIR: './data/e2e-logo',
      CALENDARIO_DIR: './data/e2e-calendario',
    },
  },
});
