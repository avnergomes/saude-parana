// Cruzamento na tela: cada município x cada ano isolado x cada aba (~67 mil
// telas, horas). Roda em lotes pela faixa de índices (0 a 398):
//   MUN_INI=0 MUN_FIM=17 npx playwright test e2e/municipios-anos.spec.js --project=desktop
// Sem MUN_INI/MUN_FIM a suíte não roda (fica fora do npm run test:e2e).
import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';

const geoMap = JSON.parse(readFileSync(new URL('../public/data/geo_map.json', import.meta.url), 'utf-8'));
const TODOS = Object.entries(geoMap.municipioPorCodigo)
  .map(([cod, m]) => ({ cod, nome: m.nome }))
  .sort((a, b) => a.cod.localeCompare(b.cod));
const INI = Number(process.env.MUN_INI);
const FIM = Number(process.env.MUN_FIM);
const LOTE = Number.isInteger(INI) && Number.isInteger(FIM) ? TODOS.slice(INI, FIM + 1) : [];
const ABAS = ['Visão Geral', 'Mortalidade', 'Internações SUS', 'Rede de Saúde',
  'Atenção Primária', 'Dengue', 'Financiamento'];
const ANOS = Array.from({ length: new Date().getFullYear() - 2002 }, (_, i) => String(2003 + i));
const LIXO = /\b(NaN|undefined|Infinity|null)\b|\[object Object\]/;

test.describe.configure({ mode: 'serial' });

for (const { cod, nome } of LOTE) {
  test(`município ${cod} ${nome} x anos x abas`, async ({ page }) => {
    test.setTimeout(300_000);
    const erros = [];
    page.on('pageerror', (e) => erros.push(e.message));
    page.on('console', (m) => { if (m.type() === 'error') erros.push(m.text()); });
    await page.goto('');
    await expect(page.locator('main h3').first()).toBeVisible();
    const botao = (i) => page.locator('main button').nth(i);
    const opcao = (texto) => page.locator('main div.z-50 button').getByText(texto, { exact: true });

    await botao(4).click();
    await page.getByPlaceholder('Buscar município...').fill(nome);
    await opcao(nome).first().click();
    await expect(botao(4)).toHaveText(nome);

    const falhas = [];
    for (const nomeAba of ABAS) {
      await page.getByRole('tab', { name: nomeAba }).click();
      for (const ano of ANOS) {
        await botao(0).click();
        await opcao(ano).click();
        await botao(1).click();
        await opcao(ano).click();
        await expect(botao(1)).toHaveText(ano);
        await expect(page.locator('main h3').first()).toBeVisible();
        const lixo = (await page.locator('main').innerText()).match(LIXO);
        if (lixo) falhas.push(`${nomeAba} ${ano}: "${lixo[0]}"`);
      }
      await expect(botao(4)).toHaveText(nome);
    }
    expect(falhas).toEqual([]);
    expect(erros).toEqual([]);
  });
}
