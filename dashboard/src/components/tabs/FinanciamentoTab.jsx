/**
 * Aba Financiamento: indicadores do SIOPS (despesa com saúde por habitante,
 * percentual das receitas próprias aplicado em saúde e transferências SUS
 * por habitante). Séries anuais são estaduais; KPIs, mapas e ranking seguem
 * o recorte territorial no ano de referência do arquivo.
 */

import MapChart from '../MapChart';
import TimeSeriesChart from '../TimeSeriesChart';
import RankingTable from '../RankingTable';
import TabKpis from '../TabKpis';
import FonteNota from '../FonteNota';
import SemDados from './SemDados';
import { useFinanciamento, formatReais, MINIMO_EC29 } from '../../hooks/useFinanciamento';
import { formatNumber, formatPercent } from '../../utils/format';

// Cor por indicador, estável em todos os gráficos: teal para despesa
// (mesma família da escala 'repasse' do mapa), azul-rio para o percentual.
const METRICAS = {
  despesa_saude_hab: {
    label: 'Despesa com saúde por habitante',
    color: '#0d9488',
    format: (v) => formatReais(v)
  },
  pct_receita_propria: {
    label: 'Receitas próprias aplicadas em saúde',
    color: '#2d5f7f',
    format: (v) => formatPercent(v, 1)
  },
  transf_sus_hab: {
    label: 'Transferências SUS por habitante',
    color: '#0072B2',
    format: (v) => formatReais(v)
  }
};

const formatPct = (v) => formatPercent(v, 1);
const formatMoeda = (v) => formatReais(v);

const COLUNAS_RANKING = [
  { key: 'municipio', label: 'Município' },
  { key: 'regional', label: 'Regional' },
  { key: 'despesa_saude_hab', label: 'Despesa/hab.', align: 'right', render: formatMoeda },
  { key: 'pct_receita_propria', label: 'Receita própria (%)', align: 'right', format: 'percent' },
  { key: 'transf_sus_hab', label: 'Transf. SUS/hab.', align: 'right', render: formatMoeda }
];

function rotuloEscopo(kpis) {
  if (kpis.escopo !== 'selecao') return 'média estadual';
  return kpis.ponderado ? 'média ponderada pela população' : 'média simples dos municípios';
}

function Destaques({ destaques }) {
  if (!destaques) return null;
  return (
    <p className="text-sm text-dark-600 px-1">
      <span className="font-medium text-dark-800">Maior despesa com saúde por habitante:</span>
      {' '}{destaques.maior.municipio} ({formatMoeda(destaques.maior.despesa_saude_hab)}).{' '}
      <span className="font-medium text-dark-800">Menor:</span>
      {' '}{destaques.menor.municipio} ({formatMoeda(destaques.menor.despesa_saude_hab)}).
    </p>
  );
}

function RodapeSerie({ temSelecao }) {
  return (
    <>
      <span>Série estadual (SIOPS).</span>
      {temSelecao && <> <span>O recorte territorial não altera esta curva.</span></>}
    </>
  );
}

export default function FinanciamentoTab({
  dados,
  geoData,
  geoError,
  onRetryGeo,
  geoMap,
  filters,
  onAnoClick,
  onMunicipioClick,
  selectedAno,
  selectedMunicipio,
  mortalidade
}) {
  const fin = useFinanciamento(dados, geoMap, filters, mortalidade);

  if (!dados) {
    return <SemDados fonte="SIOPS (Ministério da Saúde)" />;
  }

  const k = fin.kpis;
  const abaixoMinimo = k.pctReceitaPropria != null && k.pctReceitaPropria < MINIMO_EC29;
  const handleRowClick = (row) => onMunicipioClick && onMunicipioClick(row.cod_ibge, row.municipio);

  const kpiItems = [
    {
      label: 'Despesa com saúde por habitante',
      value: formatMoeda(k.despesaHab),
      sublabel: rotuloEscopo(k),
      tone: 'water'
    },
    {
      label: 'Receitas próprias aplicadas em saúde',
      value: formatPct(k.pctReceitaPropria),
      sublabel: (
        <>
          <span>mínimo constitucional de 15%;</span> {formatNumber(k.abaixoMinimo)}{' '}
          <span>municípios abaixo</span>
        </>
      ),
      tone: abaixoMinimo ? 'health' : 'forest'
    },
    {
      label: 'Transferências SUS por habitante',
      value: formatMoeda(k.transfSusHab),
      sublabel: 'transferências recebidas do SUS',
      tone: 'secondary'
    },
    {
      label: 'Ano de referência',
      value: k.ano ?? '-',
      sublabel: <>{formatNumber(k.municipios)} <span>municípios no recorte</span></>,
      tone: 'harvest'
    }
  ];

  return (
    <div className="space-y-6">
      <TabKpis items={kpiItems} />

      <Destaques destaques={fin.destaques} />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <TimeSeriesChart
          data={fin.serie}
          metrics={['despesa_saude_hab']}
          metricConfig={METRICAS}
          title="Despesa municipal com saúde por habitante, ano a ano"
          onPointClick={onAnoClick}
          selectedAno={selectedAno}
          footer={<RodapeSerie temSelecao={fin.temSelecao} />}
        />

        <TimeSeriesChart
          data={fin.serie}
          metrics={['pct_receita_propria']}
          metricConfig={METRICAS}
          title="Receitas próprias aplicadas em saúde: mínimo constitucional de 15%"
          onPointClick={onAnoClick}
          selectedAno={selectedAno}
          footer={<RodapeSerie temSelecao={fin.temSelecao} />}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <MapChart
          geoData={geoData}
          geoError={geoError}
          onRetryGeo={onRetryGeo}
          data={fin.rows}
          metric="despesa_saude_hab"
          title="Despesa com saúde por habitante, por município"
          colorScale="repasse"
          formatValue={formatMoeda}
          onFeatureClick={onMunicipioClick}
          selectedFeature={selectedMunicipio}
        />

        <MapChart
          geoData={geoData}
          geoError={geoError}
          onRetryGeo={onRetryGeo}
          data={fin.rows}
          metric="pct_receita_propria"
          title="Receitas próprias aplicadas em saúde, por município (%)"
          colorScale="default"
          formatValue={formatPct}
          onFeatureClick={onMunicipioClick}
          selectedFeature={selectedMunicipio}
        />
      </div>

      <RankingTable
        data={fin.rows}
        columns={COLUNAS_RANKING}
        title="Ranking de municípios por despesa com saúde por habitante"
        defaultSort="despesa_saude_hab"
        pageSize={10}
        onRowClick={handleRowClick}
        selectedRow={selectedMunicipio}
      />

      <FonteNota metadata={dados.metadata}>
        <p>
          <span>Os valores do SIOPS são declarados pelos próprios municípios e podem ser retificados.</span>
          {' '}<span>O percentual de receitas próprias segue a apuração da EC 29 (mínimo de 15%).</span>
          {' '}<span>Mapas e ranking referem-se ao ano de referência</span> {fin.anoReferencia ?? '-'}.
        </p>
      </FonteNota>
    </div>
  );
}
