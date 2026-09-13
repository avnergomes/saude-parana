/**
 * Agregações da aba Rede de Saúde (CNES: estabelecimentos e leitos; ANS:
 * cobertura de planos) para o recorte atual de regional, mesorregião ou
 * município. O CNES é uma fotografia (competência única): o filtro de ano
 * só se aplica aos planos de saúde.
 */

import { useMemo } from 'react';
import { useFilteredMunicipios } from './useData';
import {
  filtrarPorCodigos,
  somar,
  taxaPorPopulacao,
  mediaPonderada,
  anoMaisProximo,
  extremos,
  populacaoPorCodigo
} from './agregacoes';

// Famílias de estabelecimento do ETL (colunas de porMunicipio), na ordem do
// arquivo; usadas como fallback quando dados.tipos não traz nomes.
export const GRUPOS_TIPO = [
  'ubs',
  'hospital',
  'pronto_atendimento',
  'atencao_psicossocial',
  'clinica_consultorio',
  'diagnostico',
  'farmacia',
  'vigilancia_gestao',
  'outros'
];

// Limite de pontos no mapa (hospitais e UPAs), para manter o Leaflet leve.
export const MAX_PONTOS = 800;

// Um único tom para as barras de tipos (uma série, uma cor).
export const COR_BARRAS_TIPO = '#3d729c';

const RESULTADO_VAZIO = {
  disponivel: false,
  rows: [],
  tipos: [],
  pontos: [],
  totalPontos: 0,
  kpis: {},
  seriePlanos: [],
  anoPlanos: null,
  destaques: null
};

/** Totais por família de estabelecimento no recorte, ordenados, sem zeros. */
export function agregarTipos(linhas, tipos) {
  const lista = Array.isArray(tipos) && tipos.length > 0
    ? tipos
    : GRUPOS_TIPO.map((codigo) => ({ codigo, nome: codigo }));
  const somas = lista.map((tipo) => ({
    codigo: tipo.codigo,
    nome: tipo.nome || tipo.codigo,
    total: somar(linhas, tipo.codigo)
  }));
  const totalGeral = somas.reduce((acumulado, tipo) => acumulado + tipo.total, 0);
  return somas
    .filter((tipo) => tipo.total > 0)
    .map((tipo) => ({
      ...tipo,
      cor: COR_BARRAS_TIPO,
      percentual: totalGeral > 0
        ? ((tipo.total / totalGeral) * 100).toLocaleString('pt-BR', { maximumFractionDigits: 1 })
        : null
    }))
    .sort((a, b) => b.total - a.total);
}

/** Pontos válidos do recorte, maiores unidades primeiro, limitados a MAX_PONTOS. */
export function selecionarPontos(pontos, codigos, limite = MAX_PONTOS) {
  const validos = filtrarPorCodigos(pontos, codigos).filter(
    (ponto) => Number.isFinite(ponto?.lat) && Number.isFinite(ponto?.lon)
  );
  const ordenados = [...validos].sort((a, b) => (b.leitos || 0) - (a.leitos || 0));
  return { pontos: ordenados.slice(0, limite), totalPontos: validos.length };
}

/** Ano de porMunicipioAno mais próximo do alvo (união dos anos de todos os municípios). */
export function anoPlanosDisponivel(planos, alvo) {
  const porAno = planos?.porMunicipioAno;
  if (!porAno || typeof porAno !== 'object') return null;
  const anos = new Set();
  Object.values(porAno).forEach((serie) => {
    Object.keys(serie || {}).forEach((ano) => anos.add(ano));
  });
  return anoMaisProximo([...anos], alvo);
}

/** Taxa de cobertura de um município no ano pedido (ou o mais próximo), com fallback para a taxa atual. */
export function coberturaMunicipio(planos, codigo, ano) {
  const serie = planos?.porMunicipioAno?.[codigo];
  if (serie && ano != null) {
    const anoUsado = serie[ano] !== undefined ? ano : anoMaisProximo(Object.keys(serie), ano);
    const valor = anoUsado != null ? serie[anoUsado] : null;
    if (Number.isFinite(valor)) return valor;
  }
  const atual = planos?.porMunicipio?.[codigo];
  return Number.isFinite(atual?.taxa_cobertura) ? atual.taxa_cobertura : null;
}

/** Série estadual da ANS restrita aos anos do filtro (periodo "AAAA-MM"). */
export function filtrarPeriodos(porPeriodo, anoMin, anoMax) {
  return (porPeriodo || []).filter((item) => {
    const ano = Number(String(item?.periodo || '').slice(0, 4));
    if (!Number.isFinite(ano)) return false;
    if (anoMin && ano < anoMin) return false;
    if (anoMax && ano > anoMax) return false;
    return true;
  });
}

export function useRedeSaude(dados, planos, geoMap, filters, mortalidade) {
  const codigos = useFilteredMunicipios(geoMap, filters);

  // População do núcleo (IBGE) como reserva para linhas do CNES sem população.
  const populacaoReserva = useMemo(
    () => populacaoPorCodigo(mortalidade?.porMunicipio),
    [mortalidade]
  );

  return useMemo(() => {
    if (!dados) return RESULTADO_VAZIO;

    const anoPlanos = planos ? anoPlanosDisponivel(planos, filters?.anoMax ?? null) : null;

    const rows = filtrarPorCodigos(dados.porMunicipio, codigos).map((linha) => {
      const codigo = String(linha.cod_ibge);
      const populacao = linha.populacao > 0
        ? linha.populacao
        : (planos?.porMunicipio?.[codigo]?.populacao || populacaoReserva[codigo] || null);
      return {
        ...linha,
        populacao,
        cobertura_planos: planos ? coberturaMunicipio(planos, codigo, anoPlanos) : null
      };
    });

    const populacaoDe = (linha) => linha.populacao;
    const kpis = {
      estabelecimentos: somar(rows, 'total'),
      sus: somar(rows, 'sus'),
      leitosTotal: somar(rows, 'leitos_total'),
      leitosSus: somar(rows, 'leitos_sus'),
      leitosSusPorMil: taxaPorPopulacao(rows, 'leitos_sus', 1000, populacaoDe),
      estabPor10mil: taxaPorPopulacao(rows, 'total', 10000, populacaoDe),
      coberturaPlanos: planos
        ? mediaPonderada(rows.map((linha) => ({ valor: linha.cobertura_planos, peso: linha.populacao })))
        : null,
      populacao: somar(rows, 'populacao'),
      municipios: rows.length
    };

    const { pontos, totalPontos } = selecionarPontos(dados.pontos, codigos);

    return {
      disponivel: true,
      rows,
      tipos: agregarTipos(rows, dados.tipos),
      pontos,
      totalPontos,
      kpis,
      seriePlanos: filtrarPeriodos(planos?.porPeriodo, filters?.anoMin, filters?.anoMax),
      anoPlanos,
      destaques: extremos(rows, 'leitos_sus_por_mil')
    };
  }, [dados, planos, codigos, filters, populacaoReserva]);
}
