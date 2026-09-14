/**
 * Agregações do painel Empresas de saúde no CNPJ (Receita Federal, Dados
 * Abertos do CNPJ) para o recorte atual de regional, mesorregião ou
 * município. O arquivo é a fotografia de uma competência: o filtro de ano
 * só recorta a série estadual de aberturas por ano de início de atividade.
 */

import { useMemo } from 'react';
import { useFilteredMunicipios } from './useData';
import { filtrarPorCodigos, somar, taxaPorPopulacao } from './agregacoes';

// Classes CNAE do ETL (colunas de porMunicipio), na ordem do arquivo; usadas
// como fallback quando cnpj.grupos não traz nomes.
export const GRUPOS_CNAE = [
  'hospitais',
  'urgencia_remocao',
  'clinicas_consultorios',
  'diagnostico',
  'profissionais_saude',
  'apoio_gestao',
  'outras_saude',
  'farmacias'
];

// Rótulos curtos para o eixo do gráfico de barras (o eixo trunca nomes
// longos). O nome completo do grupo, com o código CNAE, fica em `descricao`.
export const ROTULOS_CURTOS = {
  hospitais: 'Hospitais',
  urgencia_remocao: 'Urgência móvel e remoção',
  clinicas_consultorios: 'Clínicas e consultórios',
  diagnostico: 'Diagnóstico e terapia',
  profissionais_saude: 'Outros profissionais de saúde',
  apoio_gestao: 'Apoio à gestão de saúde',
  outras_saude: 'Outras atividades de saúde',
  farmacias: 'Farmácias e drogarias'
};

// Um único tom para as barras de classe (uma série, uma cor).
export const COR_BARRAS_GRUPO = '#3d729c';

const ESCALA_10MIL = 10000;

/** Índice cod_ibge (7 dígitos) -> { municipio, regional }, a partir do geo_map. */
export function indiceMunicipios(geoMap) {
  const indice = {};
  Object.entries(geoMap?.municipiosPorRegional || {}).forEach(([regional, lista]) => {
    (lista || []).forEach((municipio) => {
      indice[String(municipio.cod_ibge)] = { municipio: municipio.nome, regional };
    });
  });
  return indice;
}

/** porMunicipio (objeto por código IBGE) -> linhas com cod_ibge, nome e regional. */
export function montarLinhas(porMunicipio, geoMap) {
  const indice = indiceMunicipios(geoMap);
  return Object.entries(porMunicipio || {}).map(([codigo, valores]) => ({
    ...valores,
    cod_ibge: codigo,
    municipio: indice[codigo]?.municipio || codigo,
    regional: indice[codigo]?.regional || null
  }));
}

/** Totais por classe CNAE no recorte, ordenados, sem zeros. */
export function agregarGrupos(linhas, grupos) {
  const lista = Array.isArray(grupos) && grupos.length > 0
    ? grupos
    : GRUPOS_CNAE.map((codigo) => ({ codigo, nome: codigo }));
  const somas = lista.map((grupo) => ({
    codigo: grupo.codigo,
    nome: ROTULOS_CURTOS[grupo.codigo] || grupo.nome || grupo.codigo,
    descricao: grupo.nome || grupo.codigo,
    total: somar(linhas, grupo.codigo)
  }));
  const totalGeral = somas.reduce((acumulado, grupo) => acumulado + grupo.total, 0);
  return somas
    .filter((grupo) => grupo.total > 0)
    .map((grupo) => ({
      ...grupo,
      cor: COR_BARRAS_GRUPO,
      percentual: totalGeral > 0
        ? ((grupo.total / totalGeral) * 100).toLocaleString('pt-BR', { maximumFractionDigits: 1 })
        : null
    }))
    .sort((a, b) => b.total - a.total);
}

/** Ano da competência ("AAAA-MM") ou, na falta dela, o ano corrente. */
export function anoCompetencia(metadata) {
  const ano = Number(String(metadata?.competencia || '').slice(0, 4));
  return Number.isFinite(ano) && ano > 0 ? ano : new Date().getFullYear();
}

/** Aberturas estaduais do último ano completo (o anterior ao da competência). */
export function aberturasUltimoAnoCompleto(aberturasPorAno, anoReferencia) {
  const anteriores = (aberturasPorAno || []).filter(
    (item) => Number.isFinite(item?.ano) && item.ano < anoReferencia
  );
  if (anteriores.length === 0) return null;
  const ultimo = anteriores.reduce((melhor, item) => (item.ano > melhor.ano ? item : melhor));
  return { ano: ultimo.ano, total: Number.isFinite(ultimo.total) ? ultimo.total : null };
}

/** Série estadual restrita aos anos do filtro. */
export function filtrarAnos(serie, anoMin, anoMax) {
  return (serie || []).filter((item) => {
    const ano = Number(item?.ano);
    if (!Number.isFinite(ano)) return false;
    if (anoMin && ano < anoMin) return false;
    if (anoMax && ano > anoMax) return false;
    return true;
  });
}

function temSelecaoTerritorial(filters) {
  return Boolean(filters?.municipioCodigo || filters?.regional || filters?.mesorregiao);
}

/**
 * Retorna null quando o JSON do CNPJ não foi carregado; caso contrário
 * { metadata, kpis, porGrupo, mapa, serie, ranking, temSelecao }.
 */
export function useCnpjSaude(cnpj, geoMap, filters) {
  const codigos = useFilteredMunicipios(geoMap, filters);

  return useMemo(() => {
    if (!cnpj) return null;

    const rows = filtrarPorCodigos(montarLinhas(cnpj.porMunicipio, geoMap), codigos);
    const populacaoDe = (linha) => linha.populacao;
    const kpis = {
      ativos: somar(rows, 'ativos'),
      inativos: somar(rows, 'inativos'),
      farmacias: somar(rows, 'farmacias'),
      saudeSecundaria: somar(rows, 'saude_secundaria'),
      populacao: somar(rows, 'populacao'),
      ativosPor10mil: taxaPorPopulacao(rows, 'ativos', ESCALA_10MIL, populacaoDe),
      aberturas: aberturasUltimoAnoCompleto(cnpj.aberturasPorAno, anoCompetencia(cnpj.metadata)),
      municipios: rows.length
    };

    return {
      metadata: cnpj.metadata,
      kpis,
      porGrupo: agregarGrupos(rows, cnpj.grupos),
      mapa: rows.map((linha) => ({
        cod_ibge: linha.cod_ibge,
        municipio: linha.municipio,
        ativos: linha.ativos,
        ativos_por_10mil: Number.isFinite(linha.ativos_por_10mil) ? linha.ativos_por_10mil : null
      })),
      serie: filtrarAnos(cnpj.aberturasPorAno, filters?.anoMin, filters?.anoMax),
      ranking: rows,
      temSelecao: temSelecaoTerritorial(filters)
    };
  }, [cnpj, geoMap, codigos, filters]);
}
