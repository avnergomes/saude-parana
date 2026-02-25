import { useState, useCallback, useMemo } from 'react';
import {
  useData,
  useAggregations,
  useAvailableYears,
  useFilteredMortalidade,
  useFilteredInternacoes,
  useFilteredVacinacao,
  useFilteredEstabelecimentos,
  useFilteredRepassesSus
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
import BarChart from './components/BarChart';
import PyramidChart from './components/PyramidChart';
import MapChart from './components/MapChart';
import RankingTable from './components/RankingTable';
import TreemapChart from './components/TreemapChart';
import SankeyChart from './components/SankeyChart';
import SunburstChart from './components/SunburstChart';
import { formatNumber, formatCurrency, formatPercent } from './utils/format';

function App() {
  // Carregar dados
  const {
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
    capitulo: null,
    causa: null,
    vacina: null,
    grupoDiagnostico: null,
    municipio: null
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
  const filteredInternacoes = useFilteredInternacoes(internacoes, mergedFilters, geoMap);
  const filteredVacinacao = useFilteredVacinacao(vacinacao, mergedFilters, geoMap);
  const filteredEstabelecimentos = useFilteredEstabelecimentos(estabelecimentos, mergedFilters, geoMap);
  const filteredRepassesSus = useFilteredRepassesSus(repassesSus, mergedFilters, geoMap);

  // KPIs agregados (com filtros aplicados)
  const kpis = useAggregations(
    { mortalidade, internacoes, vacinacao, estabelecimentos, repassesSus },
    mergedFilters,
    geoMap
  );

  // Handlers de filtros interativos
  const handleAnoClick = useCallback((ano) => {
    setInteractiveFilters(prev => ({
      ...prev,
      ano: prev.ano === ano ? null : ano
    }));
  }, []);

  const handleCapituloClick = useCallback((capitulo) => {
    setInteractiveFilters(prev => ({
      ...prev,
      capitulo: prev.capitulo === capitulo ? null : capitulo
    }));
  }, []);

  const handleVacinaClick = useCallback((vacina) => {
    setInteractiveFilters(prev => ({
      ...prev,
      vacina: prev.vacina === vacina ? null : vacina
    }));
  }, []);

  const handleGrupoClick = useCallback((grupo) => {
    setInteractiveFilters(prev => ({
      ...prev,
      grupoDiagnostico: prev.grupoDiagnostico === grupo ? null : grupo
    }));
  }, []);

  const handleMunicipioClick = useCallback((codIbge, nome) => {
    setInteractiveFilters(prev => ({
      ...prev,
      municipio: prev.municipio === codIbge ? null : codIbge
    }));
  }, []);

  const clearInteractiveFilters = useCallback(() => {
    setInteractiveFilters({
      ano: null,
      capitulo: null,
      causa: null,
      vacina: null,
      grupoDiagnostico: null,
      municipio: null
    });
  }, []);

  const removeInteractiveFilter = useCallback((key) => {
    setInteractiveFilters(prev => ({
      ...prev,
      [key]: null
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
          internacoes={filteredInternacoes}
          vacinacao={filteredVacinacao}
          geoData={geoData}
          geoMap={geoMap}
          filters={mergedFilters}
          onAnoClick={handleAnoClick}
          onMunicipioClick={handleMunicipioClick}
          selectedAno={interactiveFilters.ano}
          selectedMunicipio={interactiveFilters.municipio}
        />;
      case 'mortalidade':
        return <MortalidadeTab
          data={filteredMortalidade}
          geoData={geoData}
          geoMap={geoMap}
          filters={mergedFilters}
          onAnoClick={handleAnoClick}
          onCapituloClick={handleCapituloClick}
          onMunicipioClick={handleMunicipioClick}
          selectedAno={interactiveFilters.ano}
          selectedCapitulo={interactiveFilters.capitulo}
          selectedMunicipio={interactiveFilters.municipio}
        />;
      case 'internacoes':
        return <InternacoesTab
          data={filteredInternacoes}
          geoData={geoData}
          geoMap={geoMap}
          filters={mergedFilters}
          onAnoClick={handleAnoClick}
          onGrupoClick={handleGrupoClick}
          onMunicipioClick={handleMunicipioClick}
          selectedAno={interactiveFilters.ano}
          selectedGrupo={interactiveFilters.grupoDiagnostico}
          selectedMunicipio={interactiveFilters.municipio}
        />;
      case 'vacinacao':
        return <VacinacaoTab
          data={filteredVacinacao}
          geoData={geoData}
          geoMap={geoMap}
          filters={mergedFilters}
          onVacinaClick={handleVacinaClick}
          onMunicipioClick={handleMunicipioClick}
          selectedVacina={interactiveFilters.vacina}
          selectedMunicipio={interactiveFilters.municipio}
        />;
      case 'infraestrutura':
        return <InfraestruturaTab
          data={filteredEstabelecimentos}
          geoData={geoData}
          geoMap={geoMap}
          filters={mergedFilters}
          onMunicipioClick={handleMunicipioClick}
          selectedMunicipio={interactiveFilters.municipio}
        />;
      case 'financiamento':
        return <FinanciamentoTab
          data={filteredRepassesSus}
          indicadores={indicadoresAb}
          geoData={geoData}
          geoMap={geoMap}
          filters={mergedFilters}
          onAnoClick={handleAnoClick}
          onMunicipioClick={handleMunicipioClick}
          selectedAno={interactiveFilters.ano}
          selectedMunicipio={interactiveFilters.municipio}
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

function VisaoGeralTab({ mortalidade, internacoes, vacinacao, geoData, geoMap, filters, onAnoClick, onMunicipioClick, selectedAno, selectedMunicipio }) {
  // Dados já vêm filtrados
  const mapData = mortalidade?.porMunicipio || [];
  const serieTemporalMortalidade = mortalidade?.porAno || [];
  const serieTemporalInternacoes = internacoes?.porAno || [];
  const rankingMunicipios = mortalidade?.topMunicipios || [];

  return (
    <div className="space-y-6">
      {/* Mapa + Serie temporal */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <MapChart
          geoData={geoData}
          data={mapData}
          metric="taxa"
          title="Taxa de Mortalidade por Municipio (por 1.000 hab)"
          colorScale="obitos"
          formatValue={(v) => v?.toFixed(1) || '-'}
          onFeatureClick={onMunicipioClick}
          selectedFeature={selectedMunicipio}
        />

        <TimeSeriesChart
          data={serieTemporalMortalidade}
          metrics={['total']}
          title="Evolucao da Mortalidade"
          onPointClick={onAnoClick}
          selectedAno={selectedAno}
          referenceYear={2020}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Treemap de causas */}
        <TreemapChart
          data={mortalidade?.porCapitulo}
          valueKey="total"
          nameKey="nome"
          colorKey="cor"
          title="Causas de Obito (CID-10)"
          height={350}
        />

        {/* Serie temporal de internacoes */}
        <TimeSeriesChart
          data={serieTemporalInternacoes}
          metrics={['internacoes']}
          title="Evolucao das Internacoes SUS"
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

function MortalidadeTab({ data, geoData, geoMap, filters, onAnoClick, onCapituloClick, onMunicipioClick, selectedAno, selectedCapitulo, selectedMunicipio }) {
  if (!data) return null;

  // Preparar hierarquia para Sunburst
  const sunburstData = useMemo(() => {
    if (!data.porCapitulo) return null;

    return {
      name: 'Obitos',
      children: data.porCapitulo.map(cap => ({
        name: cap.nome,
        value: cap.total,
        color: cap.cor,
        codigo: cap.capitulo
      }))
    };
  }, [data.porCapitulo]);

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
          title="Taxa de Mortalidade por Municipio"
          colorScale="obitos"
          formatValue={(v) => v?.toFixed(1) || '-'}
          onFeatureClick={onMunicipioClick}
          selectedFeature={selectedMunicipio}
        />

        {/* Piramide etaria */}
        <PyramidChart
          data={data.piramideEtaria?.['2023']}
          title="Piramide Etaria de Obitos (2023)"
          height={400}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Treemap de causas */}
        <TreemapChart
          data={data.porCapitulo}
          valueKey="total"
          nameKey="nome"
          colorKey="cor"
          title="Obitos por Capitulo CID-10"
          height={400}
          onItemClick={onCapituloClick}
          selectedItem={selectedCapitulo}
        />

        {/* Sunburst */}
        <SunburstChart
          data={sunburstData}
          title="Hierarquia de Causas de Obito"
          height={400}
          onArcClick={(d) => onCapituloClick(d.codigo)}
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

function InternacoesTab({ data, geoData, geoMap, filters, onAnoClick, onGrupoClick, onMunicipioClick, selectedAno, selectedGrupo, selectedMunicipio }) {
  if (!data) return null;

  return (
    <div className="space-y-6">
      {/* Serie temporal */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <TimeSeriesChart
          data={data.porAno}
          metrics={['internacoes']}
          title="Internacoes por Ano"
          onPointClick={onAnoClick}
          selectedAno={selectedAno}
        />

        <TimeSeriesChart
          data={data.porAno}
          metrics={['valor_sus']}
          title="Valor SUS por Ano"
          onPointClick={onAnoClick}
          selectedAno={selectedAno}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Treemap de diagnosticos */}
        <TreemapChart
          data={data.porGrupoDiagnostico}
          valueKey="internacoes"
          nameKey="grupo"
          title="Internacoes por Grupo de Diagnostico"
          height={400}
          onItemClick={(codigo, nome) => onGrupoClick(nome)}
          selectedItem={selectedGrupo}
        />

        {/* Grupos de diagnostico */}
        <BarChart
          data={data.porGrupoDiagnostico}
          dataKey="valor_sus"
          nameKey="grupo"
          title="Valor SUS por Diagnostico"
          layout="horizontal"
          height={400}
        />
      </div>

      {/* Ranking de municipios */}
      <RankingTable
        data={data.porMunicipio?.slice(0, 20) || []}
        columns={[
          { key: 'municipio', label: 'Municipio' },
          { key: 'regional', label: 'Regional' },
          { key: 'internacoes', label: 'Internacoes', align: 'right', format: 'number' },
          { key: 'valor_sus', label: 'Valor SUS', align: 'right', format: 'currency' }
        ]}
        title="Ranking de Municipios por Internacoes"
        defaultSort="internacoes"
        pageSize={10}
        onRowClick={(row) => onMunicipioClick(row.cod_ibge, row.municipio)}
        selectedRow={selectedMunicipio}
      />
    </div>
  );
}

function VacinacaoTab({ data, geoData, geoMap, filters, onVacinaClick, onMunicipioClick, selectedVacina, selectedMunicipio }) {
  if (!data) return null;

  const ultimoAno = data.coberturaPorAno?.[data.coberturaPorAno.length - 1];

  // Cobertura do ultimo ano por vacina
  const coberturaAtual = data.vacinas?.map(v => ({
    nome: v.nome,
    codigo: v.codigo,
    cobertura: ultimoAno?.[v.codigo] || 0,
    meta: v.meta,
    cor: v.cor,
    atingiuMeta: (ultimoAno?.[v.codigo] || 0) >= v.meta
  })).filter(v => v.codigo !== 'COVID');

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Cobertura atual por vacina */}
        <BarChart
          data={coberturaAtual}
          dataKey="cobertura"
          nameKey="nome"
          title={`Cobertura Vacinal Infantil (${ultimoAno?.ano || 2024})`}
          layout="horizontal"
          height={350}
          showPercentage
          onBarClick={(nome) => {
            const vac = data.vacinas.find(v => v.nome === nome);
            if (vac) onVacinaClick(vac.codigo);
          }}
          selectedItem={selectedVacina ? data.vacinas.find(v => v.codigo === selectedVacina)?.nome : null}
        />

        {/* Treemap de cobertura */}
        <TreemapChart
          data={coberturaAtual?.map(v => ({
            ...v,
            total: v.cobertura
          }))}
          valueKey="total"
          nameKey="nome"
          colorKey="cor"
          title="Cobertura Vacinal"
          height={350}
          showPercentage
        />
      </div>

      {/* Alertas de baixa cobertura */}
      <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
        <h3 className="font-semibold text-amber-800 mb-2">Vacinas abaixo da meta</h3>
        <div className="flex flex-wrap gap-2">
          {coberturaAtual?.filter(v => !v.atingiuMeta).map(v => (
            <span
              key={v.codigo}
              className="px-3 py-1 bg-amber-100 text-amber-800 rounded-full text-sm cursor-pointer hover:bg-amber-200 transition-colors"
              onClick={() => onVacinaClick(v.codigo)}
            >
              {v.nome}: {v.cobertura.toFixed(1)}% (meta: {v.meta}%)
            </span>
          ))}
        </div>
      </div>

      {/* Ranking de municipios */}
      <RankingTable
        data={data.porMunicipio?.slice(0, 20) || []}
        columns={[
          { key: 'municipio', label: 'Municipio' },
          { key: 'regional', label: 'Regional' },
          { key: 'coberturaMedia', label: 'Cobertura Media', align: 'right', format: 'decimal', decimals: 1 }
        ]}
        title="Ranking de Municipios por Cobertura Vacinal"
        defaultSort="coberturaMedia"
        pageSize={10}
        onRowClick={(row) => onMunicipioClick(row.cod_ibge, row.municipio)}
        selectedRow={selectedMunicipio}
      />
    </div>
  );
}

function InfraestruturaTab({ data, geoData, geoMap, filters, onMunicipioClick, selectedMunicipio }) {
  if (!data) return null;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Treemap de tipos */}
        <TreemapChart
          data={data.tiposEstabelecimento}
          valueKey="quantidade"
          nameKey="tipo"
          colorKey="cor"
          title="Estabelecimentos por Tipo"
          height={400}
        />

        {/* Tipos de estabelecimento */}
        <BarChart
          data={data.tiposEstabelecimento}
          dataKey="quantidade"
          nameKey="tipo"
          title="Estabelecimentos de Saude por Tipo"
          layout="horizontal"
          height={400}
        />
      </div>

      {/* Info cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white rounded-xl shadow-card p-6 text-center">
          <p className="text-3xl font-display font-bold text-water-600">
            {data.metadata?.totalEstabelecimentos?.toLocaleString('pt-BR') || '-'}
          </p>
          <p className="text-dark-600 mt-1">Estabelecimentos Ativos</p>
        </div>
        <div className="bg-white rounded-xl shadow-card p-6 text-center">
          <p className="text-3xl font-display font-bold text-forest-600">
            {data.metadata?.totalLeitosSUS?.toLocaleString('pt-BR') || '-'}
          </p>
          <p className="text-dark-600 mt-1">Leitos SUS</p>
        </div>
        <div className="bg-white rounded-xl shadow-card p-6 text-center">
          <p className="text-3xl font-display font-bold text-secondary-600">
            {data.porMunicipio?.length || '-'}
          </p>
          <p className="text-dark-600 mt-1">Municipios</p>
        </div>
      </div>

      {/* Ranking de municipios */}
      <RankingTable
        data={data.porMunicipio?.slice(0, 20) || []}
        columns={[
          { key: 'municipio', label: 'Municipio' },
          { key: 'regional', label: 'Regional' },
          { key: 'total', label: 'Estabelecimentos', align: 'right', format: 'number' },
          { key: 'leitos_sus', label: 'Leitos SUS', align: 'right', format: 'number' }
        ]}
        title="Ranking de Municipios por Estabelecimentos"
        defaultSort="total"
        pageSize={10}
        onRowClick={(row) => onMunicipioClick(row.cod_ibge, row.municipio)}
        selectedRow={selectedMunicipio}
      />
    </div>
  );
}

function FinanciamentoTab({ data, indicadores, geoData, geoMap, filters, onAnoClick, onMunicipioClick, selectedAno, selectedMunicipio }) {
  if (!data) return null;

  // Preparar dados para Sankey
  const sankeyData = useMemo(() => {
    if (!data.blocos || !data.porAno?.length) return { nodes: [], links: [] };

    const ultimoAno = data.porAno[data.porAno.length - 1];

    const nodes = [
      { id: 'FNS', name: 'FNS', level: 0, color: '#0ea5e9', value: ultimoAno.total },
      ...data.blocos.map(b => ({
        id: b.codigo,
        name: b.nome,
        level: 1,
        color: b.cor,
        value: ultimoAno[b.codigo] || 0
      }))
    ];

    const links = data.blocos.map(b => ({
      source: 'FNS',
      target: b.codigo,
      value: ultimoAno[b.codigo] || 0
    }));

    return { nodes, links };
  }, [data]);

  return (
    <div className="space-y-6">
      {/* Serie temporal de repasses */}
      <TimeSeriesChart
        data={data.porAno?.map(item => ({
          ano: item.ano,
          total: item.total
        }))}
        metrics={['total']}
        title="Evolucao dos Repasses SUS"
        height={350}
        onPointClick={onAnoClick}
        selectedAno={selectedAno}
      />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Sankey de repasses */}
        <SankeyChart
          nodes={sankeyData.nodes}
          links={sankeyData.links}
          title="Fluxo de Repasses SUS por Bloco"
          height={400}
          formatValue={formatCurrency}
        />

        {/* Composicao por bloco */}
        <TreemapChart
          data={data.blocos?.map(b => {
            const ultimoAno = data.porAno?.[data.porAno.length - 1];
            return {
              ...b,
              total: ultimoAno?.[b.codigo] || 0
            };
          })}
          valueKey="total"
          nameKey="nome"
          colorKey="cor"
          title={`Composicao por Bloco (${data.porAno?.[data.porAno.length - 1]?.ano || 2024})`}
          height={400}
        />
      </div>

      {/* Indicadores Previne Brasil */}
      {indicadores && (
        <div className="bg-white rounded-xl shadow-card p-6">
          <h3 className="font-display font-semibold text-dark-900 mb-4">
            Indicadores Previne Brasil
          </h3>
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-4">
            {indicadores.indicadores?.map(ind => {
              const ultimo = indicadores.porQuadrimestre?.[indicadores.porQuadrimestre.length - 1];
              const resultado = ultimo?.[ind.codigo] || 0;
              const atingiuMeta = resultado >= ind.meta;

              return (
                <div
                  key={ind.codigo}
                  className={`p-3 rounded-lg text-center ${
                    atingiuMeta ? 'bg-green-50' : 'bg-amber-50'
                  }`}
                >
                  <p className={`text-lg font-bold ${
                    atingiuMeta ? 'text-green-600' : 'text-amber-600'
                  }`}>
                    {resultado.toFixed(0)}%
                  </p>
                  <p className="text-xs text-dark-600 mt-1 line-clamp-2">
                    {ind.nome}
                  </p>
                  <p className="text-xs text-dark-400">
                    Meta: {ind.meta}%
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Ranking de municipios */}
      <RankingTable
        data={data.porMunicipio?.slice(0, 20) || []}
        columns={[
          { key: 'municipio', label: 'Municipio' },
          { key: 'regional', label: 'Regional' },
          { key: 'total', label: 'Total Repasses', align: 'right', format: 'currency' },
          { key: 'per_capita', label: 'Per Capita', align: 'right', format: 'currency' }
        ]}
        title="Ranking de Municipios por Repasses SUS"
        defaultSort="total"
        pageSize={10}
        onRowClick={(row) => onMunicipioClick(row.cod_ibge, row.municipio)}
        selectedRow={selectedMunicipio}
      />
    </div>
  );
}

export default App;
