// Regressões dos filtros e da navegação. Rodar: npm test (node --test).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  filtrosIniciais,
  periodoAlterado,
  aplicarMunicipio,
  aplicarRegional,
  aplicarMesorregiao,
  interativosAposMenu,
  resolverMunicipio,
  paginaValida,
  assinaturaLinhas,
  abaDoHash,
  codigosFiltrados,
  linhasDoAno,
  sufixoAno
} from './filtros.js';

const LONDRINA = { cod_ibge: '4113700', nome: 'Londrina' };

test('desmarcar o município limpa nome e código', () => {
  const marcado = aplicarMunicipio(filtrosIniciais(), LONDRINA);
  assert.equal(marcado.municipioCodigo, '4113700');
  const desmarcado = aplicarMunicipio(marcado, LONDRINA);
  assert.equal(desmarcado.municipio, null);
  assert.equal(desmarcado.municipioCodigo, null);
  const todos = aplicarMunicipio(marcado, null);
  assert.equal(todos.municipioCodigo, null);
});

test('regional e mesorregião se excluem e limpam o município', () => {
  const comMeso = aplicarMesorregiao(aplicarMunicipio(filtrosIniciais(), LONDRINA), 'Norte');
  assert.equal(comMeso.municipioCodigo, null);
  const comRegional = aplicarRegional(comMeso, 'Londrina');
  assert.equal(comRegional.mesorregiao, null);
  assert.equal(comRegional.regional, 'Londrina');
  assert.equal(aplicarRegional(comRegional, 'Londrina').regional, null);
  assert.equal(aplicarMesorregiao(comRegional, 'Norte').regional, null);
});

test('aplicar filtros não muta o estado anterior', () => {
  const antes = Object.freeze(filtrosIniciais());
  assert.doesNotThrow(() => aplicarRegional(antes, 'Apucarana'));
});

test('"Limpar" aparece quando só o período mudou', () => {
  assert.equal(periodoAlterado(filtrosIniciais()), false);
  assert.equal(periodoAlterado({ ...filtrosIniciais(), anoMin: 2003 }), true);
});

test('menu de território limpa o município clicado no mapa', () => {
  const antes = filtrosIniciais();
  const interativos = { ano: 2018, municipio: 'Marumbi', municipioCodigo: '4114807' };
  const novos = aplicarRegional(antes, 'Londrina');
  const r = interativosAposMenu(antes, novos, interativos);
  assert.equal(r.municipioCodigo, null);
  assert.equal(r.ano, 2018, 'o ano clicado continua');
});

test('menu de período limpa o ano clicado no gráfico', () => {
  const antes = filtrosIniciais();
  const interativos = { ano: 2018, municipio: null, municipioCodigo: null };
  const r = interativosAposMenu(antes, { ...antes, anoMin: 2015 }, interativos);
  assert.equal(r.ano, null);
});

test('sem mudança relevante o estado interativo é o mesmo objeto', () => {
  const antes = filtrosIniciais();
  const interativos = { ano: null, municipio: null, municipioCodigo: null };
  assert.equal(interativosAposMenu(antes, { ...antes, regional: 'X' }, interativos), interativos);
});

test('clique no mapa: 6 dígitos viram 7 e o nome vem do cadastro', () => {
  const cadastro = { '4113700': { nome: 'Londrina' }, '4106902': { nome: 'Curitiba' } };
  assert.deepEqual(resolverMunicipio('411370', undefined, cadastro), { codigo: '4113700', nome: 'Londrina' });
  assert.deepEqual(resolverMunicipio('411370', '411370', cadastro), { codigo: '4113700', nome: 'Londrina' });
  assert.deepEqual(resolverMunicipio('4106902', 'Curitiba', cadastro), { codigo: '4106902', nome: 'Curitiba' });
  assert.equal(resolverMunicipio('', 'x', cadastro), null);
});

test('página do ranking nunca passa do fim após filtrar', () => {
  assert.equal(paginaValida(39, 13, 10), 1);
  assert.equal(paginaValida(3, 0, 10), 0);
  assert.equal(paginaValida(-1, 50, 10), 0);
  assert.equal(paginaValida(2, 50, 10), 2);
});

test('assinatura do ranking muda com o recorte e não com a identidade do array', () => {
  const linhas = [{ cod_ibge: '1' }, { cod_ibge: '2' }];
  assert.equal(assinaturaLinhas(linhas), assinaturaLinhas([...linhas]));
  assert.notEqual(assinaturaLinhas(linhas), assinaturaLinhas([{ cod_ibge: '1' }]));
  assert.equal(assinaturaLinhas(null), '');
});

test('aba do hash: válida, inválida e malformada', () => {
  const abas = new Set(['visao-geral', 'mortalidade']);
  assert.equal(abaDoHash('#mortalidade', abas, 'visao-geral'), 'mortalidade');
  assert.equal(abaDoHash('#xyz', abas, 'visao-geral'), 'visao-geral');
  assert.equal(abaDoHash('#%E0%A4%A', abas, 'visao-geral'), 'visao-geral');
  assert.equal(abaDoHash('', abas, 'visao-geral'), 'visao-geral');
});

test('município clicado filtra mesmo sem geo_map', () => {
  assert.deepEqual(codigosFiltrados(null, { municipioCodigo: 4113700 }), ['4113700']);
  assert.deepEqual(codigosFiltrados(null, { regional: 'Londrina' }), []);
  const geoMap = { municipiosPorRegional: { Londrina: [{ cod_ibge: '4113700' }] }, municipiosPorMesorregiao: {} };
  assert.deepEqual(codigosFiltrados(geoMap, { regional: 'Londrina' }), ['4113700']);
});

test('mapa e ranking seguem o ano do período, nunca outro ano', () => {
  const base = [
    { cod_ibge: 'A', nome: 'A', ano: 2024, obitos: 10, populacao: 1000, taxa: 10 },
    { cod_ibge: 'B', nome: 'B', ano: 2024, obitos: 20, populacao: 1000, taxa: 20 }
  ];
  const porAno = { A: { 2010: { obitos: 30, populacao: 2000 } }, B: { 2010: { obitos: 5, populacao: 1000 } } };
  assert.equal(linhasDoAno(base, porAno, 2024), base);
  const l2010 = linhasDoAno(base, porAno, 2010);
  assert.deepEqual(l2010.map(l => [l.cod_ibge, l.obitos, l.taxa, l.ano]), [['A', 30, 15, 2010], ['B', 5, 5, 2010]]);
  const semAno = linhasDoAno(base, porAno, null);
  assert.ok(semAno.every(l => l.obitos === null && l.populacao === null && l.taxa === null));
  assert.equal(sufixoAno(2010), ' (2010)');
  assert.equal(sufixoAno(null), '');
});
