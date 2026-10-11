// E2E de navegação e filtros: npm run test:e2e
// Usa o Chrome instalado (channel 'chrome'); sem download de navegador.
import { defineConfig, devices } from '@playwright/test';

const PORTA = 5180;

export default defineConfig({
  testDir: './e2e',
  timeout: 120_000,
  fullyParallel: false,
  workers: 1,
  reporter: 'list',
  use: {
    baseURL: `http://localhost:${PORTA}/saude-parana/`,
    channel: 'chrome',
    locale: 'pt-BR',
    trace: 'retain-on-failure'
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], channel: 'chrome', locale: 'pt-BR' }, grepInvert: /@celular/ },
    { name: 'celular', use: { ...devices['Pixel 7'], channel: 'chrome', locale: 'pt-BR' }, grep: /@celular/ }
  ],
  webServer: {
    command: `npx vite --port ${PORTA} --strictPort`,
    url: `http://localhost:${PORTA}/saude-parana/`,
    reuseExistingServer: false,
    timeout: 60_000
  }
});
