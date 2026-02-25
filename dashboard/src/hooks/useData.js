/**
 * Hooks de carregamento e filtragem de dados
 * Padrão DataGeo Paraná - Módulo Saúde
 * Suporta filtragem por ano, regional, mesorregião e município
 */

import { useState, useEffect, useMemo } from 'react';

const BASE_PATH = import.meta.env.BASE_URL || '/saude-parana/';

/**
 * Hook principal de carregamento de dados
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

    // Filtrar municípios
    let porMunicipio = mortalidade.porMunicipio || [];
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

    return {
      porAno,
      porCapitulo: mortalidade.porCapitulo,
      piramideEtaria: mortalidade.piramideEtaria,
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
 * Hook para filtrar dados de internações
 */
export function useFilteredInternacoes(internacoes, filters, geoMap) {
  const municipiosFiltrados = useFilteredMunicipios(geoMap, filters);

  return useMemo(() => {
    if (!internacoes) return null;

    const { anoMin, anoMax } = filters || {};
    const hasFiltroMunicipio = municipiosFiltrados.length > 0;

    // Filtrar série temporal por ano
    let porAno = internacoes.porAno || [];
    if (anoMin) porAno = porAno.filter(item => item.ano >= anoMin);
    if (anoMax) porAno = porAno.filter(item => item.ano <= anoMax);

    // Filtrar municípios
    let porMunicipio = internacoes.porMunicipio || [];
    if (hasFiltroMunicipio) {
      porMunicipio = porMunicipio.filter(m => municipiosFiltrados.includes(m.cod_ibge));
    }

    // Se há filtro de município, recalcular série temporal
    if (hasFiltroMunicipio && internacoes.porMunicipioAno) {
      const anos = porAno.map(a => a.ano);
      porAno = anos.map(ano => {
        let totalInternacoes = 0;
        let totalValorSus = 0;
        municipiosFiltrados.forEach(codIbge => {
          const dadosMun = internacoes.porMunicipioAno[codIbge];
          if (dadosMun && dadosMun[ano]) {
            totalInternacoes += dadosMun[ano].internacoes;
            totalValorSus += dadosMun[ano].valor_sus;
          }
        });
        return {
          ano,
          internacoes: totalInternacoes,
          valor_sus: totalValorSus
        };
      });
    }

    const totalInternacoes = porAno.reduce((sum, item) => sum + item.internacoes, 0);
    const totalValorSus = porAno.reduce((sum, item) => sum + item.valor_sus, 0);
    const ultimoAno = porAno[porAno.length - 1];
    const penultimoAno = porAno.length > 1 ? porAno[porAno.length - 2] : null;

    return {
      porAno,
      porGrupoDiagnostico: internacoes.porGrupoDiagnostico,
      porMunicipio,
      totalInternacoes,
      totalValorSus,
      ultimoAno,
      penultimoAno,
      metadata: internacoes.metadata
    };
  }, [internacoes, filters, municipiosFiltrados]);
}

/**
 * Hook para filtrar dados de vacinação
 */
