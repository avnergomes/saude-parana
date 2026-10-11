// Rodar: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatarEixo, separarParcial, SUFIXO_PARCIAL, tetoRedondo, marcasEixo, limitesClasses, classeDoValor, corDaClasse } from './graficos.js';

test('eixo em pt-BR, coerente com o tooltip', () => {
  assert.equal(formatarEixo(1_000_000), '1 mi');
  assert.equal(formatarEixo(1_080_000), '1,08 mi');
  assert.equal(formatarEixo(900_000), '900 mil');
  assert.equal(formatarEixo(75), '75');
  assert.equal(formatarEixo(7.5), '7,5');
  assert.equal(formatarEixo(0), '0');
});

test('ano parcial sai da linha cheia e vira trecho tracejado', () => {
  const dados = [
    { ano: 2024, internacoes: 1020, taxa: 86 },
    { ano: 2025, internacoes: 1080, taxa: 91 },
    { ano: 2026, internacoes: 640, taxa: null, parcial: true }
  ];
  const { dados: d, parciais } = separarParcial(dados, ['internacoes', 'taxa']);
  assert.deepEqual(d.map((l) => l.internacoes), [1020, 1080, null]);
  assert.deepEqual(d.map((l) => l['internacoes' + SUFIXO_PARCIAL]), [null, 1080, 640]);
  // taxa do ano parcial é nula: não há trecho tracejado para ela
  assert.deepEqual(parciais, ['internacoes']);
  assert.equal(dados[2].internacoes, 640, 'não muta a entrada');
});

test('sem ano parcial os dados passam intactos', () => {
  const dados = [{ ano: 2024, total: 1 }];
  const r = separarParcial(dados, ['total']);
  assert.equal(r.dados, dados);
  assert.deepEqual(r.parciais, []);
});

test('teto redondo para eixos', () => {
  assert.equal(tetoRedondo(15_700), 20_000);
  assert.equal(tetoRedondo(23_000), 25_000);
  assert.equal(tetoRedondo(9_000), 10_000);
  assert.equal(tetoRedondo(100), 100);
  assert.equal(tetoRedondo(0), 1);
});

test('marcas redondas do eixo', () => {
  assert.deepEqual(marcasEixo(21_700).marcas, [0, 5000, 10000, 15000, 20000, 25000]);
  assert.deepEqual(marcasEixo(18_000).marcas, [0, 5000, 10000, 15000, 20000]);
  assert.deepEqual(marcasEixo(0.9).marcas, [0, 0.2, 0.4, 0.6, 0.8, 1]);
  assert.deepEqual(marcasEixo(35_000).marcas, [0, 10000, 20000, 30000, 40000]);
  assert.equal(marcasEixo(0).teto, 0.2);
});

test('rótulo de eixo com passo de 2,5 não arredonda errado', () => {
  assert.equal(formatarEixo(1_250_000), '1,25 mi');
  assert.equal(formatarEixo(1_250), '1,25 mil');
});

test('classes: cauda moderada fica em intervalos iguais; cauda à esquerda vira quantis', () => {
  // internações: nenhuma classe com mais da metade -> iguais
  const moderada = [...Array.from({ length: 390 }, (_, i) => 60 + (i % 90)), 200, 210, 220, 230, 240, 242, 150, 160, 170];
  assert.equal(limitesClasses(moderada, 8).tipo, 'iguais');
  // APS: quase todos em 100%, poucos baixos -> quantis
  const aps = [...Array(330).fill(100), ...Array.from({ length: 69 }, (_, i) => 44 + i * 0.8)];
  assert.equal(limitesClasses(aps, 8).tipo, 'quantis');
});

test('classes: zero repetido ganha classe própria', () => {
  // muitos zeros e uma cauda longa: intervalos iguais concentrariam > 50% -> quantis
  const leitos = [...Array(150).fill(0), ...Array.from({ length: 245 }, (_, i) => 0.5 + i * 0.01), 12, 14, 15, 16];
  const { limites, contagem } = limitesClasses(leitos, 8);
  assert.equal(limites[0], 0);
  assert.equal(limites[1], 0);
  assert.equal(contagem[0], 150, 'só os zeros na 1ª classe');
  assert.equal(classeDoValor(0.5, limites), 1);
  assert.equal(contagem.reduce((a, b) => a + b, 0), leitos.length);
  assert.equal(limitesClasses(leitos, 8).tipo, 'quantis');
});

test('classes do mapa: iguais em distribuição regular, quantis se assimétrica', () => {
  const regular = Array.from({ length: 100 }, (_, i) => i);
  const r = limitesClasses(regular, 4);
  assert.equal(r.tipo, 'iguais');
  assert.deepEqual(r.limites, [0, 24.75, 49.5, 74.25, 99]);
  const dengue = [...Array.from({ length: 99 }, (_, i) => 10 + i), 12_718];
  const d = limitesClasses(dengue, 4);
  assert.equal(d.tipo, 'quantis');
  // com intervalos iguais 99% cairia na 1ª classe; com quantis ~25% em cada
  const contagem = [0, 0, 0, 0];
  dengue.forEach((x) => { contagem[classeDoValor(x, d.limites)] += 1; });
  assert.ok(contagem.every((c) => c >= 20), JSON.stringify(contagem));
});

test('classe e cor: máximo na última classe, valor único sem quebrar', () => {
  assert.equal(classeDoValor(99, [0, 50, 99]), 1);
  assert.equal(classeDoValor(0, [0, 50, 99]), 0);
  assert.equal(limitesClasses([5, 5], 8).limites.length, 2);
  const cores = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
  assert.equal(corDaClasse(0, 3, cores), 'a');
  assert.equal(corDaClasse(2, 3, cores), 'h');
  assert.equal(corDaClasse(0, 1, cores), 'e');
});
