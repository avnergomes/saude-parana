/**
 * Hooks de carregamento e filtragem de dados
 * Padrão DataGeo Paraná - Módulo Saúde
 * Suporta filtragem por ano, regional, mesorregião e município
 */

import { useState, useEffect, useMemo, useCallback } from 'react';
import { feature } from 'topojson-client';

const BASE_PATH = import.meta.env.BASE_URL || '/saude-parana/';
// Malha municipal: primeiro a versão reduzida self-hosted (~749 KB); em
// qualquer falha, cai para a malha completa no CDN (jsdelivr, ~4,4 MB).
// Ambas expõem as mesmas propriedades e o object key 'municipalities'.
const TOPO_URL = 'https://datageoparana.github.io/assets/parana-municipalities.min.topojson';
const TOPO_URL_FALLBACK = 'https://cdn.jsdelivr.net/gh/datageoparana/datageoparana.github.io@main/assets/parana-municipalities.topojson';

/**
 * Busca o TopoJSON da malha municipal tentando primeiro a fonte primária
 * (self-hosted) e, em qualquer falha (rede ou HTTP não-OK), a fonte de
 * fallback (CDN) antes de propagar o erro. Retorna a Response já validada
 * (res.ok), mantendo a mesma semântica de erro do fetch original.
 */
async function fetchTopo() {
  try {
    const res = await fetch(TOPO_URL);
    if (res.ok) return res;
    throw new Error(`HTTP ${res.status}`);
  } catch (primaryErr) {
    const res = await fetch(TOPO_URL_FALLBACK);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res;
  }
}

/**
 * Hook principal de carregamento de dados
 */
