// Varredura exaustiva: cada um dos 399 municípios em cada aba (um teste por
// aba). Lenta (~minutos por aba): npm run test:e2e:municipios
import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';

const geoMap = JSON.parse(readFileSync(new URL('../public/data/geo_map.json', import.meta.url), 'utf-8'));
const MUNICIPIOS = Object.entries(geoMap.municipioPorCodigo).map(([cod, m]) => ({ cod, nome: m.nome }));
const ABAS = ['Visão Geral', 'Mortalidade', 'Internações SUS', 'Rede de Saúde',
  'Atenção Primária', 'Dengue', 'Financiamento'];
const LIXO = /\b(NaN|undefined|Infinity|null)\b|\[object Object\]/;

test.describe.configure({ mode: 'serial' });

for (const nomeAba of ABAS) {
  test(`cada município na aba ${nomeAba}`, async ({ page }) => {
    test.setTimeout(900_000);
    expect(MUNICIPIOS.length).toBe(399);
    const erros = [];
    page.on('pageerror', (e) => erros.push(e.message));
    page.on('console', (m) => { if (m.type() === 'error') erros.push(m.text()); });
    await page.goto('');
    await page.getByRole('tab', { name: nomeAba }).click();
    await expect(page.locator('main h3').first()).toBeVisible();
    const botaoMunicipio = page.locator('main button').nth(4);
    const falhas = [];
    for (const { cod, nome } of MUNICIPIOS) {
      await botaoMunicipio.click();
      await page.getByPlaceholder('Buscar município...').fill(nome);
      await page.locator('main div.z-50 button').getByText(nome, { exact: true }).first().click();
      await expect(botaoMunicipio).toHaveText(nome);
      await expect(page.locator('main h3').first()).toBeVisible();
      const texto = await page.locator('main').innerText();
      const lixo = texto.match(LIXO);
      if (lixo) falhas.push(`${cod} ${nome}: "${lixo[0]}"`);
    }
    expect(falhas, `municípios com valor quebrado em ${nomeAba}`).toEqual([]);
    expect(erros).toEqual([]);
  });
}
