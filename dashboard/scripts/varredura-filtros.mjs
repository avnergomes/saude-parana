// Varredura exaustiva da lógica de filtros: todo recorte territorial (estado,
// 23 regionais, 7 mesorregiões, 399 municípios) cruzado com todo período
// (padrão, completo e cada ano isolado), em todos os hooks do painel, com os
// JSON reais de public/data. Roda os hooks de verdade (React SSR via Vite).
// Uso: npm run test:varredura
import { createServer } from 'vite';
import { readFileSync } from 'node:fs';
// React pelo Node: a mesma instância que o Vite externaliza para os hooks
import React from 'react';
import { renderToString } from 'react-dom/server';

const DADOS = new URL('../public/data/', import.meta.url);
const ler = (arquivo) => JSON.parse(readFileSync(new URL(arquivo, DADOS), 'utf-8'));

const vite = await createServer({
  server: { middlewareMode: true },
  appType: 'custom',
  logLevel: 'error'
});

try {
  const core = await vite.ssrLoadModule('/src/hooks/useData.js');
  const { useInternacoes } = await vite.ssrLoadModule('/src/hooks/useInternacoes.js');
  const { useMortalidadeCid } = await vite.ssrLoadModule('/src/hooks/useMortalidadeCid.js');
  const { useRedeSaude } = await vite.ssrLoadModule('/src/hooks/useRedeSaude.js');
  const { useAtencaoPrimaria } = await vite.ssrLoadModule('/src/hooks/useAtencaoPrimaria.js');
  const { useArboviroses } = await vite.ssrLoadModule('/src/hooks/useArboviroses.js');
  const { useFinanciamento } = await vite.ssrLoadModule('/src/hooks/useFinanciamento.js');
  const { useCnpjSaude } = await vite.ssrLoadModule('/src/hooks/useCnpjSaude.js');
  const { filtrosIniciais } = await vite.ssrLoadModule('/src/utils/filtros.js');

  const mortalidade = ler('mortalidade.json');
  const geoMap = ler('geo_map.json');
  const d = {
    estabelecimentos: ler('estabelecimentos.json'),
    mortalidadeCid: ler('mortalidade_cid.json'),
    internacoes: ler('internacoes.json'),
    financiamento: ler('financiamento.json'),
    atencaoPrimaria: ler('atencao_primaria.json'),
    arboviroses: ler('arboviroses.json'),
    planosSaude: ler('planos_saude.json'),
    cnpjSaude: ler('cnpj_saude.json')
  };

  // Mesmo fluxo do App.jsx: KPIs e mortalidade filtrada alimentam as abas
  function executar(filters) {
    let saida;
    function Sonda() {
      const filtrada = core.useFilteredMortalidade(mortalidade, filters, geoMap);
      saida = {
        mortalidade: filtrada,
        kpis: core.useAggregations({ mortalidade }, filters, geoMap),
        internacoes: useInternacoes(d.internacoes, filters, geoMap),
        cid: useMortalidadeCid(d.mortalidadeCid, filters, geoMap),
        rede: useRedeSaude(d.estabelecimentos, d.planosSaude, geoMap, filters, filtrada),
        aps: useAtencaoPrimaria(d.atencaoPrimaria, geoMap, filters),
        arbo: useArboviroses(d.arboviroses, geoMap, filters),
        financiamento: useFinanciamento(d.financiamento, geoMap, filters, filtrada),
        cnpj: useCnpjSaude(d.cnpjSaude, geoMap, filters)
      };
      return null;
    }
    renderToString(React.createElement(Sonda));
    return saida;
  }

  // Número inválido ou texto quebrado em qualquer ponto da saída
  function problemas(valor, caminho, achados) {
    if (achados.length >= 3) return achados;
    if (typeof valor === 'number' && !Number.isFinite(valor)) achados.push(`${caminho} = ${valor}`);
    else if (typeof valor === 'string' && /\b(NaN|undefined|Infinity)\b|\[object Object\]/.test(valor)) {
      achados.push(`${caminho} = "${valor.slice(0, 60)}"`);
    } else if (Array.isArray(valor)) valor.forEach((v, i) => problemas(v, `${caminho}[${i}]`, achados));
    else if (valor && typeof valor === 'object') {
      for (const [k, v] of Object.entries(valor)) problemas(v, `${caminho}.${k}`, achados);
    }
    return achados;
  }

  // Linhas municipais de cada domínio nunca passam do tamanho do recorte
  const LISTAS = [
    ['mortalidade', 'porMunicipio'], ['internacoes', 'porMunicipio'], ['aps', 'ranking'],
    ['arbo', 'ranking'], ['financiamento', 'rows'], ['rede', 'rows'], ['cnpj', 'ranking'], ['cnpj', 'mapa']
  ];

  const territorios = [
    { rotulo: 'Paraná', filtros: {}, tamanho: 399 },
    ...geoMap.regionais.map((r) => ({ rotulo: `regional ${r.nome}`, filtros: { regional: r.nome }, tamanho: r.totalMunicipios })),
    ...geoMap.mesorregioes.map((m) => ({ rotulo: `meso ${m.nome}`, filtros: { mesorregiao: m.nome }, tamanho: m.totalMunicipios })),
    ...Object.entries(geoMap.municipioPorCodigo).map(([cod, m]) => ({
      rotulo: `município ${m.nome}`, filtros: { municipio: m.nome, municipioCodigo: cod }, tamanho: 1
    }))
  ];
  const anoAtual = new Date().getFullYear();
  const periodos = [
    { anoMin: 2010, anoMax: anoAtual },
    { anoMin: 2003, anoMax: anoAtual },
    ...Array.from({ length: anoAtual - 2002 }, (_, i) => ({ anoMin: 2003 + i, anoMax: 2003 + i }))
  ];

  const falhas = [];
  let combinacoes = 0;
  const inicio = Date.now();
  for (const t of territorios) {
    for (const p of periodos) {
      combinacoes += 1;
      const filters = { ...filtrosIniciais(), ...p, ...t.filtros };
      const contexto = `${t.rotulo} / ${p.anoMin}-${p.anoMax}`;
      let saida;
      try {
        saida = executar(filters);
      } catch (erro) {
        falhas.push(`${contexto}: exceção ${erro.message}`);
        continue;
      }
      const achados = problemas(saida, 'saida', []);
      if (achados.length) falhas.push(`${contexto}: ${achados.join('; ')}`);
      // Mapa/ranking do núcleo seguem o último ano do período, nunca outro
      const { anoMunicipios, porMunicipio } = saida.mortalidade;
      if (anoMunicipios != null && (anoMunicipios > p.anoMax || anoMunicipios < p.anoMin)) {
        falhas.push(`${contexto}: anoMunicipios ${anoMunicipios} fora do período`);
      }
      if (porMunicipio.some((linha) => linha.ano !== anoMunicipios && !(anoMunicipios == null && linha.obitos == null))) {
        falhas.push(`${contexto}: linhas municipais de outro ano que ${anoMunicipios}`);
      }
      for (const [dominio, campo] of LISTAS) {
        const lista = saida[dominio]?.[campo];
        if (!Array.isArray(lista)) {
          falhas.push(`${contexto}: ${dominio}.${campo} ausente`);
        } else if (lista.length > t.tamanho) {
          falhas.push(`${contexto}: ${dominio}.${campo} tem ${lista.length} linhas para ${t.tamanho} municípios`);
        }
      }
    }
  }

  const segundos = ((Date.now() - inicio) / 1000).toFixed(1);
  console.log(`${combinacoes} combinações (${territorios.length} recortes x ${periodos.length} períodos, 9 hooks) em ${segundos} s`);
  if (falhas.length) {
    console.log(`${falhas.length} falhas:`);
    falhas.slice(0, 40).forEach((f) => console.log(`  - ${f}`));
    process.exitCode = 1;
  } else {
    console.log('nenhuma falha');
  }
} finally {
  await vite.close();
}
