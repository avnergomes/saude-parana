/**
 * Funções puras compartilhadas pelos painéis de CID-10 (internações SIH e
 * óbitos SIM): recorte por ano, seleção de municípios, somas e agregação
 * por capítulo (top N + Outros). Nenhuma função altera a entrada.
 */

import { categoricalColor } from '../utils/chart-palette.js';

// Rótulos curtos (até 15 caracteres) para eixos e legendas. O nome completo
// do capítulo vem do próprio JSON (campo `capitulos`).
export const ROTULOS_CURTOS = {
  I: 'Infecciosas',
  II: 'Neoplasias',
  III: 'Sangue/imunes',
  IV: 'Endócrinas',
  V: 'Mentais',
  VI: 'Nervoso',
  VII: 'Olho',
  VIII: 'Ouvido',
  IX: 'Circulatórias',
  X: 'Respiratórias',
  XI: 'Digestivas',
  XII: 'Pele',
  XIII: 'Osteomuscular',
  XIV: 'Geniturinárias',
  XV: 'Gravidez/parto',
  XVI: 'Perinatais',
  XVII: 'Malformações',
  XVIII: 'Mal definidas',
  XIX: 'Lesões',
  XX: 'Causas externas',
  XXI: 'Fatores saúde',
  XXII: 'Especiais'
};

export const CODIGO_OUTROS = 'OUTROS';
export const NOME_OUTROS = 'Outros capítulos';
export const ROTULO_OUTROS = 'Outros';
// Base cinza (neutral-400) para a barra "Outros": só os capítulos nomeados
// recebem a cor de destaque.
export const COR_OUTROS = '#b6a682';

const LIMITE_ROTULO = 15;

export function rotuloCapitulo(codigo, nome = '') {
  if (ROTULOS_CURTOS[codigo]) return ROTULOS_CURTOS[codigo];
  const texto = String(nome || codigo || '');
  return texto.length > LIMITE_ROTULO ? `${texto.slice(0, LIMITE_ROTULO - 1)}.` : texto;
}

// Lista de capítulos do JSON ou, na falta dela, a lista padrão da CID-10.
export function capitulosOuPadrao(capitulos) {
  if (Array.isArray(capitulos) && capitulos.length > 0) return capitulos;
  return Object.entries(ROTULOS_CURTOS).map(([codigo, nome]) => ({ codigo, nome }));
}

// "2026-07" -> "07/2026" (mantém o texto original se o formato divergir)
export function competenciaBr(competencia) {
  const m = /^(\d{4})-(\d{2})$/.exec(String(competencia || ''));
  return m ? `${m[2]}/${m[1]}` : String(competencia || '');
}

export function filtrarAnos(porAno, anoMin, anoMax) {
  const linhas = Array.isArray(porAno) ? porAno : [];
  return linhas.filter(
    (linha) => (!anoMin || linha.ano >= anoMin) && (!anoMax || linha.ano <= anoMax)
  );
}

/**
 * Converte porMunicipio (objeto por código IBGE de 7 dígitos) em linhas com
 * nome e regional vindos do geoMap. `codigos` vazio significa todos.
 */
export function linhasMunicipios(porMunicipio, geoMap, codigos = []) {
  const info = geoMap?.municipioPorCodigo || {};
  const selecionados = codigos.length > 0 ? new Set(codigos.map(String)) : null;
  return Object.entries(porMunicipio || {})
    .filter(([codigo]) => !selecionados || selecionados.has(String(codigo)))
    .map(([codigo, valores]) => ({
      ...valores,
      cod_ibge: String(codigo),
      municipio: info[codigo]?.nome || String(codigo),
      regional: info[codigo]?.regional || '-'
    }));
}

export function somarCampo(linhas, campo) {
  return (linhas || []).reduce((soma, linha) => soma + (Number(linha?.[campo]) || 0), 0);
}

export function percentual(parte, total, casas = 1) {
  if (!total) return null;
  return Number(((parte / total) * 100).toFixed(casas));
}

/**
 * Taxa por 1.000 hab da seleção: soma do numerador dividida pela soma da
 * população implícita de cada município (numerador / taxa x 1.000).
 * Só entram municípios com taxa > 0 (numerador e denominador), como no
 * núcleo de mortalidade. Para um único município devolve a própria taxa.
 */
export function taxaAgregada(linhas, campoNumerador = 'internacoes') {
  const comTaxa = (linhas || []).filter((linha) => Number(linha?.taxa) > 0);
  const numerador = somarCampo(comTaxa, campoNumerador);
  const populacao = comTaxa.reduce(
    (soma, linha) => soma + ((Number(linha[campoNumerador]) || 0) / Number(linha.taxa)) * 1000,
    0
  );
  if (populacao <= 0) return null;
  return Number(((numerador / populacao) * 1000).toFixed(1));
}

