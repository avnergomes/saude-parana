/**
 * Hooks de carregamento e filtragem de dados
 * Padrão DataGeo Paraná - Módulo Saúde
 */

import { useState, useEffect, useMemo, useCallback } from 'react';

const BASE_PATH = import.meta.env.BASE_URL || '/saude-parana/';

/**
 * Hook principal de carregamento de dados
 * Carrega todos os JSONs necessários em paralelo
 */
export function useData() {
  const [mortalidade, setMortalidade] = useState(null);
  const [internacoes, setInternacoes] = useState(null);
  const [vacinacao, setVacinacao] = useState(null);
  const [estabelecimentos, setEstabelecimentos] = useState(null);
  const [repassesSus, setRepassesSus] = useState(null);
  const [indicadoresAb, setIndicadoresAb] = useState(null);
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
          'internacoes.json',
          'vacinacao.json',
          'estabelecimentos.json',
          'repasses_sus.json',
          'indicadores_ab.json',
          'municipios.geojson',
          'geo_map.json',
          'metadata.json'
        ];

        const responses = await Promise.all(
          files.map(f => fetch(`${BASE_PATH}data/${f}`))
        );

        // Verificar se algum arquivo não foi encontrado
        const failedFiles = files.filter((_, i) => !responses[i].ok);
        if (failedFiles.length > 0) {
          console.warn('Arquivos não encontrados:', failedFiles);
        }

        const data = await Promise.all(
          responses.map(async (r, i) => {
            if (r.ok) {
              return r.json();
            }
            console.warn(`Erro ao carregar ${files[i]}: ${r.status}`);
            return null;
          })
        );

        setMortalidade(data[0]);
        setInternacoes(data[1]);
        setVacinacao(data[2]);
        setEstabelecimentos(data[3]);
        setRepassesSus(data[4]);
        setIndicadoresAb(data[5]);
        setGeoData(data[6]);
        setGeoMap(data[7]);
        setMetadata(data[8]);

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
    internacoes,
    vacinacao,
    estabelecimentos,
    repassesSus,
    indicadoresAb,
    geoData,
    geoMap,
    metadata,
    loading,
    error
  };
}

/**
 * Hook de filtragem de dados de mortalidade
 */
export function useFilteredMortalidade(mortalidade, filters) {
  return useMemo(() => {
    if (!mortalidade) return null;

    const { anoMin, anoMax, regional, municipio, capitulo } = filters || {};

    // Filtrar série temporal por ano
    let porAno = mortalidade.porAno || [];
    if (anoMin) {
      porAno = porAno.filter(item => item.ano >= anoMin);
    }
    if (anoMax) {
      porAno = porAno.filter(item => item.ano <= anoMax);
    }

    // Calcular totais
    const totalObitos = porAno.reduce((sum, item) => sum + item.total, 0);
    const ultimoAno = porAno[porAno.length - 1];
    const penultimoAno = porAno[porAno.length - 2];

    return {
      porAno,
      porCapitulo: mortalidade.porCapitulo,
      piramideEtaria: mortalidade.piramideEtaria,
      topMunicipios: mortalidade.topMunicipios,
      totalObitos,
      ultimoAno,
      penultimoAno,
      metadata: mortalidade.metadata
    };
  }, [mortalidade, filters]);
}

/**
 * Hook de filtragem de dados de internações
 */
export function useFilteredInternacoes(internacoes, filters) {
  return useMemo(() => {
    if (!internacoes) return null;

    const { anoMin, anoMax } = filters || {};

    let porAno = internacoes.porAno || [];
    if (anoMin) {
      porAno = porAno.filter(item => item.ano >= anoMin);
    }
    if (anoMax) {
      porAno = porAno.filter(item => item.ano <= anoMax);
    }

    const totalInternacoes = porAno.reduce((sum, item) => sum + item.internacoes, 0);
    const totalValorSus = porAno.reduce((sum, item) => sum + item.valor_sus, 0);
    const ultimoAno = porAno[porAno.length - 1];
    const penultimoAno = porAno[porAno.length - 2];

    return {
      porAno,
      porGrupoDiagnostico: internacoes.porGrupoDiagnostico,
      totalInternacoes,
      totalValorSus,
      ultimoAno,
      penultimoAno,
      metadata: internacoes.metadata
    };
  }, [internacoes, filters]);
}

