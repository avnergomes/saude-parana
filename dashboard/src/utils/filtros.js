// Regras puras dos filtros e da navegação (testadas em filtros.test.js com
// `node --test`). Os componentes só ligam estas funções aos eventos.

// Estado inicial dos filtros (também usado pelo "Limpar"). anoMax = ano
// corrente: os domínios DATASUS/APS/InfoDengue chegam ao ano em curso.
export function filtrosIniciais() {
  return {
    anoMin: 2010,
    anoMax: new Date().getFullYear(),
    regional: null,
    mesorregiao: null,
    municipio: null,
    municipioCodigo: null
  };
}

export function periodoAlterado(filters) {
  const iniciais = filtrosIniciais();
  return filters.anoMin !== iniciais.anoMin || filters.anoMax !== iniciais.anoMax;
}

// municipio: objeto {cod_ibge, nome}, string ou null ("Todos"). Clicar no já
// selecionado desmarca nome E código (antes o código ficava e prendia o filtro).
export function aplicarMunicipio(filters, municipio) {
  const codIbge = municipio && typeof municipio === 'object' ? municipio.cod_ibge : null;
  const nome = municipio && typeof municipio === 'object' ? municipio.nome : municipio;
  const desmarcar = !nome || nome === filters.municipio;
  return {
    ...filters,
    municipio: desmarcar ? null : nome,
    municipioCodigo: desmarcar ? null : codIbge
  };
}

// Regional e mesorregião são recortes alternativos: um limpa o outro.
export function aplicarRegional(filters, regional) {
  return {
    ...filters,
    regional: regional === filters.regional ? null : regional,
    mesorregiao: null,
    municipio: null,
    municipioCodigo: null
  };
}

export function aplicarMesorregiao(filters, mesorregiao) {
  return {
    ...filters,
    mesorregiao: mesorregiao === filters.mesorregiao ? null : mesorregiao,
    regional: null,
    municipio: null,
    municipioCodigo: null
  };
}

const CAMPOS_TERRITORIO = ['regional', 'mesorregiao', 'municipioCodigo'];
const CAMPOS_PERIODO = ['anoMin', 'anoMax'];
const mudou = (a, b, campos) => campos.some(c => a[c] !== b[c]);

// Os cliques nos gráficos têm precedência sobre os menus. Sem limpar o clique
// correspondente, mudar território ou período no menu não mudava nada.
export function interativosAposMenu(antes, novos, interativos) {
  const limpaMunicipio = Boolean(interativos.municipioCodigo) && mudou(antes, novos, CAMPOS_TERRITORIO);
  const limpaAno = Boolean(interativos.ano) && mudou(antes, novos, CAMPOS_PERIODO);
  if (!limpaMunicipio && !limpaAno) return interativos;
  return {
    ...interativos,
    ...(limpaMunicipio && { municipio: null, municipioCodigo: null }),
    ...(limpaAno && { ano: null })
  };
}

// Código de 6 dígitos (mapa) -> 7 dígitos (dados) e nome do município.
export function resolverMunicipio(codIbge, nomeInformado, municipioPorCodigo = {}) {
  const cod = String(codIbge || '');
  if (!cod) return null;
  const codigo = cod.length >= 7
    ? cod
    : Object.keys(municipioPorCodigo).find(c => c.startsWith(cod)) || cod;
  return { codigo, nome: municipioPorCodigo[codigo]?.nome || nomeInformado || codigo };
}

// Página pedida limitada ao total (um filtro pode encolher os dados).
export function paginaValida(pedida, totalLinhas, tamanhoPagina) {
  const totalPaginas = Math.ceil(totalLinhas / tamanhoPagina);
  return Math.min(Math.max(0, pedida), Math.max(0, totalPaginas - 1));
}

// Identifica o conjunto de linhas de um ranking (quais municípios), para
// voltar à primeira página quando o recorte muda.
export function assinaturaLinhas(linhas) {
  if (!Array.isArray(linhas)) return '';
  return linhas.map(l => l?.cod_ibge ?? l?.id ?? l?.codigo ?? '').join(',');
}

// Códigos IBGE do recorte; lista vazia significa "todos". O município vale
// mesmo sem geo_map (o clique resolve o código pela mortalidade).
export function codigosFiltrados(geoMap, filters) {
  const { regional, mesorregiao, municipioCodigo } = filters || {};
  if (municipioCodigo) return [String(municipioCodigo)];
  if (!geoMap) return [];
  if (regional && geoMap.municipiosPorRegional?.[regional]) {
    return geoMap.municipiosPorRegional[regional].map(m => m.cod_ibge);
  }
  if (mesorregiao && geoMap.municipiosPorMesorregiao?.[mesorregiao]) {
    return geoMap.municipiosPorMesorregiao[mesorregiao].map(m => m.cod_ibge);
  }
  return [];
}

/**
 * Linhas municipais de um ano: reaproveita a linha base (nome, regional) e
 * troca óbitos, população e taxa pelos de porMunicipioAno. Sem ano no recorte
 * (ex.: 2026, fora do IBGE) os valores ficam nulos, nunca os de outro ano.
 */
export function linhasDoAno(base, porMunicipioAno, ano) {
  const anoBase = base[0]?.ano;
  if (ano === anoBase || !porMunicipioAno) return base;
  return base
    .map((linha) => {
      const dado = ano == null ? null : porMunicipioAno[linha.cod_ibge]?.[ano];
      const obitos = dado?.obitos ?? null;
      const populacao = dado?.populacao ?? null;
      const taxa = obitos != null && populacao > 0 ? Number((obitos / populacao * 1000).toFixed(2)) : null;
      return { ...linha, ano, obitos, populacao, taxa };
    })
    .sort((a, b) => (b.obitos ?? -1) - (a.obitos ?? -1));
}

// Sufixo " (2024)" para títulos que dependem do ano de referência
export const sufixoAno = (ano) => (ano ? ` (${ano})` : '');

// Aba a partir do hash da URL. Ids ASCII: sem decodeURIComponent, que lança
// URIError com hash malformado.
export function abaDoHash(hash, abas, padrao) {
  const id = String(hash || '').replace(/^#/, '');
  return abas.has(id) ? id : padrao;
}
