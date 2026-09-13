/**
 * Agregações da aba "Dengue e arboviroses" (InfoDengue, Fiocruz/FGV).
 * Funções puras, sem mutação das entradas, mais um hook que aplica o
 * recorte territorial e o período aos dados do domínio.
 *
 * Contrato de `dados` (public/data/arboviroses.json):
 *   metadata        { fonte, doencas, periodo, semanaUltima, atualizacao, nota }
 *   porSemana       [{ semana: "202401", inicio, casos_est, casos, municipiosAlerta }]  (estado)
 *   porAno          [{ ano, casos, casos_est, incidencia_100k }]                       (estado)
 *   porMunicipio    { "4106902": { casos_ano, casos_est_ano, incidencia_100k, nivel, pop } }
 *   porMunicipioAno { "4106902": { "2024": casos, "2025": casos } }
 *   anoReferencia   2026
 */

import { useMemo } from 'react';
import { useFilteredMunicipios } from './useData';
import { dentroDoPeriodo, selecionarCodigos, somarCampo } from './useAtencaoPrimaria';

const VAZIO = Object.freeze({ disponivel: false });

/** Nível a partir do qual o município conta como "em alerta" (laranja e vermelho). */
export const NIVEL_ALERTA = 3;

/** "202636" -> 2026; null quando o texto não começa com um ano. */
export function anoDaSemana(semana) {
  const ano = parseInt(String(semana || '').slice(0, 4), 10);
  return Number.isFinite(ano) ? ano : null;
}

/** "202636" -> "2026-S36" (rótulo curto e legível para o eixo x). */
export function rotularSemana(semana) {
  const texto = String(semana || '');
  if (texto.length < 6) return texto;
  return `${texto.slice(0, 4)}-S${texto.slice(4, 6)}`;
}

/** Incidência por 100 mil habitantes; null sem população. */
export function incidenciaPor100k(casos, populacao) {
  const pop = Number(populacao);
  if (!(pop > 0)) return null;
  return Math.round((Number(casos) || 0) / pop * 1e5 * 10) / 10;
}

/**
 * Resumo da seleção no ano de referência: casos prováveis, casos
 * estimados, população, incidência e municípios em alerta.
 */
export function agregarSelecao(porMunicipio, codigos, nivelAlerta = NIVEL_ALERTA) {
  const itens = (codigos || []).map(cod => porMunicipio?.[cod]).filter(Boolean);
  const casos = somarCampo(itens, 'casos_ano');
  const populacao = somarCampo(itens, 'pop');

  return {
    casos,
    casosEst: somarCampo(itens, 'casos_est_ano'),
    populacao,
    incidencia: incidenciaPor100k(casos, populacao),
    emAlerta: itens.filter(m => Number(m.nivel) >= nivelAlerta).length,
    municipios: itens.length
  };
}

/** Série semanal estadual restrita ao período, com rótulo "AAAA-Sww". */
export function montarSerieSemanal(porSemana, anoMin, anoMax) {
  return (porSemana || [])
    .filter(p => dentroDoPeriodo(anoDaSemana(p?.semana), anoMin, anoMax))
    .map(p => ({ ...p, rotulo: rotularSemana(p.semana) }));
}

/** Série anual da seleção: soma dos casos municipais por ano. */
export function serieAnualSelecao(porMunicipioAno, codigos, anoMin, anoMax) {
  const anos = new Set();
  (codigos || []).forEach(cod => {
    Object.keys(porMunicipioAno?.[cod] || {}).forEach(ano => anos.add(Number(ano)));
  });

  return [...anos]
    .filter(ano => Number.isFinite(ano) && dentroDoPeriodo(ano, anoMin, anoMax))
    .sort((a, b) => a - b)
    .map(ano => ({
      ano,
      casos: codigos.reduce((acc, cod) => acc + (Number(porMunicipioAno?.[cod]?.[ano]) || 0), 0)
    }));
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
      casos: m.casos_ano ?? null,
      casos_est: m.casos_est_ano ?? null,
      incidencia_100k: m.incidencia_100k ?? incidenciaPor100k(m.casos_ano, m.pop),
      nivel: m.nivel ?? null,
      populacao: m.pop ?? null
    };
  });
}

/**
 * Hook da aba: aplica o recorte territorial (regional, mesorregião ou
 * município) e o período aos dados de arboviroses.
 */
export function useArboviroses(dados, geoMap, filters) {
  const codigosSelecao = useFilteredMunicipios(geoMap, filters);

  return useMemo(() => {
    if (!dados) return VAZIO;

    const { anoMin, anoMax } = filters || {};
    const porMunicipio = dados.porMunicipio || {};
    const codigos = selecionarCodigos(porMunicipio, codigosSelecao);

    return {
      disponivel: true,
      selecaoAtiva: codigosSelecao.length > 0,
      anoReferencia: dados.anoReferencia ?? null,
      semanaUltima: dados.metadata?.semanaUltima || null,
      resumo: agregarSelecao(porMunicipio, codigos),
      serieSemanal: montarSerieSemanal(dados.porSemana, anoMin, anoMax),
      serieAnual: serieAnualSelecao(dados.porMunicipioAno, codigos, anoMin, anoMax),
      ranking: montarRanking(porMunicipio, codigos, geoMap),
      metadata: dados.metadata || null
    };
  }, [dados, geoMap, filters, codigosSelecao]);
}