/**
 * Hook de filtragem de dados de vacinação
 */
export function useFilteredVacinacao(vacinacao, filters) {
  return useMemo(() => {
    if (!vacinacao) return null;

    const { anoMin, anoMax, vacina } = filters || {};

    let coberturaPorAno = vacinacao.coberturaPorAno || [];
    if (anoMin) {
      coberturaPorAno = coberturaPorAno.filter(item => item.ano >= anoMin);
    }
    if (anoMax) {
      coberturaPorAno = coberturaPorAno.filter(item => item.ano <= anoMax);
    }

    // Calcular cobertura média do último ano
    const ultimoAno = coberturaPorAno[coberturaPorAno.length - 1];
    let coberturaMédia = 0;
    if (ultimoAno) {
      const vacinas = vacinacao.vacinas.filter(v => v.codigo !== 'COVID');
      const soma = vacinas.reduce((sum, v) => sum + (ultimoAno[v.codigo] || 0), 0);
      coberturaMédia = soma / vacinas.length;
    }

    return {
      vacinas: vacinacao.vacinas,
      coberturaPorAno,
      ultimoAno,
      coberturaMédia,
      metadata: vacinacao.metadata
    };
  }, [vacinacao, filters]);
}

/**
 * Hook para filtrar dados por municipios (baseado em regional, mesorregiao ou municipio selecionado)
 */
export function useFilteredMunicipios(geoMap, filters) {
  return useMemo(() => {
    if (!geoMap) return { codigos: [], nomes: [] };

    const { regional, mesorregiao, municipio, municipioCodigo } = filters || {};

    // Se um municipio especifico foi selecionado
    if (municipioCodigo) {
      const mun = geoMap.municipioPorCodigo?.[municipioCodigo];
      return {
        codigos: [municipioCodigo],
        nomes: mun ? [mun.nome] : [municipio]
      };
    }

    // Filtrar por regional
    if (regional && geoMap.municipiosPorRegional?.[regional]) {
      const lista = geoMap.municipiosPorRegional[regional];
      return {
        codigos: lista.map(m => m.cod_ibge),
        nomes: lista.map(m => m.nome)
      };
    }

    // Filtrar por mesorregiao
    if (mesorregiao && geoMap.municipiosPorMesorregiao?.[mesorregiao]) {
      const lista = geoMap.municipiosPorMesorregiao[mesorregiao];
      return {
        codigos: lista.map(m => m.cod_ibge),
        nomes: lista.map(m => m.nome)
      };
    }

    // Todos os municipios
    return { codigos: [], nomes: [] }; // vazio = sem filtro
  }, [geoMap, filters]);
}

/**
 * Hook de agregações gerais para KPIs
 * Filtra dados por ano e localidade (regional/mesorregiao/municipio)
 */
