// ATLAS-A11Y-HEX-SWEPT
import { useState, useCallback, useMemo } from 'react';
import {
  useData,
  useAggregations,
  useFilteredMortalidade
} from './hooks/useData';

// Componentes
import Header from './components/Header';
import Loading from './components/Loading';
import Footer from './components/Footer';
import Tabs from './components/Tabs';
import Filters from './components/Filters';
import ActiveFilters from './components/ActiveFilters';
import KpiCards from './components/KpiCards';

// Abas (uma por domínio; ver docs/fontes-de-dados.md)
import VisaoGeralTab from './components/tabs/VisaoGeralTab';
import MortalidadeTab from './components/tabs/MortalidadeTab';
import InternacoesTab from './components/tabs/InternacoesTab';
import RedeSaudeTab from './components/tabs/RedeSaudeTab';
import AtencaoPrimariaTab from './components/tabs/AtencaoPrimariaTab';
import ArbovirosesTab from './components/tabs/ArbovirosesTab';
import FinanciamentoTab from './components/tabs/FinanciamentoTab';
import CarregandoDominio from './components/tabs/CarregandoDominio';

// Abas cujo JSON é opcional (gerado por scripts/run_etl.py)
const ABAS_DE_DOMINIO = new Set([
  'internacoes', 'rede-saude', 'atencao-primaria', 'arboviroses', 'financiamento'
]);

function App() {
  // Núcleo (IBGE) + domínios oficiais opcionais carregados em segundo plano
  const {
    mortalidade,
    dominios,
    dominiosLoading,
    geoData,
    geoMap,
    metadata,
    loading,
    error,
    geoError,
    retry,
    retryGeo
  } = useData();

  // Estado de navegação
  const [activeTab, setActiveTab] = useState('visao-geral');

  // Estado de filtros (dropdowns). anoMax = ano corrente: os domínios
  // DATASUS/APS/InfoDengue chegam a 2025-2026 embora o núcleo IBGE pare em 2024.
  const [filters, setFilters] = useState({
    anoMin: 2010,
    anoMax: new Date().getFullYear(),
    regional: null,
    mesorregiao: null,
    municipio: null,
    municipioCodigo: null
  });

  // Estado de filtros interativos (clique nos gráficos)
  const [interactiveFilters, setInteractiveFilters] = useState({
    ano: null,
    municipio: null,
    municipioCodigo: null
  });

  // Merge de filtros (ano e município vindos de cliques nos gráficos)
  const mergedFilters = useMemo(() => ({
    ...filters,
    ...(interactiveFilters.ano && { anoMin: interactiveFilters.ano, anoMax: interactiveFilters.ano }),
    ...(interactiveFilters.municipioCodigo && {
      municipio: interactiveFilters.municipio,
      municipioCodigo: interactiveFilters.municipioCodigo
    })
  }), [filters, interactiveFilters]);

  // Dados filtrados usando os hooks
  const filteredMortalidade = useFilteredMortalidade(mortalidade, mergedFilters, geoMap);

  // KPIs agregados (com filtros aplicados)
  const kpis = useAggregations({ mortalidade }, mergedFilters, geoMap);

  // Handlers de filtros interativos
  const handleAnoClick = useCallback((ano) => {
    setInteractiveFilters(prev => ({
      ...prev,
      ano: prev.ano === ano ? null : ano
    }));
  }, []);

  const handleMunicipioClick = useCallback((codIbge, nomeMunicipio) => {
    // Normaliza o código IBGE: o mapa envia 6 dígitos, o ranking envia 7.
    const cod = String(codIbge || '');
    const full = cod.length >= 7
      ? cod
      : String(
          (mortalidade?.porMunicipio || []).find(
            m => String(m.cod_ibge).startsWith(cod)
          )?.cod_ibge || cod
        );
    setInteractiveFilters(prev => ({
      ...prev,
      municipio: prev.municipioCodigo === full ? null : nomeMunicipio,
      municipioCodigo: prev.municipioCodigo === full ? null : full
    }));
  }, [mortalidade]);

  const clearInteractiveFilters = useCallback(() => {
    setInteractiveFilters({
      ano: null,
      municipio: null,
      municipioCodigo: null
    });
  }, []);

  const removeInteractiveFilter = useCallback((key) => {
    setInteractiveFilters(prev => ({
      ...prev,
      [key]: null,
      // Se remover município, limpa o código também
      ...(key === 'municipio' ? { municipioCodigo: null } : {})
    }));
  }, []);

  // Loading state
  if (loading) {
    return <Loading />;
  }

  // Error state
  if (error) {
    return (
      <div className="min-h-screen bg-neutral-50 flex items-center justify-center">
        <div className="text-center p-8">
          <h2 className="text-xl font-semibold text-dark-900 mb-2">Erro ao carregar dados</h2>
          <p className="text-dark-500">{error}</p>
          <button
            type="button"
            onClick={retry}
            className="mt-4 px-4 py-2 bg-water-600 text-white rounded-lg text-sm font-medium hover:bg-water-700 transition-colors"
          >
            Tentar novamente
          </button>
        </div>
      </div>
    );
  }

  // Props comuns a todas as abas (mapa, filtros e interações)
  const propsComuns = {
    geoData,
    geoError,
    onRetryGeo: retryGeo,
    geoMap,
    filters: mergedFilters,
    onAnoClick: handleAnoClick,
    onMunicipioClick: handleMunicipioClick,
    selectedAno: interactiveFilters.ano,
    selectedMunicipio: interactiveFilters.municipioCodigo
  };

  // Renderizar conteúdo da aba ativa
  const renderTabContent = () => {
    if (ABAS_DE_DOMINIO.has(activeTab) && dominiosLoading) {
      return <CarregandoDominio />;
    }
    switch (activeTab) {
      case 'visao-geral':
        return <VisaoGeralTab mortalidade={filteredMortalidade} {...propsComuns} />;
      case 'mortalidade':
        return (
          <MortalidadeTab
            data={filteredMortalidade}
            mortalidadeCid={dominios.mortalidadeCid}
            carregando={dominiosLoading}
            {...propsComuns}
          />
        );
      case 'internacoes':
        return <InternacoesTab dados={dominios.internacoes} {...propsComuns} />;
      case 'rede-saude':
        return (
          <RedeSaudeTab
            dados={dominios.estabelecimentos}
            planos={dominios.planosSaude}
            mortalidade={filteredMortalidade}
            {...propsComuns}
          />
        );
      case 'atencao-primaria':
        return <AtencaoPrimariaTab dados={dominios.atencaoPrimaria} {...propsComuns} />;
      case 'arboviroses':
        return <ArbovirosesTab dados={dominios.arboviroses} {...propsComuns} />;
      case 'financiamento':
        return (
          <FinanciamentoTab
            dados={dominios.financiamento}
            mortalidade={filteredMortalidade}
            {...propsComuns}
          />
        );
      default:
        return null;
    }
  };

  return (
    <div className="min-h-screen bg-neutral-50">
      <Header metadata={metadata} />
      <Tabs activeTab={activeTab} onTabChange={setActiveTab} />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <Filters
          metadata={metadata}
          geoMap={geoMap}
          filters={filters}
          onFiltersChange={setFilters}
        />

        <ActiveFilters
          filters={interactiveFilters}
          onClear={clearInteractiveFilters}
          onRemove={removeInteractiveFilter}
        />

        <KpiCards kpis={kpis} />

        {renderTabContent()}
      </main>

      <Footer />
    </div>
  );
}

export default App;
