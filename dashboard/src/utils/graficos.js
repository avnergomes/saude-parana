// Helpers puros dos gráficos (testados em graficos.test.js com node --test).

// Sufixo da série tracejada do ano parcial (ex.: 'internacoes__parcial')
export const SUFIXO_PARCIAL = '__parcial';

// Eixo em pt-BR ("900 mil", "1,1 mi"), coerente com o tooltip
export function formatarEixo(valor) {
  const abs = Math.abs(valor);
  // 2 casas: passos de 2,5 (1.250 -> "1,25 mil") não podem virar "1,3 mil"
  const fmt = (v) => v.toLocaleString('pt-BR', { maximumFractionDigits: 2 });
  if (abs >= 1e6) return `${fmt(valor / 1e6)} mi`;
  if (abs >= 1e3) return `${fmt(valor / 1e3)} mil`;
  return fmt(valor);
}

// Ano parcial (linha com parcial: true) sai da linha cheia e vira um trecho
// tracejado a partir do último ano completo: antes o ano incompleto aparecia
// como queda abrupta no mesmo traço.
export function separarParcial(data, metrics) {
  const temParcial = data.some((linha) => linha?.parcial);
  if (!temParcial) return { dados: data, parciais: [] };
  const ultimoCompleto = data.reduce((idx, linha, i) => (linha?.parcial ? idx : i), -1);
  const dados = data.map((linha, i) => {
    const nova = { ...linha };
    metrics.forEach((m) => {
      const ponte = i === ultimoCompleto || linha?.parcial;
      nova[m + SUFIXO_PARCIAL] = ponte ? linha[m] : null;
      if (linha?.parcial) nova[m] = null;
    });
    return nova;
  });
  const parciais = metrics.filter((m) => dados.some((l) => l.parcial && l[m + SUFIXO_PARCIAL] != null));
  return { dados, parciais };
}

// Teto "redondo" para eixos (1, 2, 2,5 ou 5 vezes uma potência de 10)
export function tetoRedondo(valor) {
  if (!(valor > 0)) return 1;
  const potencia = 10 ** Math.floor(Math.log10(valor));
  const passo = [1, 2, 2.5, 5, 10].find((m) => m * potencia >= valor);
  return passo * potencia;
}

// Domínio [0, teto] e marcas redondas (ex.: 0, 5, 10, 15, 20, 25 mil): o
// automático do Recharts gerava "6K 11K 17K 22K"
export function marcasEixo(maximo) {
  // passo redondo para ~5 divisões e teto no múltiplo seguinte do passo
  // (35 mil -> 0..40 mil, não 0..50 mil com 30% vazio)
  const passo = tetoRedondo((maximo > 0 ? maximo : 1) / 5);
  const divisoes = Math.max(1, Math.ceil(maximo / passo - 1e-9));
  const marcas = Array.from({ length: divisoes + 1 }, (_, i) => Number((i * passo).toPrecision(12)));
  return { teto: marcas[marcas.length - 1], marcas };
}

// Limites das classes de um mapa coroplético (n classes -> até n+1 limites)
// e a contagem de valores por classe.
// Intervalos iguais, salvo quando eles concentram mais da metade dos
// municípios numa só classe (cauda longa à direita, como a dengue com um
// município em 12.718/100 mil, ou à esquerda, como a cobertura da APS presa
// em 100%): aí quantis. Nos quantis, se o mínimo se repete muito (ex.: zero
// leito SUS), ele ganha classe própria em vez de dividir cor com quem tem.
export function limitesClasses(valores, n) {
  const v = valores.filter((x) => Number.isFinite(x)).sort((a, b) => a - b);
  if (v.length === 0) return { limites: [0, 100], tipo: 'iguais', contagem: [0] };
  const min = v[0];
  const max = v[v.length - 1];
  if (min === max) return { limites: [min, max], tipo: 'iguais', contagem: [v.length] };
  const contar = (limites) => {
    const contagem = Array(limites.length - 1).fill(0);
    v.forEach((x) => { contagem[classeDoValor(x, limites)] += 1; });
    return contagem;
  };
  const iguais = Array.from({ length: n + 1 }, (_, i) => min + ((max - min) * i) / n);
  const contagemIguais = contar(iguais);
  if (Math.max(...contagemIguais) <= v.length / 2) {
    return { limites: iguais, tipo: 'iguais', contagem: contagemIguais };
  }
  const quantil = (lista, q) => {
    const pos = (lista.length - 1) * q;
    const i = Math.floor(pos);
    return lista[i] + (lista[Math.min(i + 1, lista.length - 1)] - lista[i]) * (pos - i);
  };
  // Mínimo/máximo que ocupam ao menos uma classe inteira de quantil (zero
  // leito; 100% de cobertura) viram classes próprias [min, min] / [max, max];
  // o meio é dividido em quantis só pelos limites internos
  const isolaMin = quantil(v, 1 / n) === min;
  const isolaMax = quantil(v, 1 - 1 / n) === max;
  const meio = v.filter((x) => (!isolaMin || x > min) && (!isolaMax || x < max));
  const k = Math.max(1, n - (isolaMin ? 1 : 0) - (isolaMax ? 1 : 0));
  const internos = meio.length > 1
    ? Array.from({ length: k - 1 }, (_, i) => quantil(meio, (i + 1) / k))
    : [];
  const limites = [...new Set([
    min,
    ...(isolaMin ? [min] : []),
    ...internos.filter((x) => x > min && x < max),
    ...(isolaMax ? [max] : []),
    max
  ])];
  // Set não deixa repetir: recoloca a classe degenerada do mínimo/máximo
  if (isolaMin) limites.splice(1, 0, min);
  if (isolaMax) limites.push(max);
  return { limites, tipo: 'quantis', contagem: contar(limites) };
}

// Índice da classe de um valor dados os limites (último intervalo fechado)
export function classeDoValor(valor, limites) {
  const classes = limites.length - 1;
  if (classes <= 1) return 0;
  // classes degeneradas: [min, min] no início e [max, max] no fim
  if (limites[0] === limites[1] && valor <= limites[0]) return 0;
  if (limites[classes - 1] === limites[classes] && valor >= limites[classes]) return classes - 1;
  for (let i = 1; i < classes; i++) if (valor < limites[i]) return i - 1;
  return classes - 1;
}

// Cores espaçadas pela rampa quando há menos classes que cores
export function corDaClasse(classe, totalClasses, cores) {
  if (totalClasses <= 1) return cores[Math.floor(cores.length / 2)];
  return cores[Math.round((classe * (cores.length - 1)) / (totalClasses - 1))];
}
