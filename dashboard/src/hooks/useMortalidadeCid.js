/**
 * Hook do painel "Óbitos por capítulo CID-10" (SIM/DATASUS). Recorta a
 * série estadual pelo intervalo de anos e soma os municípios da seleção no
 * ano de referência para o ranking de capítulos e a participação (%).
 *
 * Não há série anual por município: a série dos cinco principais capítulos
 * é sempre estadual. A base do estado na comparação de participação é a
 * soma de todos os municípios de `porMunicipio`, para comparar com a mesma
 * régua da seleção.
 */

import { useMemo } from 'react';
import { useFilteredMunicipios } from './useData';
import { formatNumber } from '../utils/format';
import {
  agregarCapitulos,
  capitulosOuPadrao,
  filtrarAnos,
  linhasMunicipios,
  participacaoCapitulos,
  somarCampo,
  topCapitulos
} from './cidHelpers';

// Cor única dos óbitos (accent-500, argila), alinhada ao mapa ATLAS_CLAY.
export const COR_OBITOS = '#c0532e';

// Configuração de métricas para o TimeSeriesChart, uma entrada por capítulo.
export function metricConfigCapitulos(capitulos) {
  return Object.fromEntries(
    capitulos.map((c) => [c.codigo, { label: c.rotulo, color: c.cor, format: formatNumber }])
  );
}

export function useMortalidadeCid(dados, filters, geoMap) {
  const codigos = useFilteredMunicipios(geoMap, filters);

  return useMemo(() => {
    if (!dados) return null;

    const { anoMin, anoMax } = filters || {};
    const porAnoTodos = Array.isArray(dados.porAno) ? dados.porAno : [];
    const porAno = filtrarAnos(porAnoTodos, anoMin, anoMax);
    const capitulos = capitulosOuPadrao(dados.capitulos);
    const anoReferencia = dados.anoReferencia ?? porAnoTodos[porAnoTodos.length - 1]?.ano ?? null;
    const temSelecao = codigos.length > 0;

    const estado = linhasMunicipios(dados.porMunicipio, geoMap, []);
    const selecao = temSelecao ? linhasMunicipios(dados.porMunicipio, geoMap, codigos) : estado;

    const porCapitulo = agregarCapitulos(selecao, capitulos, 10, COR_OBITOS);
    const principais = topCapitulos(porAnoTodos, capitulos, anoReferencia, 5);
    const preliminares = Array.isArray(dados.metadata?.preliminares) ? dados.metadata.preliminares : [];
    const anosExibidos = new Set(porAno.map((l) => l.ano));

    return {
      metadata: dados.metadata || null,
      capitulos,
      anoReferencia,
      porAno,
      temSelecao,
      totalSelecao: somarCampo(selecao, 'total'),
      totalEstado: somarCampo(estado, 'total'),
      porCapitulo,
      principais,
      metricConfig: metricConfigCapitulos(principais),
      participacao: participacaoCapitulos(selecao, estado, capitulos, 10),
      preliminaresExibidos: preliminares.filter((ano) => anosExibidos.has(ano))
    };
  }, [dados, filters, geoMap, codigos]);
}