export function useFilteredVacinacao(vacinacao, filters, geoMap) {
  const municipiosFiltrados = useFilteredMunicipios(geoMap, filters);

  return useMemo(() => {
    if (!vacinacao) return null;

    const { anoMin, anoMax } = filters || {};
    const hasFiltroMunicipio = municipiosFiltrados.length > 0;

    // Filtrar cobertura por ano
    let coberturaPorAno = vacinacao.coberturaPorAno || [];
    if (anoMin) coberturaPorAno = coberturaPorAno.filter(item => item.ano >= anoMin);
    if (anoMax) coberturaPorAno = coberturaPorAno.filter(item => item.ano <= anoMax);

    // Filtrar municípios
    let porMunicipio = vacinacao.porMunicipio || [];
    if (hasFiltroMunicipio) {
      porMunicipio = porMunicipio.filter(m => municipiosFiltrados.includes(m.cod_ibge));
    }

    // Se há filtro de município, recalcular cobertura média
    if (hasFiltroMunicipio && vacinacao.porMunicipioAno) {
      const anos = coberturaPorAno.map(a => a.ano);
      coberturaPorAno = anos.map(ano => {
        const dadosAno = { ano };
        vacinacao.vacinas.forEach(v => {
          let soma = 0;
          let count = 0;
          municipiosFiltrados.forEach(codIbge => {
            const dadosMun = vacinacao.porMunicipioAno[codIbge];
            if (dadosMun && dadosMun[ano] && dadosMun[ano][v.codigo] !== undefined) {
              soma += dadosMun[ano][v.codigo];
              count++;
            }
          });
          dadosAno[v.codigo] = count > 0 ? parseFloat((soma / count).toFixed(1)) : 0;
        });
        return dadosAno;
      });
    }

    const ultimoAno = coberturaPorAno[coberturaPorAno.length - 1];
    let coberturaMédia = 0;
    if (ultimoAno) {
      const vacinas = vacinacao.vacinas?.filter(v => v.codigo !== 'COVID') || [];
      const soma = vacinas.reduce((sum, v) => sum + (ultimoAno[v.codigo] || 0), 0);
      coberturaMédia = vacinas.length > 0 ? soma / vacinas.length : 0;
    }

    return {
      vacinas: vacinacao.vacinas,
      coberturaPorAno,
      porMunicipio,
      ultimoAno,
      coberturaMédia,
      metadata: vacinacao.metadata
    };
  }, [vacinacao, filters, municipiosFiltrados]);
}

/**
 * Hook para filtrar dados de estabelecimentos
 */
export function useFilteredEstabelecimentos(estabelecimentos, filters, geoMap) {
  const municipiosFiltrados = useFilteredMunicipios(geoMap, filters);

  return useMemo(() => {
    if (!estabelecimentos) return null;

    const hasFiltroMunicipio = municipiosFiltrados.length > 0;

    // Filtrar municípios
    let porMunicipio = estabelecimentos.porMunicipio || [];
    if (hasFiltroMunicipio) {
      porMunicipio = porMunicipio.filter(m => municipiosFiltrados.includes(m.cod_ibge));
    }

    // Recalcular totais
    const totalEstabelecimentos = porMunicipio.reduce((sum, m) => sum + m.total, 0);
    const totalLeitosSUS = porMunicipio.reduce((sum, m) => sum + m.leitos_sus, 0);

    return {
      tiposEstabelecimento: estabelecimentos.tiposEstabelecimento,
      porMunicipio,
      metadata: {
        ...estabelecimentos.metadata,
        totalEstabelecimentos: hasFiltroMunicipio ? totalEstabelecimentos : estabelecimentos.metadata.totalEstabelecimentos,
        totalLeitosSUS: hasFiltroMunicipio ? totalLeitosSUS : estabelecimentos.metadata.totalLeitosSUS
      }
    };
  }, [estabelecimentos, filters, municipiosFiltrados]);
}

/**
 * Hook para filtrar dados de repasses SUS
 */
export function useFilteredRepassesSus(repassesSus, filters, geoMap) {
  const municipiosFiltrados = useFilteredMunicipios(geoMap, filters);

  return useMemo(() => {
    if (!repassesSus) return null;

    const { anoMin, anoMax } = filters || {};
    const hasFiltroMunicipio = municipiosFiltrados.length > 0;

    // Filtrar série temporal por ano
    let porAno = repassesSus.porAno || [];
    if (anoMin) porAno = porAno.filter(item => item.ano >= anoMin);
    if (anoMax) porAno = porAno.filter(item => item.ano <= anoMax);

    // Filtrar municípios
    let porMunicipio = repassesSus.porMunicipio || [];
    if (hasFiltroMunicipio) {
      porMunicipio = porMunicipio.filter(m => municipiosFiltrados.includes(m.cod_ibge));
    }

    // Se há filtro de município, recalcular série temporal
    if (hasFiltroMunicipio && repassesSus.porMunicipioAno) {
      const anos = porAno.map(a => a.ano);
      const blocos = repassesSus.blocos || [];

      porAno = anos.map(ano => {
        const dadosAno = { ano, total: 0 };
        blocos.forEach(b => dadosAno[b.codigo] = 0);

        municipiosFiltrados.forEach(codIbge => {
          const dadosMun = repassesSus.porMunicipioAno[codIbge];
          if (dadosMun && dadosMun[ano]) {
            dadosAno.total += dadosMun[ano].total;
            blocos.forEach(b => {
              dadosAno[b.codigo] += dadosMun[ano][b.codigo] || 0;
            });
          }
        });

        return dadosAno;
      });
    }

    return {
      blocos: repassesSus.blocos,
      porAno,
      porMunicipio,
      metadata: repassesSus.metadata
    };
  }, [repassesSus, filters, municipiosFiltrados]);
}

