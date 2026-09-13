/**
 * Hook da aba "Internações SUS" (SIH/DATASUS, internações por município de
 * residência). Recorta a série estadual pelo intervalo de anos, soma os
 * municípios da seleção e monta KPIs, capítulos, mapa e ranking.
 *
 * O JSON não traz série anual por município: as séries são sempre
 * estaduais. KPIs, capítulos, mapa e ranking usam `porMunicipio`, que se
 * refere ao ano de referência (último ano completo).
 */

import { useMemo } from 'react';
import { useFilteredMunicipios } from './useData';
import {
  agregarCapitulos,
  capitulosOuPadrao,
  filtrarAnos,
  linhasMunicipios,
  somarCampo,
  taxaAgregada
} from './cidHelpers';

// Cor única das internações (water-600), a mesma da série "total" do núcleo.
export const COR_INTERNACOES = '#2d5f7f';

export function letalidade(obitos, internacoes) {
  const n = Number(internacoes);
  return n > 0 ? Number(((Number(obitos) || 0) / n * 100).toFixed(1)) : null;
}

// Último ano completo dentro do recorte; se só houver ano parcial, usa-o.
export function anoDosKpis(porAno, anoReferencia) {
  const completos = porAno.filter((l) => !l.parcial);
  const ultimo = completos[completos.length - 1] || porAno[porAno.length - 1];
  return ultimo ? ultimo.ano : anoReferencia;
}

export function kpisEstado(porAno, ano) {
  const linha = porAno.find((l) => l.ano === ano);
  if (!linha) return null;
  return {
    escopo: 'estado',
    ano,
    parcial: Boolean(linha.parcial),
    internacoes: Number(linha.internacoes) || 0,
    // Ano parcial: taxa anual não se aplica (sete meses sobre população cheia
    // pareceriam uma queda); fica nulo e o gráfico interrompe a linha.
    taxa: linha.parcial ? null : (linha.taxa ?? null),
    valorTotal: Number(linha.valor_total) || 0,
    obitos: Number(linha.obitos) || 0,
    letalidade: letalidade(linha.obitos, linha.internacoes)
  };
}

export function kpisSelecao(linhas, ano) {
  const internacoes = somarCampo(linhas, 'internacoes');
  const obitos = somarCampo(linhas, 'obitos');
  return {
    escopo: 'selecao',
    ano,
    parcial: false,
    internacoes,
    taxa: taxaAgregada(linhas, 'internacoes'),
    valorTotal: somarCampo(linhas, 'valor_total'),
    obitos,
    letalidade: letalidade(obitos, internacoes)
  };
}

export function useInternacoes(dados, filters, geoMap) {
  const codigos = useFilteredMunicipios(geoMap, filters);

  return useMemo(() => {
    if (!dados) return null;

    const { anoMin, anoMax } = filters || {};
    const porAnoTodos = Array.isArray(dados.porAno) ? dados.porAno : [];
    const porAno = filtrarAnos(porAnoTodos, anoMin, anoMax);
    const capitulos = capitulosOuPadrao(dados.capitulos);
    const anoReferencia = dados.anoReferencia ?? anoDosKpis(porAnoTodos, null);
    const temSelecao = codigos.length > 0;

    const porMunicipio = linhasMunicipios(dados.porMunicipio, geoMap, codigos)
      .map((linha) => ({ ...linha, letalidade: letalidade(linha.obitos, linha.internacoes) }));

    // Estado: último ano completo do recorte (responde ao clique no ano).
    // Seleção: só existe o ano de referência em porMunicipio.
    const anoKpi = temSelecao ? anoReferencia : anoDosKpis(porAno, anoReferencia);
    const kpis = temSelecao
      ? kpisSelecao(porMunicipio, anoReferencia)
      : kpisEstado(porAnoTodos, anoKpi);

    const linhaEstado = (dados.porAnoCapitulo || []).find((l) => l.ano === anoKpi);
    const usaSerieEstadual = !temSelecao && Boolean(linhaEstado);
    const porCapitulo = agregarCapitulos(
      usaSerieEstadual ? [linhaEstado] : porMunicipio,
      capitulos,
      10,
      COR_INTERNACOES
    );

    return {
      metadata: dados.metadata || null,
      capitulos,
      anoReferencia,
      anoParcial: dados.metadata?.anoParcial ?? null,
      ultimaCompetencia: dados.metadata?.ultimaCompetencia ?? null,
      porAno,
      temSelecao,
      kpis,
      anoCapitulos: usaSerieEstadual ? anoKpi : anoReferencia,
      porCapitulo,
      porMunicipio
    };
  }, [dados, filters, geoMap, codigos]);
}
