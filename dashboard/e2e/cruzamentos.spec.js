// Cruzamento na tela: cada regional e mesorregião x cada ano isolado x cada
// aba (5.040 telas). Lenta: npm run test:e2e:cruzamentos
// O cruzamento município x ano (67 mil telas) fica na varredura lógica
// (npm run test:varredura), que roda os mesmos hooks em segundos.
import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';

const geoMap = JSON.parse(readFileSync(new URL('../public/data/geo_map.json', import.meta.url), 'utf-8'));
const RECORTES = [
  ...geoMap.regionais.map((r) => ({ menu: 3, rotulo: `${r.nome} (${r.totalMunicipios})`, nome: r.nome, tamanho: r.totalMunicipios })),
  ...geoMap.mesorregioes.map((m) => ({ menu: 2, rotulo: `${m.nome} (${m.totalMunicipios})`, nome: m.nome, tamanho: m.totalMunicipios }))
];
const ABAS = ['Visão Geral', 'Mortalidade', 'Internações SUS', 'Rede de Saúde',
  'Atenção Primária', 'Dengue', 'Financiamento'];
const ANOS = Array.from({ length: new Date().getFullYear() - 2002 }, (_, i) => String(2003 + i));
const LIXO = /\b(NaN|undefined|Infinity|null)\b|\[object Object\]/;

test.describe.configure({ mode: 'serial' });

for (const recorte of RECORTES) {
  test(`${recorte.menu === 3 ? 'regional' : 'meso'} ${recorte.nome} x anos x abas`, async ({ page }) => {
    test.setTimeout(600_000);
    const erros = [];
    page.on('pageerror', (e) => erros.push(e.message));
    page.on('console', (m) => { if (m.type() === 'error') erros.push(m.text()); });
    await page.goto('');
    await expect(page.locator('main h3').first()).toBeVisible();
    const botao = (i) => page.locator('main button').nth(i);
    const opcao = (texto) => page.locator('main div.z-50 button').getByText(texto, { exact: true });

    await botao(recorte.menu).click();
    await opcao(recorte.rotulo).click();
    await expect(botao(recorte.menu)).toHaveText(recorte.nome);

    const falhas = [];
    for (const nomeAba of ABAS) {
      await page.getByRole('tab', { name: nomeAba }).click();
      for (const ano of ANOS) {
        await botao(0).click();
        await opcao(ano).click();
        await botao(1).click();
        await opcao(ano).click();
        await expect(botao(0)).toHaveText(ano);
        await expect(botao(1)).toHaveText(ano);
        await expect(page.locator('main h3').first()).toBeVisible();
        const texto = await page.locator('main').innerText();
        const lixo = texto.match(LIXO);
        if (lixo) falhas.push(`${nomeAba} ${ano}: "${lixo[0]}"`);
        const rodape = page.locator('main p', { hasText: /^Mostrando/ }).last();
        if (await rodape.count()) {
          const total = Number((await rodape.innerText()).match(/de (\d+)/)[1]);
          if (total > recorte.tamanho) falhas.push(`${nomeAba} ${ano}: ranking com ${total} > ${recorte.tamanho}`);
        }
      }
      // o recorte territorial continua aplicado depois de trocar aba e ano
      await expect(botao(recorte.menu)).toHaveText(recorte.nome);
    }
    expect(falhas).toEqual([]);
    expect(erros).toEqual([]);
  });
}