/**
 * Hook de agregações gerais para KPIs
 */
export function useAggregations(data, filters, geoMap) {
  const filteredMortalidade = useFilteredMortalidade(data.mortalidade, filters, geoMap);
  const filteredInternacoes = useFilteredInternacoes(data.internacoes, filters, geoMap);
  const filteredVacinacao = useFilteredVacinacao(data.vacinacao, filters, geoMap);
  const filteredEstabelecimentos = useFilteredEstabelecimentos(data.estabelecimentos, filters, geoMap);
  const filteredRepassesSus = useFilteredRepassesSus(data.repassesSus, filters, geoMap);

  return useMemo(() => {
    const kpis = {
      obitos: { valor: 0, variacao: null },
      internacoes: { valor: 0, variacao: null, valorSus: 0 },
      coberturaVacinal: { valor: 0, variacao: null },
      estabelecimentos: { valor: 0 },
      leitosSus: { valor: 0 },
      repassePerCapita: { valor: 0, variacao: null }
    };

    // Mortalidade
    if (filteredMortalidade?.ultimoAno) {
      kpis.obitos.valor = filteredMortalidade.ultimoAno.total || 0;
      if (filteredMortalidade.penultimoAno) {
        const anterior = filteredMortalidade.penultimoAno.total;
        if (anterior > 0) {
          kpis.obitos.variacao = ((kpis.obitos.valor - anterior) / anterior) * 100;
        }
      }
    }

    // Internações
    if (filteredInternacoes?.ultimoAno) {
      kpis.internacoes.valor = filteredInternacoes.ultimoAno.internacoes || 0;
      kpis.internacoes.valorSus = filteredInternacoes.ultimoAno.valor_sus || 0;
      if (filteredInternacoes.penultimoAno) {
        const anterior = filteredInternacoes.penultimoAno.internacoes;
        if (anterior > 0) {
          kpis.internacoes.variacao = ((kpis.internacoes.valor - anterior) / anterior) * 100;
        }
      }
    }

    // Vacinação
    if (filteredVacinacao?.coberturaMédia) {
      kpis.coberturaVacinal.valor = filteredVacinacao.coberturaMédia;
    }

    // Estabelecimentos
    if (filteredEstabelecimentos?.metadata) {
      kpis.estabelecimentos.valor = filteredEstabelecimentos.metadata.totalEstabelecimentos || 0;
      kpis.leitosSus.valor = filteredEstabelecimentos.metadata.totalLeitosSUS || 0;
    }

    // Repasses (per capita)
    if (filteredRepassesSus?.porAno?.length > 0) {
      const ultimo = filteredRepassesSus.porAno[filteredRepassesSus.porAno.length - 1];
      // Calcular população dos municípios filtrados
      let populacao = 11890517; // default: estado todo
      if (filteredMortalidade?.porMunicipio?.length > 0 &&
          filteredMortalidade.porMunicipio.length < 399) {
        populacao = filteredMortalidade.porMunicipio.reduce((sum, m) => sum + (m.populacao || 0), 0);
      }
      kpis.repassePerCapita.valor = populacao > 0 ? (ultimo?.total || 0) / populacao : 0;
    }

    return kpis;
  }, [filteredMortalidade, filteredInternacoes, filteredVacinacao, filteredEstabelecimentos, filteredRepassesSus]);
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
