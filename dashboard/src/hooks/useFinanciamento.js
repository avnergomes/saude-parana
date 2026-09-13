/**
 * Agregações da aba Financiamento (SIOPS: despesa com saúde por habitante,
 * percentual de receitas próprias aplicado em saúde, transferências SUS por
 * habitante). A série anual é sempre estadual; o recorte territorial vale
 * para KPIs, mapas e ranking, no ano de referência do arquivo.
 */

import { useMemo } from 'react';
import { useFilteredMunicipios } from './useData';
import { mediaPonderada, extremos, populacaoPorCodigo } from './agregacoes';

export const INDICADORES = ['despesa_saude_hab', 'pct_receita_propria', 'transf_sus_hab'];

// Mínimo constitucional de aplicação de receitas próprias em saúde (EC 29 / LC 141).
export const MINIMO_EC29 = 15;

const RESULTADO_VAZIO = {
  disponivel: false,
  rows: [],
  serie: [],
  kpis: {},
  temSelecao: false,
  destaques: null,
  anoReferencia: null
};

function numeroOuNulo(valor) {
  return typeof valor === 'number' && Number.isFinite(valor) ? valor : null;
}

/** "R$ 1.234" (casas configuráveis); '-' para nulos. */
export function formatReais(valor, casas = 0) {
  if (typeof valor !== 'number' || !Number.isFinite(valor)) return '-';
  return 'R$ ' + valor.toLocaleString('pt-BR', {
    minimumFractionDigits: casas,
    maximumFractionDigits: casas
  });
}

/**
 * Converte porMunicipio (objeto indexado por cod_ibge) em linhas com nome e
 * regional vindos do geoMap, mantendo só os códigos do recorte.
 */
export function linhasMunicipios(porMunicipio, geoMap, codigos) {
  if (!porMunicipio || typeof porMunicipio !== 'object') return [];
  const permitidos = Array.isArray(codigos) && codigos.length > 0
    ? new Set(codigos.map(String))
    : null;
  return Object.entries(porMunicipio)
    .filter(([codigo]) => !permitidos || permitidos.has(String(codigo)))
    .map(([codigo, valores]) => {
      const info = geoMap?.municipioPorCodigo?.[codigo] || {};
      return {
        cod_ibge: String(codigo),
        municipio: info.nome || valores?.municipio || String(codigo),
        regional: info.regional || valores?.regional || '',
        ano: numeroOuNulo(valores?.ano),
        despesa_saude_hab: numeroOuNulo(valores?.despesa_saude_hab),
        pct_receita_propria: numeroOuNulo(valores?.pct_receita_propria),
        transf_sus_hab: numeroOuNulo(valores?.transf_sus_hab)
      };
    });
}

/** Série anual dentro do intervalo do filtro, em ordem cronológica. */
export function filtrarAnos(porAno, anoMin, anoMax) {
  return (porAno || [])
    .filter((item) => {
      const ano = Number(item?.ano);
      if (!Number.isFinite(ano)) return false;
      if (anoMin && ano < anoMin) return false;
      if (anoMax && ano > anoMax) return false;
      return true;
    })
    .slice()
    .sort((a, b) => a.ano - b.ano);
}

/** Quantos municípios do recorte aplicaram menos que o mínimo constitucional. */
export function contarAbaixoMinimo(linhas, minimo = MINIMO_EC29) {
  return (linhas || []).filter(
    (linha) => Number.isFinite(linha?.pct_receita_propria) && linha.pct_receita_propria < minimo
  ).length;
}

/** KPIs do recorte: média (ponderada pela população quando disponível) do ano de referência. */
export function kpisSelecao(linhas, populacao, anoReferencia) {
  const pesoDe = (linha) => populacao?.[linha.cod_ibge];
  const media = (chave) => mediaPonderada(
    linhas.map((linha) => ({ valor: linha[chave], peso: pesoDe(linha) }))
  );
  return {
    despesaHab: media('despesa_saude_hab'),
    pctReceitaPropria: media('pct_receita_propria'),
    transfSusHab: media('transf_sus_hab'),
    ano: linhas.find((linha) => linha.ano != null)?.ano ?? anoReferencia,
    ponderado: linhas.some((linha) => pesoDe(linha) > 0),
    escopo: 'selecao'
  };
}

/** KPIs estaduais: último ano da série filtrada. */
export function kpisEstado(serie, anoReferencia) {
  const ultimo = serie.length > 0 ? serie[serie.length - 1] : null;
  return {
    despesaHab: numeroOuNulo(ultimo?.despesa_saude_hab),
    pctReceitaPropria: numeroOuNulo(ultimo?.pct_receita_propria),
    transfSusHab: numeroOuNulo(ultimo?.transf_sus_hab),
    ano: ultimo?.ano ?? anoReferencia,
    ponderado: false,
    escopo: 'estado'
  };
}

export function useFinanciamento(dados, geoMap, filters, mortalidade) {
  const codigos = useFilteredMunicipios(geoMap, filters);

  const populacao = useMemo(
    () => populacaoPorCodigo(mortalidade?.porMunicipio),
    [mortalidade]
  );

  return useMemo(() => {
    if (!dados) return RESULTADO_VAZIO;

    const anoReferencia = numeroOuNulo(dados.anoReferencia);
    const serie = filtrarAnos(dados.porAno, filters?.anoMin, filters?.anoMax);
    const rows = linhasMunicipios(dados.porMunicipio, geoMap, codigos);
    const temSelecao = codigos.length > 0;
    const base = temSelecao
      ? kpisSelecao(rows, populacao, anoReferencia)
      : kpisEstado(serie, anoReferencia);

    return {
      disponivel: true,
      rows,
      serie,
      kpis: {
        ...base,
        abaixoMinimo: contarAbaixoMinimo(rows),
        municipios: rows.length
      },
      temSelecao,
      destaques: extremos(rows, 'despesa_saude_hab'),
      anoReferencia
    };
  }, [dados, geoMap, codigos, filters, populacao]);
}