export function useAggregations(data, filters, geoMap) {
  const { mortalidade, internacoes, vacinacao, estabelecimentos, repassesSus } = data;
  const filteredMunicipios = useFilteredMunicipios(geoMap, filters);

  return useMemo(() => {
    const kpis = {
      obitos: { valor: 0, variacao: null },
      internacoes: { valor: 0, variacao: null, valorSus: 0 },
      coberturaVacinal: { valor: 0, variacao: null },
      estabelecimentos: { valor: 0 },
      leitosSus: { valor: 0 },
      repassePerCapita: { valor: 0, variacao: null }
    };

    const { anoMin, anoMax } = filters || {};
    const hasMunicipioFilter = filteredMunicipios.codigos.length > 0;

    // Mortalidade - filtrar por ano e municipio se houver
    if (mortalidade?.porAno?.length > 0) {
      let porAno = mortalidade.porAno;

      // Filtrar por ano
      if (anoMin) porAno = porAno.filter(item => item.ano >= anoMin);
      if (anoMax) porAno = porAno.filter(item => item.ano <= anoMax);

      if (porAno.length > 0) {
        const ultimo = porAno[porAno.length - 1];
        const penultimo = porAno.length > 1 ? porAno[porAno.length - 2] : null;

        // Se filtro de municipio, usar dados de topMunicipios
        if (hasMunicipioFilter && mortalidade.topMunicipios) {
          const filtered = mortalidade.topMunicipios.filter(m =>
            filteredMunicipios.codigos.includes(m.cod_ibge)
          );
          kpis.obitos.valor = filtered.reduce((sum, m) => sum + (m.obitos || 0), 0);
        } else {
          kpis.obitos.valor = ultimo?.total || 0;
          if (penultimo) {
            kpis.obitos.variacao = ((ultimo.total - penultimo.total) / penultimo.total) * 100;
          }
        }
      }
    }

    // Internações - filtrar por ano
    if (internacoes?.porAno?.length > 0) {
      let porAno = internacoes.porAno;

      if (anoMin) porAno = porAno.filter(item => item.ano >= anoMin);
      if (anoMax) porAno = porAno.filter(item => item.ano <= anoMax);

      if (porAno.length > 0) {
        const ultimo = porAno[porAno.length - 1];
        const penultimo = porAno.length > 1 ? porAno[porAno.length - 2] : null;

        kpis.internacoes.valor = ultimo?.internacoes || 0;
        kpis.internacoes.valorSus = ultimo?.valor_sus || 0;

        if (penultimo) {
          kpis.internacoes.variacao = ((ultimo.internacoes - penultimo.internacoes) / penultimo.internacoes) * 100;
        }
      }
    }

    // Vacinação
    if (vacinacao?.coberturaPorAno?.length > 0) {
      let cobertura = vacinacao.coberturaPorAno;

      if (anoMin) cobertura = cobertura.filter(item => item.ano >= anoMin);
      if (anoMax) cobertura = cobertura.filter(item => item.ano <= anoMax);

      if (cobertura.length > 0) {
        const ultimo = cobertura[cobertura.length - 1];
        const vacinas = vacinacao.vacinas?.filter(v => v.codigo !== 'COVID') || [];
        if (vacinas.length > 0) {
          const soma = vacinas.reduce((sum, v) => sum + (ultimo[v.codigo] || 0), 0);
          kpis.coberturaVacinal.valor = soma / vacinas.length;
        }
      }
    }

    // Estabelecimentos
    if (estabelecimentos?.metadata) {
      kpis.estabelecimentos.valor = estabelecimentos.metadata.totalEstabelecimentos || 0;
      kpis.leitosSus.valor = estabelecimentos.metadata.totalLeitosSUS || 0;
    }

    // Repasses
    if (repassesSus?.porAno?.length > 0) {
      let porAno = repassesSus.porAno;

      if (anoMin) porAno = porAno.filter(item => item.ano >= anoMin);
      if (anoMax) porAno = porAno.filter(item => item.ano <= anoMax);

      if (porAno.length > 0) {
        const ultimo = porAno[porAno.length - 1];
        // Assumindo população de ~12 milhões
        kpis.repassePerCapita.valor = (ultimo?.total || 0) / 11890517;
      }
    }

    return kpis;
  }, [mortalidade, internacoes, vacinacao, estabelecimentos, repassesSus, filters, filteredMunicipios]);
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
      // Retorna todos os municípios
      return Object.values(geoMap.municipiosPorRegional).flat();
    }
    return geoMap.municipiosPorRegional[regional] || [];
  }, [geoMap, regional]);
}
