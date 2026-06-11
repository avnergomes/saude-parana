/**
 * Hooks de carregamento e filtragem de dados
 * Padrão DataGeo Paraná - Módulo Saúde
 * Suporta filtragem por ano, regional, mesorregião e município
 */

import { useState, useEffect, useMemo } from 'react';
import { feature } from 'topojson-client';

const BASE_PATH = import.meta.env.BASE_URL || '/saude-parana/';
const TOPO_URL = 'https://cdn.jsdelivr.net/gh/datageoparana/datageoparana.github.io@main/assets/parana-municipalities.topojson';

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

  useEffect(() => {
    async function loadData() {
      try {
        setLoading(true);
        setError(null);

        const files = [
          'mortalidade.json',
          null, // municipios: loaded from CDN below
          'geo_map.json',
          'metadata.json'
        ];

        const responses = await Promise.all(
          files.map(f => f ? fetch(`${BASE_PATH}data/${f}`) : fetch(TOPO_URL))
        );

        const data = await Promise.all(
          responses.map(async (r, i) => {
            if (r.ok) {
              const json = await r.json();
              if (i === 1) return feature(json, json.objects.municipalities);
              return json;
            }
            console.warn(`Erro ao carregar ${files[i]}: ${r.status}`);
            return null;
          })
        );

        setMortalidade(data[0]);
        setGeoData(data[1]);
        setGeoMap(data[2]);
        setMetadata(data[3]);

      } catch (err) {
        console.error('Erro ao carregar dados:', err);
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }

    loadData();
  }, []);

  return {
    mortalidade,
    geoData,
    geoMap,
    metadata,
    loading,
    error
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
      porAno = anos.map(ano => {
        let total = 0;
        municipiosFiltrados.forEach(codIbge => {
          const dadosMun = mortalidade.porMunicipioAno[codIbge];
          if (dadosMun && dadosMun[ano]) {
            total += dadosMun[ano].obitos;
          }
        });
        // Calcular população total dos municípios filtrados
        const popTotal = porMunicipio.reduce((sum, m) => sum + (m.populacao || 0), 0);
        return {
          ano,
          total,
          taxa_bruta: popTotal > 0 ? parseFloat((total / popTotal * 1000).toFixed(2)) : 0
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
