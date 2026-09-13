/**
 * Agregações da aba "Atenção Primária" (cobertura potencial da APS,
 * e-Gestor/MS). Funções puras, sem mutação das entradas, mais um hook
 * que aplica o recorte territorial e o período aos dados do domínio.
 *
 * Contrato de `dados` (public/data/atencao_primaria.json):
 *   metadata        { fonte, periodo, competencia, atualizacao, nota }
 *   porMes          [{ competencia: "2021-01", cobertura, esf, populacao }]  (estado)
 *   porMunicipio    { "4106902": { cobertura, esf, eap, capacidade, populacao } }
 *   porMunicipioAno { "4106902": { "2021": cobertura, "2022": cobertura } }
 */

import { useMemo } from 'react';
import { useFilteredMunicipios } from './useData';

const VAZIO = Object.freeze({ disponivel: false });

/** "2026-07" -> 2026; null quando o texto não começa com um ano. */
export function anoDaCompetencia(competencia) {
  const ano = parseInt(String(competencia || '').slice(0, 4), 10);
  return Number.isFinite(ano) ? ano : null;
}

/** Verifica se `ano` cabe em [anoMin, anoMax]; limites nulos não restringem. */
export function dentroDoPeriodo(ano, anoMin, anoMax) {
  if (ano === null || ano === undefined) return false;
  if (anoMin !== null && anoMin !== undefined && ano < anoMin) return false;
  if (anoMax !== null && anoMax !== undefined && ano > anoMax) return false;
  return true;
}

/**
 * Códigos IBGE (7 dígitos) presentes em `porMunicipio` e na seleção.
 * Seleção vazia significa "todos os municípios".
 */
export function selecionarCodigos(porMunicipio, codigosSelecao) {
  const todos = Object.keys(porMunicipio || {});
  if (!codigosSelecao || codigosSelecao.length === 0) return todos;
  const conjunto = new Set(codigosSelecao.map(String));
  return todos.filter(cod => conjunto.has(cod));
}

/** Arredonda para uma casa decimal; preserva null. */
export function arredondar1(valor) {
  if (valor === null || valor === undefined) return null;
  const numero = Number(valor);
  if (!Number.isFinite(numero)) return null;
  return Math.round(numero * 10) / 10;
}

/**
 * Média ponderada de pares { valor, peso }. Ignora valores não numéricos
 * e pesos não positivos; retorna null quando não há peso válido.
 */
export function mediaPonderada(pares) {
  const { soma, pesos } = (pares || []).reduce((acc, par) => {
    // null/undefined não é zero: o município fica fora da média.
    if (par?.valor === null || par?.valor === undefined) return acc;
    const valor = Number(par.valor);
    const peso = Number(par.peso);
    if (!Number.isFinite(valor) || !(peso > 0)) return acc;
    return { soma: acc.soma + valor * peso, pesos: acc.pesos + peso };
  }, { soma: 0, pesos: 0 });
  return pesos > 0 ? soma / pesos : null;
}

/** Soma um campo numérico de uma lista de objetos (nulos contam zero). */
export function somarCampo(itens, campo) {
  return (itens || []).reduce((acc, item) => acc + (Number(item?.[campo]) || 0), 0);
}

/**
 * Resumo da seleção na última competência: cobertura ponderada pela
 * população, equipes e população coberta (capacidade das equipes, limitada
 * à população de cada município, como na definição de cobertura potencial).
 */
export function agregarSelecao(porMunicipio, codigos) {
  const itens = (codigos || []).map(cod => porMunicipio?.[cod]).filter(Boolean);
  const cobertura = mediaPonderada(itens.map(m => ({ valor: m.cobertura, peso: m.populacao })));
  const populacaoCoberta = itens.reduce((acc, m) => {
    const capacidade = Number(m.capacidade) || 0;
    const populacao = Number(m.populacao) || 0;
    return acc + (populacao > 0 ? Math.min(capacidade, populacao) : capacidade);
  }, 0);

  return {
    cobertura: arredondar1(cobertura),
    esf: somarCampo(itens, 'esf'),
    eap: somarCampo(itens, 'eap'),
    capacidade: somarCampo(itens, 'capacidade'),
    populacao: somarCampo(itens, 'populacao'),
    populacaoCoberta,
    municipios: itens.length
  };
}

/**
 * Série anual da seleção: para cada ano, média das coberturas municipais
 * ponderada pela população da última competência (porMunicipio).
 */
export function serieAnualSelecao(porMunicipioAno, porMunicipio, codigos, anoMin, anoMax) {
  const anos = new Set();
  (codigos || []).forEach(cod => {
    Object.keys(porMunicipioAno?.[cod] || {}).forEach(ano => anos.add(Number(ano)));
  });

  return [...anos]
    .filter(ano => Number.isFinite(ano) && dentroDoPeriodo(ano, anoMin, anoMax))
    .sort((a, b) => a - b)
    .map(ano => ({
      ano,
      cobertura: arredondar1(mediaPonderada(
        codigos.map(cod => ({
          valor: porMunicipioAno?.[cod]?.[ano],
          peso: porMunicipio?.[cod]?.populacao
        }))
      ))
    }))
    .filter(ponto => ponto.cobertura !== null);
}

/** Série mensal estadual restrita ao período [anoMin, anoMax]. */
export function filtrarSerieMensal(porMes, anoMin, anoMax) {
  return (porMes || []).filter(p => dentroDoPeriodo(anoDaCompetencia(p?.competencia), anoMin, anoMax));
}

/**
 * Linhas para mapa e ranking: uma por município da seleção, com nome e
 * regional vindos de geoMap.municipioPorCodigo.
 */
export function montarRanking(porMunicipio, codigos, geoMap) {
  const info = geoMap?.municipioPorCodigo || {};
  return (codigos || []).map(cod => {
    const m = porMunicipio?.[cod] || {};
    return {
      cod_ibge: cod,
      municipio: info[cod]?.nome || cod,
      regional: info[cod]?.regional || '-',
      cobertura: arredondar1(m.cobertura),
      esf: m.esf ?? null,
      eap: m.eap ?? null,
      capacidade: m.capacidade ?? null,
      populacao: m.populacao ?? null
    };
  });
}

/** Última competência da série mensal (fallback quando metadata não traz). */
export function ultimaCompetencia(porMes) {
  const lista = porMes || [];
  return lista.length > 0 ? lista[lista.length - 1]?.competencia || null : null;
}

/**
 * Hook da aba: aplica o recorte territorial (regional, mesorregião ou
 * município) e o período aos dados de cobertura da APS.
 */
export function useAtencaoPrimaria(dados, geoMap, filters) {
  const codigosSelecao = useFilteredMunicipios(geoMap, filters);

  return useMemo(() => {
    if (!dados) return VAZIO;

    const { anoMin, anoMax } = filters || {};
    const porMunicipio = dados.porMunicipio || {};
    const codigos = selecionarCodigos(porMunicipio, codigosSelecao);

    return {
      disponivel: true,
      selecaoAtiva: codigosSelecao.length > 0,
      competencia: dados.metadata?.competencia || ultimaCompetencia(dados.porMes),
      resumo: agregarSelecao(porMunicipio, codigos),
      serieMensal: filtrarSerieMensal(dados.porMes, anoMin, anoMax),
      serieAnual: serieAnualSelecao(dados.porMunicipioAno, porMunicipio, codigos, anoMin, anoMax),
      ranking: montarRanking(porMunicipio, codigos, geoMap),
      metadata: dados.metadata || null
    };
  }, [dados, geoMap, filters, codigosSelecao]);
}