export function useData() {
  // Somente dados reais (IBGE Registro Civil + Estimativas de População).
  // Os domínios sintéticos (internações, vacinação, estabelecimentos,
  // repasses, Previne) foram removidos até existir ingestão real do DATASUS.
  const [mortalidade, setMortalidade] = useState(null);
  const [geoData, setGeoData] = useState(null);
  const [geoMap, setGeoMap] = useState(null);
  const [metadata, setMetadata] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [geoError, setGeoError] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [geoReloadKey, setGeoReloadKey] = useState(0);

  // Dados locais essenciais (mortalidade, geo_map, metadata).
  // Falha no dataset principal vira erro real, não painel zerado.
  useEffect(() => {
    let cancelled = false;

    async function loadData() {
      try {
        setLoading(true);
        setError(null);

        const files = ['mortalidade.json', 'geo_map.json', 'metadata.json'];

        const responses = await Promise.all(
          files.map(f => fetch(`${BASE_PATH}data/${f}`))
        );

        const data = await Promise.all(
          responses.map(async (r, i) => {
            if (r.ok) return r.json();
            console.warn(`Erro ao carregar ${files[i]}: ${r.status}`);
            return null;
          })
        );

        if (cancelled) return;

        if (!data[0]) {
          // Dataset essencial ausente: sem ele o painel mostraria zeros
          // com aparência de dado real.
          setError('Não foi possível carregar os dados do painel. Verifique sua conexão e tente novamente.');
          return;
        }

        setMortalidade(data[0]);
        setGeoMap(data[1]);
        setMetadata(data[2]);

      } catch (err) {
        console.error('Erro ao carregar dados:', err);
        if (!cancelled) {
          setError('Não foi possível carregar os dados do painel. Verifique sua conexão e tente novamente.');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    loadData();
    return () => { cancelled = true; };
  }, [reloadKey]);

  // Malha municipal (TopoJSON de CDN externa, ~4 MB): carregada fora do
  // caminho crítico. Falha aqui não bloqueia KPIs, séries nem ranking;
  // o MapChart mostra erro localizado com botão de tentar de novo.
  useEffect(() => {
    let cancelled = false;

    async function loadGeo() {
      try {
        setGeoError(false);
        const res = await fetchTopo();
        const json = await res.json();
        if (!cancelled) {
          setGeoData(feature(json, json.objects.municipalities));
        }
      } catch (err) {
        console.warn('Erro ao carregar malha municipal:', err);
        if (!cancelled) setGeoError(true);
      }
    }

    loadGeo();
    return () => { cancelled = true; };
  }, [geoReloadKey]);

  const retry = useCallback(() => setReloadKey(k => k + 1), []);
  const retryGeo = useCallback(() => setGeoReloadKey(k => k + 1), []);

  return {
    mortalidade,
    geoData,
    geoMap,
    metadata,
    loading,
    error,
    geoError,
    retry,
    retryGeo
  };
}

/**
 * Hook para obter lista de códigos de municípios filtrados
 * @param {Object} geoMap - Mapa geográfico com municípios por regional/mesorregião
 * @param {Object} filters - Filtros ativos (regional, mesorregiao, municipio)
 * @returns {Array} Lista de códigos IBGE dos municípios filtrados
 */
export function useFilteredMunicipios(geoMap, filters) {
  return useMemo(() => {
    if (!geoMap) return [];

    const { regional, mesorregiao, municipio, municipioCodigo } = filters || {};

    // Município específico selecionado
    if (municipioCodigo) {
      return [municipioCodigo];
    }

    // Filtrar por regional
    if (regional && geoMap.municipiosPorRegional?.[regional]) {
      return geoMap.municipiosPorRegional[regional].map(m => m.cod_ibge);
    }

    // Filtrar por mesorregião
    if (mesorregiao && geoMap.municipiosPorMesorregiao?.[mesorregiao]) {
      return geoMap.municipiosPorMesorregiao[mesorregiao].map(m => m.cod_ibge);
    }

    // Sem filtro - retorna lista vazia (significa "todos")
    return [];
  }, [geoMap, filters]);
}

/**
 * Hook para filtrar dados de mortalidade
 */
export function useFilteredMortalidade(mortalidade, filters, geoMap) {
  const municipiosFiltrados = useFilteredMunicipios(geoMap, filters);

  return useMemo(() => {
    if (!mortalidade) return null;

    const { anoMin, anoMax } = filters || {};
    const hasFiltroMunicipio = municipiosFiltrados.length > 0;

    // Filtrar série temporal por ano
    let porAno = mortalidade.porAno || [];
    if (anoMin) porAno = porAno.filter(item => item.ano >= anoMin);
    if (anoMax) porAno = porAno.filter(item => item.ano <= anoMax);

    // Filtrar municípios (porMunicipio ou topMunicipios como fallback)
    let porMunicipio = mortalidade.porMunicipio || mortalidade.topMunicipios || [];
    if (hasFiltroMunicipio) {
      porMunicipio = porMunicipio.filter(m => municipiosFiltrados.includes(m.cod_ibge));
    }

    // Se há filtro de município, recalcular série temporal
    if (hasFiltroMunicipio && mortalidade.porMunicipioAno) {
      const anos = porAno.map(a => a.ano);
      // População do último ano: só como fallback para arquivos antigos em
      // que porMunicipioAno não carrega a população de cada ano.
      const popUltimoAno = porMunicipio.reduce((sum, m) => sum + (m.populacao || 0), 0);
      porAno = anos.map(ano => {
        let total = 0;
        // Taxa: numerador e denominador só com municípios que têm população
        // no ano (mesmo recorte do preprocess), para não inflar a taxa.
        let obitosComPop = 0;
        let popAno = 0;
        municipiosFiltrados.forEach(codIbge => {
          const dadosAno = mortalidade.porMunicipioAno[codIbge]?.[ano];
          if (dadosAno) {
            total += dadosAno.obitos;
            if (dadosAno.populacao) {
              obitosComPop += dadosAno.obitos;
              popAno += dadosAno.populacao;
            }
          }
        });
        const numerador = popAno > 0 ? obitosComPop : total;
        const popTotal = popAno > 0 ? popAno : popUltimoAno;
        return {
          ano,
          total,
          taxa_bruta: popTotal > 0 ? parseFloat((numerador / popTotal * 1000).toFixed(2)) : 0
        };
      });
    }

    // Calcular totais
    const totalObitos = porAno.reduce((sum, item) => sum + item.total, 0);
    const ultimoAno = porAno[porAno.length - 1];
    const penultimoAno = porAno.length > 1 ? porAno[porAno.length - 2] : null;

    // Nascidos vivos (estado) — filtrados pelo mesmo recorte de anos
    let nascidosPorAno = mortalidade.nascidosPorAno || [];
    if (anoMin) nascidosPorAno = nascidosPorAno.filter(item => item.ano >= anoMin);
    if (anoMax) nascidosPorAno = nascidosPorAno.filter(item => item.ano <= anoMax);

    return {
      porAno,
      piramideEtaria: mortalidade.piramideEtaria,
      nascidosPorAno,
      porMunicipio,
      topMunicipios: porMunicipio.slice(0, 20),
      totalObitos,
      ultimoAno,
      penultimoAno,
      metadata: mortalidade.metadata
    };
  }, [mortalidade, filters, municipiosFiltrados]);
}

/**
 * Hook de agregações gerais para KPIs (somente dados reais)
 */
export function useAggregations(data, filters, geoMap) {
  const filteredMortalidade = useFilteredMortalidade(data.mortalidade, filters, geoMap);

  return useMemo(() => {
    const kpis = {
      obitos: { valor: 0, variacao: null },
      taxaBruta: { valor: null },
      nascidos: { valor: 0, variacao: null },
      populacao: { valor: 0 }
    };

    if (filteredMortalidade?.ultimoAno) {
      kpis.obitos.valor = filteredMortalidade.ultimoAno.total || 0;
      kpis.taxaBruta.valor = filteredMortalidade.ultimoAno.taxa_bruta ?? null;
      if (filteredMortalidade.penultimoAno) {
        const anterior = filteredMortalidade.penultimoAno.total;
        if (anterior > 0) {
          kpis.obitos.variacao = ((kpis.obitos.valor - anterior) / anterior) * 100;
        }
      }
    }

    const nascidos = filteredMortalidade?.nascidosPorAno || [];
    if (nascidos.length > 0) {
      const ultimo = nascidos[nascidos.length - 1];
      kpis.nascidos.valor = ultimo.total || 0;
      if (nascidos.length > 1) {
        const anterior = nascidos[nascidos.length - 2].total;
        if (anterior > 0) {
          kpis.nascidos.variacao = ((kpis.nascidos.valor - anterior) / anterior) * 100;
        }
      }
    }

    kpis.populacao.valor = (filteredMortalidade?.porMunicipio || [])
      .reduce((sum, m) => sum + (m.populacao || 0), 0);

    return kpis;
  }, [filteredMortalidade]);
}
/**
 * Hook para extrair lista de anos disponíveis
 */
export function useAvailableYears(metadata) {
  return useMemo(() => {
    if (!metadata?.filtros?.anosDisponiveis) {
      return {
        anos: [],
        anoMin: 2010,
        anoMax: 2024
      };
    }

    return {
      anos: metadata.filtros.anosDisponiveis,
      anoMin: metadata.filtros.anoMin,
      anoMax: metadata.filtros.anoMax
    };
  }, [metadata]);
}

/**
 * Hook para extrair regionais de saúde
 */
export function useRegionais(geoMap) {
  return useMemo(() => {
    if (!geoMap?.regionais) return [];
    return geoMap.regionais;
  }, [geoMap]);
}

/**
 * Hook para extrair municípios por regional
 */
export function useMunicipios(geoMap, regional) {
  return useMemo(() => {
    if (!geoMap?.municipiosPorRegional) return [];
    if (!regional) {
      return Object.values(geoMap.municipiosPorRegional).flat();
    }
    return geoMap.municipiosPorRegional[regional] || [];
  }, [geoMap, regional]);
}
