/**
 * Aba Mortalidade: série anual, mapa, pirâmide etária de óbitos (IBGE,
 * Registro Civil) e causas de óbito por capítulo CID-10 (SIM/DATASUS).
 */

import MapChart from '../MapChart';
import TimeSeriesChart from '../TimeSeriesChart';
import PyramidChart from '../PyramidChart';
import RankingTable from '../RankingTable';
import CausasCidPanel from './CausasCidPanel';

const COLUNAS_RANKING = [
  { key: 'municipio', label: 'Municipio' },
  { key: 'regional', label: 'Regional' },
  { key: 'obitos', label: 'Obitos', align: 'right', format: 'number' },
  { key: 'taxa', label: 'Taxa/1000', align: 'right', format: 'decimal', decimals: 1 }
];

export default function MortalidadeTab({
  data,
  mortalidadeCid,
  geoData,
  geoError,
  onRetryGeo,
  geoMap,
  filters,
  onAnoClick,
  onMunicipioClick,
  selectedAno,
  selectedMunicipio
}) {
  if (!data) return null;

  return (
    <div className="space-y-6">
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
        <MapChart
          geoData={geoData}
          geoError={geoError}
          onRetryGeo={onRetryGeo}
          data={data.porMunicipio}
          metric="taxa"
          title="Taxa de Mortalidade por Município"
          colorScale="obitos"
          formatValue={(v) => v?.toFixed(1) || '-'}
          onFeatureClick={onMunicipioClick}
          selectedFeature={selectedMunicipio}
        />

        {/* Pirâmide etária de óbitos (Registro Civil, estado) */}
        <PyramidChart
          data={data.piramideEtaria}
          title={`Pirâmide Etária de Óbitos (PR, ${data.metadata?.piramideAno || ''})`}
          height={400}
        />
      </div>

      <RankingTable
        data={data.topMunicipios || []}
        columns={COLUNAS_RANKING}
        title="Ranking de Municipios por Mortalidade"
        defaultSort="obitos"
        pageSize={10}
        onRowClick={(row) => onMunicipioClick(row.cod_ibge, row.municipio)}
        selectedRow={selectedMunicipio}
      />

      {/* Causas de óbito por capítulo CID-10 (SIM/DATASUS, por residência) */}
      <CausasCidPanel dados={mortalidadeCid} geoMap={geoMap} filters={filters} />
    </div>
  );
}
