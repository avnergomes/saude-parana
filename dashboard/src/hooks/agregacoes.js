/**
 * Funções puras de agregação compartilhadas pelas abas Rede de Saúde e
 * Financiamento. Nenhuma função altera os dados de entrada; todas toleram
 * valores nulos (linhas sem população, indicadores ausentes).
 */

function ehNumero(valor) {
  return typeof valor === 'number' && Number.isFinite(valor);
}

/**
 * Mantém apenas as linhas cujo cod_ibge está na lista. Lista vazia ou
 * ausente significa "todos" (mesma convenção de useFilteredMunicipios).
 */
export function filtrarPorCodigos(linhas, codigos) {
  if (!Array.isArray(linhas)) return [];
  if (!Array.isArray(codigos) || codigos.length === 0) return linhas;
  const permitidos = new Set(codigos.map(String));
  return linhas.filter((linha) => permitidos.has(String(linha?.cod_ibge)));
}

/** Soma de uma coluna numérica, ignorando nulos e não numéricos. */
export function somar(linhas, chave) {
  return (linhas || []).reduce(
    (acumulado, linha) => acumulado + (ehNumero(linha?.[chave]) ? linha[chave] : 0),
    0
  );
}

/** numerador / denominador * escala, ou null quando o denominador é inválido. */
export function razao(numerador, denominador, escala = 1) {
  if (!ehNumero(numerador) || !ehNumero(denominador) || denominador <= 0) return null;
  return (numerador / denominador) * escala;
}

/**
 * Razão de somas (equivale à média ponderada pela população das taxas
 * municipais), restrita às linhas com população válida para não inflar a
 * taxa com numeradores sem denominador.
 */
export function taxaPorPopulacao(linhas, chave, escala, populacaoDe) {
  let numerador = 0;
  let denominador = 0;
  (linhas || []).forEach((linha) => {
    const populacao = populacaoDe(linha);
    if (ehNumero(populacao) && populacao > 0 && ehNumero(linha?.[chave])) {
      numerador += linha[chave];
      denominador += populacao;
    }
  });
  return razao(numerador, denominador, escala);
}

/**
 * Média ponderada de pares { valor, peso }. Pares sem valor numérico são
 * ignorados. Se nenhum par tiver peso válido, cai para a média simples.
 * Retorna null quando não há valores.
 */
export function mediaPonderada(pares) {
  let somaPonderada = 0;
  let somaPesos = 0;
  let somaSimples = 0;
  let quantidade = 0;
  (pares || []).forEach(({ valor, peso }) => {
    if (!ehNumero(valor)) return;
    somaSimples += valor;
    quantidade += 1;
    if (ehNumero(peso) && peso > 0) {
      somaPonderada += valor * peso;
      somaPesos += peso;
    }
  });
  if (somaPesos > 0) return somaPonderada / somaPesos;
  return quantidade > 0 ? somaSimples / quantidade : null;
}

/**
 * Ano da lista mais próximo do alvo (empate: o mais antigo). Sem alvo,
 * devolve o ano mais recente. Retorna null para lista vazia.
 */
export function anoMaisProximo(anos, alvo) {
  const lista = (anos || []).map(Number).filter(Number.isFinite);
  if (lista.length === 0) return null;
  if (!ehNumero(alvo)) return Math.max(...lista);
  return lista.reduce((melhor, ano) => {
    const distancia = Math.abs(ano - alvo);
    const distanciaMelhor = Math.abs(melhor - alvo);
    if (distancia < distanciaMelhor) return ano;
    if (distancia === distanciaMelhor && ano < melhor) return ano;
    return melhor;
  });
}

/**
 * Linhas com maior e menor valor de uma chave (somente valores numéricos).
 * Retorna null com menos de duas linhas válidas: não há comparação a fazer.
 */
export function extremos(linhas, chave) {
  const validas = (linhas || []).filter((linha) => ehNumero(linha?.[chave]));
  if (validas.length < 2) return null;
  return validas.reduce(
    (acumulado, linha) => ({
      maior: linha[chave] > acumulado.maior[chave] ? linha : acumulado.maior,
      menor: linha[chave] < acumulado.menor[chave] ? linha : acumulado.menor
    }),
    { maior: validas[0], menor: validas[0] }
  );
}

/** Mapa cod_ibge (7 dígitos) -> população, a partir de porMunicipio do núcleo. */
export function populacaoPorCodigo(porMunicipio) {
  const mapa = {};
  (porMunicipio || []).forEach((municipio) => {
    if (ehNumero(municipio?.populacao) && municipio.populacao > 0) {
      mapa[String(municipio.cod_ibge)] = municipio.populacao;
    }
  });
  return mapa;
}

/** Número em pt-BR com casas fixas; '-' para nulos. */
export function formatDecimal(valor, casas = 1) {
  if (!ehNumero(valor)) return '-';
  return valor.toLocaleString('pt-BR', {
    minimumFractionDigits: casas,
    maximumFractionDigits: casas
  });
}
