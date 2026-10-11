// Navegação e filtros do painel, no navegador. Cada teste cobre um defeito
// já corrigido (ver src/utils/filtros.js) ou uma varredura de recortes.
import { test, expect } from '@playwright/test';

const ABAS = ['Visão Geral', 'Mortalidade', 'Internações SUS', 'Rede de Saúde',
  'Atenção Primária', 'Dengue', 'Financiamento'];
const LIXO = /\b(NaN|undefined|Infinity|null)\b|\[object Object\]/;

// Botões fixos da barra de filtros: [anoMin, anoMax, mesorregião, regional, município]
// (índices estáveis com os menus fechados)
const filtro = (page, i) => page.locator('main button').nth(i);
const opcoes = (page) => page.locator('main div.z-50 button');
const aba = (page, nome) => page.getByRole('tab', { name: nome });
const chips = (page) => page.locator('main button[aria-label^="Remover filtro"]');
const rodapeRanking = (page) => page.locator('main p', { hasText: /^Mostrando/ }).last();

async function abrir(page, hash = '') {
  const erros = [];
  page.on('pageerror', (e) => erros.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') erros.push(m.text()); });
  await page.goto(hash);
  await expect(aba(page, 'Visão Geral')).toBeVisible();
  await expect(page.locator('main h3').first()).toBeVisible();
  return erros;
}

// Com o menu aberto, a camada que fecha ao clicar fora cobre os botões
const fecharMenu = (page) => page.locator('main .fixed.inset-0').click({ position: { x: 5, y: 5 } });

async function escolher(page, indice, texto) {
  await filtro(page, indice).click();
  await opcoes(page).filter({ hasText: texto }).first().click();
}

async function escolherMunicipio(page, nome) {
  await filtro(page, 4).click();
  await page.getByPlaceholder('Buscar município...').fill(nome);
  await opcoes(page).getByText(nome, { exact: true }).click();
}

async function conferirAbas(page, rotulo, maxMunicipios = null) {
  for (const nome of ABAS) {
    await aba(page, nome).click();
    await expect(aba(page, nome)).toHaveAttribute('aria-selected', 'true');
    await expect(page.locator('main h3').first()).toBeVisible();
    const texto = await page.locator('main').innerText();
    expect(texto, `${rotulo} / ${nome}`).not.toMatch(LIXO);
    if (maxMunicipios != null && await rodapeRanking(page).count()) {
      const total = Number((await rodapeRanking(page).innerText()).match(/de (\d+)/)[1]);
      expect(total, `${rotulo} / ${nome}: ranking`).toBeLessThanOrEqual(maxMunicipios);
    }
  }
}

test('aba fica na URL: hash, voltar e hash inválido', async ({ page }) => {
  const erros = await abrir(page, '#internacoes');
  await expect(aba(page, 'Internações SUS')).toHaveAttribute('aria-selected', 'true');
  await aba(page, 'Dengue').click();
  await expect(page).toHaveURL(/#arboviroses$/);
  await page.goBack();
  await expect(aba(page, 'Internações SUS')).toHaveAttribute('aria-selected', 'true');
  await page.goto('#%E0%A4%A');
  await page.reload();
  await expect(aba(page, 'Visão Geral')).toHaveAttribute('aria-selected', 'true');
  expect(erros).toEqual([]);
});

test('município: marcar, desmarcar e Limpar', async ({ page }) => {
  const erros = await abrir(page, '#internacoes');
  await escolherMunicipio(page, 'Londrina');
  await expect(filtro(page, 4)).toHaveText('Londrina');
  await expect(page.locator('main table').last().locator('tbody tr')).toHaveCount(1);
  await escolherMunicipio(page, 'Londrina');
  await expect(filtro(page, 4)).toHaveText('Municipio');
  await expect(rodapeRanking(page)).toContainText('de 399');
  await escolher(page, 0, '2003');
  await page.getByRole('button', { name: 'Limpar', exact: true }).click();
  await expect(filtro(page, 0)).toHaveText('2010');
  await expect(filtro(page, 1)).toHaveText(String(new Date().getFullYear()));
  expect(erros).toEqual([]);
});

test('ranking volta à primeira página ao mudar o recorte', async ({ page }) => {
  await abrir(page, '#internacoes');
  await page.getByRole('button', { name: 'Última' }).click();
  await expect(rodapeRanking(page)).toContainText('391-399 de 399');
  await escolher(page, 3, 'Apucarana (');
  await expect(rodapeRanking(page)).toContainText('1-10 de 13');
});

test('ordenar o ranking volta à primeira página', async ({ page }) => {
  await abrir(page, '#internacoes');
  await page.getByRole('button', { name: 'Última' }).click();
  await expect(rodapeRanking(page)).toContainText('391-399');
  await page.locator('main table').last().locator('thead th', { hasText: 'Município' }).click();
  await expect(rodapeRanking(page)).toContainText('1-10 de 399');
});

test('regional e mesorregião se excluem', async ({ page }) => {
  await abrir(page);
  await escolher(page, 2, 'Norte (');
  await escolher(page, 3, 'Londrina (');
  await expect(filtro(page, 2)).toHaveText('Mesorregiao');
  await expect(filtro(page, 3)).toHaveText('Londrina');
});

test('clique no mapa e no ranking: marca, realça, desmarca e o menu prevalece', async ({ page }) => {
  const erros = await abrir(page);
  const realcados = page.locator('.leaflet-overlay-pane path[stroke-width="3"]');
  await expect(page.locator('.leaflet-overlay-pane path.leaflet-interactive').first()).toBeVisible({ timeout: 30_000 });

  await page.locator('main table').last().locator('tbody tr').first().click();
  await expect(chips(page)).toHaveCount(1);
  await expect(realcados).toHaveCount(1);
  // o realce sobrevive ao mouseout (antes resetStyle() o apagava)
  // referência fixa: no hover a borda vira 2 e o seletor deixaria de achá-la
  const selecionado = await realcados.first().elementHandle();
  await selecionado.dispatchEvent('mouseover');
  await expect(realcados).toHaveCount(0);
  await selecionado.dispatchEvent('mouseout');
  await expect(realcados).toHaveCount(1);
  // o menu de território desfaz o clique
  await escolher(page, 3, 'Cascavel (');
  await expect(chips(page)).toHaveCount(0);
  await page.getByRole('button', { name: 'Limpar', exact: true }).click();

  // clicar duas vezes na mesma feição marca e desmarca
  await page.locator('.leaflet-overlay-pane path.leaflet-interactive').nth(50).dispatchEvent('click');
  await expect(chips(page)).toHaveCount(1);
  await realcados.first().dispatchEvent('click');
  await expect(chips(page)).toHaveCount(0);
  expect(erros).toEqual([]);
});

test('todas as regionais em todas as abas', async ({ page }) => {
  test.setTimeout(600_000);
  const erros = await abrir(page);
  await filtro(page, 3).click();
  const nomes = (await opcoes(page).allInnerTexts()).filter((t) => /\(\d+\)$/.test(t.trim()));
  await fecharMenu(page);
  expect(nomes.length).toBe(23);
  for (const nome of nomes) {
    await escolher(page, 3, nome.trim());
    await conferirAbas(page, nome, Number(nome.match(/\((\d+)\)/)[1]));
  }
  expect(erros).toEqual([]);
});

test('todas as mesorregiões em todas as abas', async ({ page }) => {
  test.setTimeout(300_000);
  const erros = await abrir(page);
  await filtro(page, 2).click();
  const nomes = (await opcoes(page).allInnerTexts()).filter((t) => /\(\d+\)$/.test(t.trim()));
  await fecharMenu(page);
  expect(nomes.length).toBe(7);
  for (const nome of nomes) {
    await escolher(page, 2, nome.trim());
    await conferirAbas(page, nome, Number(nome.match(/\((\d+)\)/)[1]));
  }
  expect(erros).toEqual([]);
});

test('cada ano isolado em todas as abas', async ({ page }) => {
  test.setTimeout(600_000);
  const erros = await abrir(page);
  for (let ano = 2003; ano <= new Date().getFullYear(); ano++) {
    await filtro(page, 0).click();
    await opcoes(page).getByText(String(ano), { exact: true }).click();
    await filtro(page, 1).click();
    await opcoes(page).getByText(String(ano), { exact: true }).click();
    await expect(filtro(page, 0)).toHaveText(String(ano));
    await expect(filtro(page, 1)).toHaveText(String(ano));
    await conferirAbas(page, `ano ${ano}`);
  }
  expect(erros).toEqual([]);
});

test('município sem dados de APS (Anahy) não quebra nenhuma aba', async ({ page }) => {
  const erros = await abrir(page);
  await escolherMunicipio(page, 'Anahy');
  await conferirAbas(page, 'Anahy', 1);
  expect(erros).toEqual([]);
});

test('realce do município selecionado sobrevive ao mouseout em todas as abas', async ({ page }) => {
  const erros = await abrir(page);
  const realcados = page.locator('.leaflet-overlay-pane path[stroke-width="3"]');
  for (const nome of ABAS) {
    await aba(page, nome).click();
    const feicoes = page.locator('.leaflet-overlay-pane path.leaflet-interactive');
    await expect(feicoes.first()).toBeVisible({ timeout: 30_000 });
    await feicoes.nth(50).dispatchEvent('click');
    await expect(chips(page), nome).toHaveCount(1);
    const n = await realcados.count();
    expect(n, `${nome}: realce`).toBeGreaterThan(0);
    for (const el of await realcados.elementHandles()) {
      await el.dispatchEvent('mouseover');
      await el.dispatchEvent('mouseout');
    }
    await expect(realcados, `${nome}: realce após mouseout`).toHaveCount(n);
    await page.getByRole('button', { name: 'Limpar todos' }).click();
  }
  expect(erros).toEqual([]);
});

test('mapa, ranking e população seguem o ano escolhido', async ({ page }) => {
  const erros = await abrir(page);
  const tituloMapa = page.locator('main h3', { hasText: 'Taxa de Mortalidade por Município' });
  await expect(tituloMapa).toContainText('(2024)');
  await filtro(page, 1).click();
  await opcoes(page).getByText('2010', { exact: true }).click();
  await expect(tituloMapa).toContainText('(2010)');
  await expect(page.locator('main h3', { hasText: 'Ranking de Municípios por Óbitos' })).toContainText('(2010)');
  await expect(page.getByText('estimativa IBGE, 2010')).toBeVisible();
  // ano sem IBGE: valores vazios, nunca os de outro ano
  await page.getByRole('button', { name: 'Limpar', exact: true }).click();
  await filtro(page, 0).click();
  await opcoes(page).getByText('2026', { exact: true }).click();
  await expect(tituloMapa).not.toContainText('(20');
  expect(await page.locator('main').innerText()).not.toMatch(LIXO);
  expect(erros).toEqual([]);
});

test('teclado: setas nas abas, Esc fecha o menu, aria-expanded', async ({ page }) => {
  const erros = await abrir(page);
  const historico0 = await page.evaluate(() => history.length);
  await aba(page, 'Visão Geral').focus();
  await page.keyboard.press('ArrowRight');
  await expect(aba(page, 'Mortalidade')).toHaveAttribute('aria-selected', 'true');
  await expect(aba(page, 'Mortalidade')).toBeFocused();
  await expect(page).toHaveURL(/#mortalidade$/);
  await page.keyboard.press('End');
  await expect(aba(page, 'Financiamento')).toHaveAttribute('aria-selected', 'true');
  await page.keyboard.press('ArrowRight');
  await expect(aba(page, 'Visão Geral')).toHaveAttribute('aria-selected', 'true');
  await page.keyboard.press('ArrowLeft');
  await expect(aba(page, 'Financiamento')).toHaveAttribute('aria-selected', 'true');
  await page.keyboard.press('Home');
  await expect(aba(page, 'Visão Geral')).toHaveAttribute('aria-selected', 'true');
  // setas substituem o hash: o histórico não cresce uma entrada por aba
  expect(await page.evaluate(() => history.length)).toBe(historico0);
  // só a aba ativa entra na ordem de tabulação
  await expect(page.locator('[role=tab][tabindex="0"]')).toHaveCount(1);

  await expect(filtro(page, 3)).toHaveAttribute('aria-expanded', 'false');
  await filtro(page, 3).click();
  await expect(filtro(page, 3)).toHaveAttribute('aria-expanded', 'true');
  await expect(opcoes(page).first()).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(opcoes(page)).toHaveCount(0);
  await expect(filtro(page, 3)).toHaveAttribute('aria-expanded', 'false');
  await expect(filtro(page, 3)).toBeFocused();
  await filtro(page, 4).click();
  await page.getByPlaceholder('Buscar município...').fill('Lon');
  await page.keyboard.press('Escape');
  await expect(page.getByPlaceholder('Buscar município...')).toHaveCount(0);
  await expect(filtro(page, 4)).toBeFocused();
  // escolher uma opção também devolve o foco ao botão do menu
  await escolher(page, 3, 'Apucarana (');
  await expect(filtro(page, 3)).toBeFocused();
  expect(erros).toEqual([]);
});

test('celular: sem rolagem lateral e aba ativa visível @celular', async ({ page }) => {
  const erros = await abrir(page, '#financiamento');
  for (const nome of ABAS) {
    await aba(page, nome).click();
    await expect(aba(page, nome)).toBeInViewport();
    const [largura, tela] = await page.evaluate(() => [document.documentElement.scrollWidth, document.documentElement.clientWidth]);
    expect(largura, nome).toBeLessThanOrEqual(tela);
  }
  expect(erros).toEqual([]);
});
