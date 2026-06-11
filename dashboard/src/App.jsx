// ATLAS-A11Y-HEX-SWEPT
import { useState, useCallback, useMemo } from 'react';
import {
  useData,
  useAggregations,
  useAvailableYears,
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
import TimeSeriesChart from './components/TimeSeriesChart';
import PyramidChart from './components/PyramidChart';
import MapChart from './components/MapChart';
import RankingTable from './components/RankingTable';

function App() {
  // Carregar dados (somente fontes reais — IBGE Registro Civil + população)
  const {
    mortalidade,
    geoData,
    geoMap,
    metadata,
    loading,
    error
  } = useData();

  // Estado de navegação
  const [activeTab, setActiveTab] = useState('visao-geral');

  // Estado de filtros (dropdowns)
  const [filters, setFilters] = useState({
    anoMin: 2010,
    anoMax: 2024,
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

  // Anos disponíveis
  const { anos } = useAvailableYears(metadata);

  // Merge de filtros
  const mergedFilters = useMemo(() => ({
    ...filters,
    ...(interactiveFilters.ano && { anoMin: interactiveFilters.ano, anoMax: interactiveFilters.ano })
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
    setInteractiveFilters(prev => ({
      ...prev,
      municipio: prev.municipioCodigo === codIbge ? null : nomeMunicipio,
      municipioCodigo: prev.municipioCodigo === codIbge ? null : codIbge
    }));
  }, []);

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
        </div>
      </div>
    );
  }

  // Renderizar conteúdo da aba ativa
  const renderTabContent = () => {
    switch (activeTab) {
      case 'visao-geral':
        return <VisaoGeralTab
          mortalidade={filteredMortalidade}
          geoData={geoData}
          geoMap={geoMap}
          filters={mergedFilters}
          onAnoClick={handleAnoClick}
          onMunicipioClick={handleMunicipioClick}
          selectedAno={interactiveFilters.ano}
          selectedMunicipio={interactiveFilters.municipioCodigo}
        />;
      case 'mortalidade':
        return <MortalidadeTab
          data={filteredMortalidade}
          geoData={geoData}
          geoMap={geoMap}
          filters={mergedFilters}
          onAnoClick={handleAnoClick}
          onMunicipioClick={handleMunicipioClick}
          selectedAno={interactiveFilters.ano}
          selectedMunicipio={interactiveFilters.municipioCodigo}
        />;
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

// ========== ABAS ==========

function VisaoGeralTab({ mortalidade, geoData, geoMap, filters, onAnoClick, onMunicipioClick, selectedAno, selectedMunicipio }) {
  // Dados já vêm filtrados
  const mapData = mortalidade?.porMunicipio || [];
  const serieTemporalMortalidade = mortalidade?.porAno || [];
  const nascidosPorAno = mortalidade?.nascidosPorAno || [];
  const rankingMunicipios = mortalidade?.topMunicipios || [];

  return (
    <div className="space-y-6">
      {/* Mapa + Serie temporal */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <MapChart
          geoData={geoData}
          data={mapData}
          metric="taxa"
          title="Taxa de Mortalidade por Município (por 1.000 hab)"
          colorScale="obitos"
          formatValue={(v) => v?.toFixed(1) || '-'}
          onFeatureClick={onMunicipioClick}
          selectedFeature={selectedMunicipio}
        />

        <TimeSeriesChart
          data={serieTemporalMortalidade}
          metrics={['total']}
          title="Evolução da Mortalidade"
          onPointClick={onAnoClick}
          selectedAno={selectedAno}
          referenceYear={2020}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Nascidos vivos (Registro Civil) */}
        <TimeSeriesChart
          data={nascidosPorAno}
          metrics={['total']}
          title="Nascidos Vivos por Ano"
          onPointClick={onAnoClick}
          selectedAno={selectedAno}
        />

        {/* Taxa bruta de mortalidade */}
        <TimeSeriesChart
          data={serieTemporalMortalidade}
          metrics={['taxa_bruta']}
          title="Taxa Bruta de Mortalidade (óbitos/1.000 hab)"
          onPointClick={onAnoClick}
          selectedAno={selectedAno}
        />
      </div>

      {/* Ranking de municipios */}
      <RankingTable
        data={rankingMunicipios}
        columns={[
          { key: 'municipio', label: 'Municipio' },
          { key: 'regional', label: 'Regional' },
          { key: 'obitos', label: 'Obitos', align: 'right', format: 'number' },
          { key: 'taxa', label: 'Taxa/1000', align: 'right', format: 'decimal', decimals: 1 }
        ]}
        title="Ranking de Municipios por Obitos"
        defaultSort="obitos"
        pageSize={10}
        onRowClick={(row) => onMunicipioClick(row.cod_ibge, row.municipio)}
        selectedRow={selectedMunicipio}
      />
    </div>
  );
}

function MortalidadeTab({ data, geoData, geoMap, filters, onAnoClick, onMunicipioClick, selectedAno, selectedMunicipio }) {
  if (!data) return null;

  return (
    <div className="space-y-6">
      {/* Serie temporal */}
      <TimeSeriesChart
        data={data.porAno}
        metrics={['total', 'taxa_bruta']}
        title="Mortalidade por Ano"
        height={350}
        onPointClick={onAnoClick}
        selectedAno={selectedAno}
        referenceYear={2020}
      />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Mapa */}
        <MapChart
          geoData={geoData}
          data={data.porMunicipio}
          metric="taxa"
          title="Taxa de Mortalidade por Município"
          colorScale="obitos"
          formatValue={(v) => v?.toFixed(1) || '-'}
          onFeatureClick={onMunicipioClick}
          selectedFeature={selectedMunicipio}
        />

        {/* Piramide etaria de obitos (Registro Civil, estado) */}
        <PyramidChart
          data={data.piramideEtaria}
          title={`Pirâmide Etária de Óbitos (PR, ${data.metadata?.piramideAno || ''})`}
          height={400}
        />
      </div>

      {/* Ranking */}
      <RankingTable
        data={data.topMunicipios || []}
        columns={[
          { key: 'municipio', label: 'Municipio' },
          { key: 'regional', label: 'Regional' },
          { key: 'obitos', label: 'Obitos', align: 'right', format: 'number' },
          { key: 'taxa', label: 'Taxa/1000', align: 'right', format: 'decimal', decimals: 1 }
        ]}
        title="Ranking de Municipios por Mortalidade"
        defaultSort="obitos"
        pageSize={10}
        onRowClick={(row) => onMunicipioClick(row.cod_ibge, row.municipio)}
        selectedRow={selectedMunicipio}
      />
    </div>
  );
}

export default App;
