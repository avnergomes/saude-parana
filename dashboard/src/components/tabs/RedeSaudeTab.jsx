/**
 * Aba Rede de Saúde: estabelecimentos e leitos (CNES) e cobertura de planos
 * de saúde (ANS) para o recorte atual. O CNES é uma fotografia da
 * competência: o filtro de ano só vale para a série da ANS.
 */

import MapChart from '../MapChart';
import BarChart from '../BarChart';
import TimeSeriesChart from '../TimeSeriesChart';
import RankingTable from '../RankingTable';
import TabKpis from '../TabKpis';
import FonteNota from '../FonteNota';
import SemDados from './SemDados';
import { useRedeSaude, MAX_PONTOS } from '../../hooks/useRedeSaude';
import { formatDecimal } from '../../hooks/agregacoes';
import { formatNumber, formatPercent } from '../../utils/format';

const METRICAS_PLANOS = {
  taxa_cobertura: {
    label: 'Cobertura de planos (%)',
    color: '#0072B2',
    format: (v) => formatPercent(v, 1)
  }
};

const COLUNAS_RANKING = [
  { key: 'municipio', label: 'Município' },
  { key: 'regional', label: 'Regional' },
  { key: 'total', label: 'Estabelecimentos', align: 'right', format: 'number' },
  { key: 'leitos_sus', label: 'Leitos SUS', align: 'right', format: 'number' },
  { key: 'leitos_sus_por_mil', label: 'Leitos SUS/mil hab.', align: 'right', format: 'decimal', decimals: 2 },
  { key: 'cobertura_planos', label: 'Planos de saúde (%)', align: 'right', format: 'percent' }
];

const formatLeitosMil = (v) => formatDecimal(v, 2);
const formatCobertura = (v) => formatPercent(v, 1);

// "2025-08-01" ou "2025-08" -> "08/2025"
function formatCompetencia(valor) {
  const m = /^(\d{4})-(\d{2})/.exec(String(valor || ''));
  return m ? `${m[2]}/${m[1]}` : String(valor || '-');
}

function temSelecaoTerritorial(filters) {
  return Boolean(filters?.municipioCodigo || filters?.regional || filters?.mesorregiao);
}

function Destaques({ destaques, tipos }) {
  const principal = tipos?.[0];
  if (!destaques && !principal) return null;
  return (
    <p className="text-sm text-dark-600 px-1">
      {destaques && (
        <>
          <span className="font-medium text-dark-800">Maior oferta de leitos SUS por habitante:</span>
          {' '}{destaques.maior.municipio} ({formatLeitosMil(destaques.maior.leitos_sus_por_mil)}{' '}
          <span>por mil hab.</span>).{' '}
          <span className="font-medium text-dark-800">Menor:</span>
          {' '}{destaques.menor.municipio} ({formatLeitosMil(destaques.menor.leitos_sus_por_mil)}{' '}
          <span>por mil hab.</span>).{' '}
        </>
      )}
      {principal && (
        <>
          <span className="font-medium text-dark-800">Tipo mais frequente:</span>
          {' '}{principal.nome} ({principal.percentual}% <span>dos estabelecimentos</span>).
        </>
      )}
    </p>
  );
}

