/**
 * Aba Visão Geral: mapa da taxa de mortalidade, séries de óbitos, nascidos
 * vivos registrados e taxa bruta, e ranking municipal (IBGE, Registro Civil).
 */

import MapChart from '../MapChart';
import TimeSeriesChart from '../TimeSeriesChart';
import RankingTable from '../RankingTable';

const COLUNAS_RANKING = [
  { key: 'municipio', label: 'Municipio' },
  { key: 'regional', label: 'Regional' },
  { key: 'obitos', label: 'Obitos', align: 'right', format: 'number' },
  { key: 'taxa', label: 'Taxa/1000', align: 'right', format: 'decimal', decimals: 1 }
];

export default function VisaoGeralTab({
  mortalidade,
  geoData,
  geoError,
  onRetryGeo,
  onAnoClick,
  onMunicipioClick,
  selectedAno,
  selectedMunicipio
}) {
  // Dados já vêm filtrados pelo hook useFilteredMortalidade
  const mapData = mortalidade?.porMunicipio || [];
  const serieTemporalMortalidade = mortalidade?.porAno || [];
  const nascidosPorAno = mortalidade?.nascidosPorAno || [];
  const rankingMunicipios = mortalidade?.topMunicipios || [];

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <MapChart
          geoData={geoData}
          geoError={geoError}
          onRetryGeo={onRetryGeo}
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
        <TimeSeriesChart
          data={nascidosPorAno}
          metrics={['total']}
          title="Nascidos Vivos Registrados por Ano"
          onPointClick={onAnoClick}
          selectedAno={selectedAno}
        />

        <TimeSeriesChart
          data={serieTemporalMortalidade}
          metrics={['taxa_bruta']}
          title="Taxa Bruta de Mortalidade (óbitos/1.000 hab)"
          onPointClick={onAnoClick}
          selectedAno={selectedAno}
        />
      </div>

      <RankingTable
        data={rankingMunicipios}
        columns={COLUNAS_RANKING}
        title="Ranking de Municipios por Obitos"
        defaultSort="obitos"
        pageSize={10}
        onRowClick={(row) => onMunicipioClick(row.cod_ibge, row.municipio)}
        selectedRow={selectedMunicipio}
      />
    </div>
  );
}
