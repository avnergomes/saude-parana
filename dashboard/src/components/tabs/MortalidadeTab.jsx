/**
 * Aba Mortalidade: série anual, mapa, pirâmide etária de óbitos (IBGE,
 * Registro Civil) e causas de óbito por capítulo CID-10 (SIM/DATASUS).
 */

import MapChart from '../MapChart';
import TimeSeriesChart from '../TimeSeriesChart';
import PyramidChart from '../PyramidChart';
import RankingTable from '../RankingTable';
import CausasCidPanel from './CausasCidPanel';
import { formatDecimal } from '../../utils/format';
import { sufixoAno } from '../../utils/filtros';

const COLUNAS_RANKING = [
  { key: 'municipio', label: 'Município' },
  { key: 'regional', label: 'Regional' },
  { key: 'obitos', label: 'Óbitos', align: 'right', format: 'number' },
  { key: 'taxa', label: 'Taxa/1.000', align: 'right', format: 'decimal', decimals: 1 }
];

export default function MortalidadeTab({
  data,
  mortalidadeCid,
  carregando = false,
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
      {/* Total e taxa em gráficos separados: no mesmo eixo a taxa (~7) ficava
          colada no zero ao lado do total (~90 mil) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <TimeSeriesChart
          data={data.porAno}
          metrics={['total']}
          title="Óbitos por ano"
          onPointClick={onAnoClick}
          selectedAno={selectedAno}
          referenceYear={2020}
        />
        <TimeSeriesChart
          data={data.porAno}
          metrics={['taxa_bruta']}
          title="Taxa bruta de mortalidade (óbitos/1.000 hab)"
          onPointClick={onAnoClick}
          selectedAno={selectedAno}
          referenceYear={2020}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <MapChart
          geoData={geoData}
          geoError={geoError}
          onRetryGeo={onRetryGeo}
          data={data.porMunicipio}
          metric="taxa"
          title={`Taxa de Mortalidade por Município${sufixoAno(data.anoMunicipios)}`}
          colorScale="obitos"
          formatValue={(v) => formatDecimal(v, 1)}
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
        title={`Ranking de Municípios por Mortalidade${sufixoAno(data.anoMunicipios)}`}
        defaultSort="obitos"
        pageSize={10}
        onRowClick={(row) => onMunicipioClick(row.cod_ibge, row.municipio)}
        selectedRow={selectedMunicipio}
      />

      {/* Causas de óbito por capítulo CID-10 (SIM/DATASUS, por residência) */}
      <CausasCidPanel
        dados={mortalidadeCid}
        carregando={carregando}
        geoMap={geoMap}
        filters={filters}
      />
    </div>
  );
}