export default function RedeSaudeTab({
  dados,
  planos,
  geoData,
  geoError,
  onRetryGeo,
  geoMap,
  filters,
  onMunicipioClick,
  selectedMunicipio,
  mortalidade
}) {
  const rede = useRedeSaude(dados, planos, geoMap, filters, mortalidade);

  if (!dados) {
    return <SemDados fonte="CNES (DATASUS) e ANS" />;
  }

  const k = rede.kpis;
  const temPlanos = Boolean(planos);
  const selecao = temSelecaoTerritorial(filters);
  const handleRowClick = (row) => onMunicipioClick && onMunicipioClick(row.cod_ibge, row.municipio);

  const kpiItems = [
    {
      label: 'Estabelecimentos ativos',
      value: formatNumber(k.estabelecimentos),
      sublabel: <>{formatNumber(k.sus)} <span>atendem pelo SUS</span></>,
      tone: 'water'
    },
    {
      label: 'Leitos SUS',
      value: formatNumber(k.leitosSus),
      sublabel: <><span>de</span> {formatNumber(k.leitosTotal)} <span>leitos no total</span></>,
      tone: 'harvest'
    },
    {
      label: 'Leitos SUS por mil habitantes',
      value: formatLeitosMil(k.leitosSusPorMil),
      sublabel: 'população estimada IBGE',
      tone: 'secondary'
    },
    {
      label: 'Cobertura de planos de saúde',
      value: temPlanos ? formatCobertura(k.coberturaPlanos) : '-',
      sublabel: !temPlanos
        ? 'ANS indisponível'
        : rede.anoPlanos
          ? <><span>ANS, ano</span> {rede.anoPlanos}</>
          : 'beneficiários por 100 habitantes (ANS)',
      tone: 'forest'
    }
  ];

  return (
    <div className="space-y-6">
      <TabKpis items={kpiItems} />

      <Destaques destaques={rede.destaques} tipos={rede.tipos} />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <MapChart
          geoData={geoData}
          geoError={geoError}
          onRetryGeo={onRetryGeo}
          data={rede.rows}
          metric="leitos_sus_por_mil"
          title="Leitos SUS por mil habitantes e localização de hospitais e UPAs"
          colorScale="leitos"
          formatValue={formatLeitosMil}
          onFeatureClick={onMunicipioClick}
          selectedFeature={selectedMunicipio}
          points={rede.pontos}
        />

        <BarChart
          data={rede.tipos}
          dataKey="total"
          nameKey="nome"
          title="Estabelecimentos ativos por tipo de unidade"
          height={450}
          layout="horizontal"
          useRainbowColors={false}
        />
      </div>

      {rede.totalPontos > rede.pontos.length && (
        <p className="text-xs text-dark-400 px-1">
          <span>O mapa mostra as</span> {formatNumber(MAX_PONTOS)} <span>maiores unidades de um total de</span>
          {' '}{formatNumber(rede.totalPontos)}.
        </p>
      )}

      {temPlanos && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <MapChart
            geoData={geoData}
            geoError={geoError}
            onRetryGeo={onRetryGeo}
            data={rede.rows}
            metric="cobertura_planos"
            title="Cobertura de planos de saúde por município (%)"
            colorScale="cobertura"
            formatValue={formatCobertura}
            onFeatureClick={onMunicipioClick}
            selectedFeature={selectedMunicipio}
          />

          <TimeSeriesChart
            data={rede.seriePlanos}
            metrics={['taxa_cobertura']}
            metricConfig={METRICAS_PLANOS}
            xKey="periodo"
            title="Evolução da cobertura de planos de saúde no Paraná"
            height={450}
            footer={(
              <>
                <span>Série estadual (ANS), beneficiários por 100 habitantes.</span>
                {selecao && <> <span>O recorte territorial não altera esta curva.</span></>}
              </>
            )}
          />
        </div>
      )}

      <RankingTable
        data={rede.rows}
        columns={COLUNAS_RANKING}
        title="Ranking de municípios por leitos SUS"
        defaultSort="leitos_sus"
        pageSize={10}
        onRowClick={handleRowClick}
        selectedRow={selectedMunicipio}
      />

      <FonteNota metadata={dados.metadata}>
        <p>
          <span>O filtro de ano não se aplica ao CNES: os dados são a fotografia de uma competência.</span>
          {' '}<span>Competência dos estabelecimentos:</span> {formatCompetencia(dados.metadata?.competenciaCnes)}.
          {' '}<span>Competência dos leitos:</span> {formatCompetencia(dados.metadata?.competenciaLeitos)}.
        </p>
      </FonteNota>

      {temPlanos && planos.metadata && <FonteNota metadata={planos.metadata} />}
    </div>
  );
}