/**
 * Soma cada capítulo sobre as linhas, ordena do maior para o menor e devolve
 * os `topN` maiores mais uma linha "Outros" (quando houver resto), cada um
 * com percentual sobre o total dos capítulos e a cor de destaque.
 */
export function agregarCapitulos(linhas, capitulos, topN = 10, cor = '#2d5f7f') {
  const somas = capitulosOuPadrao(capitulos)
    .map((c) => ({
      codigo: c.codigo,
      nome: c.nome,
      rotulo: rotuloCapitulo(c.codigo, c.nome),
      total: somarCampo(linhas, c.codigo)
    }))
    .filter((c) => c.total > 0)
    .sort((a, b) => b.total - a.total);

  const total = somarCampo(somas, 'total');
  const principais = somas.slice(0, topN);
  const outros = somarCampo(somas.slice(topN), 'total');
  const itens = outros > 0
    ? [...principais, { codigo: CODIGO_OUTROS, nome: NOME_OUTROS, rotulo: ROTULO_OUTROS, total: outros }]
    : principais;

  return itens.map((item) => ({
    ...item,
    percentual: percentual(item.total, total) ?? 0,
    cor: item.codigo === CODIGO_OUTROS ? COR_OUTROS : cor
  }));
}

/**
 * Os `n` maiores capítulos na linha estadual do ano de referência, com cor
 * categórica fixa pela posição (a cor segue o capítulo, não o recorte).
 */
export function topCapitulos(porAno, capitulos, anoReferencia, n = 5) {
  const linhas = Array.isArray(porAno) ? porAno : [];
  const linha = linhas.find((l) => l.ano === anoReferencia) || linhas[linhas.length - 1];
  if (!linha) return [];
  return capitulosOuPadrao(capitulos)
    .map((c) => ({
      codigo: c.codigo,
      nome: c.nome,
      rotulo: rotuloCapitulo(c.codigo, c.nome),
      total: Number(linha[c.codigo]) || 0
    }))
    .filter((c) => c.total > 0)
    .sort((a, b) => b.total - a.total)
    .slice(0, n)
    .map((c, i) => ({ ...c, cor: categoricalColor(i) }));
}

/**
 * Participação (%) de cada capítulo na seleção e no estado, ordenada pela
 * seleção: topN capítulos + "Outros", com diferença em pontos percentuais.
 */
export function participacaoCapitulos(selecao, estado, capitulos, topN = 10) {
  const lista = capitulosOuPadrao(capitulos);
  const porCapitulo = lista.map((c) => ({
    codigo: c.codigo,
    nome: c.nome,
    rotulo: rotuloCapitulo(c.codigo, c.nome),
    obitos: somarCampo(selecao, c.codigo),
    obitosEstado: somarCampo(estado, c.codigo)
  }));
  const totalSelecao = somarCampo(porCapitulo, 'obitos');
  const totalEstado = somarCampo(porCapitulo, 'obitosEstado');

  const ordenados = porCapitulo
    .filter((c) => c.obitos > 0 || c.obitosEstado > 0)
    .sort((a, b) => b.obitos - a.obitos);
  const principais = ordenados.slice(0, topN);
  const resto = ordenados.slice(topN);
  const linhas = resto.length > 0
    ? [...principais, {
        codigo: CODIGO_OUTROS,
        nome: NOME_OUTROS,
        rotulo: ROTULO_OUTROS,
        obitos: somarCampo(resto, 'obitos'),
        obitosEstado: somarCampo(resto, 'obitosEstado')
      }]
    : principais;

  return linhas.map((l) => {
    const pctSelecao = percentual(l.obitos, totalSelecao);
    const pctEstado = percentual(l.obitosEstado, totalEstado);
    const diferenca = pctSelecao != null && pctEstado != null
      ? Number((pctSelecao - pctEstado).toFixed(1))
      : null;
    return { ...l, pctSelecao, pctEstado, diferenca };
  });
}

/**
 * Variação entre os dois últimos anos completos (sem `parcial`) da série.
 * Devolve null quando não há dois anos comparáveis.
 */
export function variacaoUltimosAnos(porAno, campo) {
  const completos = (porAno || []).filter((l) => !l.parcial && Number.isFinite(Number(l?.[campo])));
  if (completos.length < 2) return null;
  const atual = completos[completos.length - 1];
  const anterior = completos[completos.length - 2];
  const valorAtual = Number(atual[campo]);
  const valorAnterior = Number(anterior[campo]);
  return {
    ano: atual.ano,
    anoAnterior: anterior.ano,
    atual: valorAtual,
    anterior: valorAnterior,
    variacao: valorAnterior > 0 ? Number((((valorAtual - valorAnterior) / valorAnterior) * 100).toFixed(1)) : null
  };
}
