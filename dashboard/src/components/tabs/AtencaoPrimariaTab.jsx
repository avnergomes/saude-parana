/**
 * Aba "Atenção Primária": cobertura potencial da APS (e-Gestor/MS).
 *
 * Recebe `dados` = atencao_primaria.json (pode ser nulo enquanto a ETL não
 * roda), a malha municipal, o geoMap e os filtros compartilhados do painel.
 * A série mensal é estadual; KPIs, série anual, mapa e ranking respeitam
 * o território selecionado.
 */

import TabKpis from '../TabKpis';
import TimeSeriesChart from '../TimeSeriesChart';
import MapChart from '../MapChart';
import RankingTable from '../RankingTable';
import FonteNota from '../FonteNota';
import { formatNumber, formatPercent } from '../../utils/format';
import { useAtencaoPrimaria } from '../../hooks/useAtencaoPrimaria';

// Acento único da aba (water-600); o restante do cartão fica em cinza.
const COR_COBERTURA = '#2d5f7f';

const METRICAS = {
  cobertura: {
    label: 'Cobertura potencial',
    color: COR_COBERTURA,
    format: (v) => formatPercent(v, 1)
  }
};

// "2026-07" -> "07/2026" (mantém o texto original se o formato divergir)
function formatCompetencia(competencia) {
  const m = /^(\d{4})-(\d{2})$/.exec(String(competencia || ''));
  return m ? `${m[2]}/${m[1]}` : String(competencia || '-');
}

// Inteiro no padrão pt-BR (sem abreviar em "mil"), "-" para nulo
function formatInteiro(valor) {
  if (valor === null || valor === undefined || isNaN(valor)) return '-';
  return Math.round(valor).toLocaleString('pt-BR');
}

function PainelIndisponivel() {
  return (
    <div className="bg-white rounded-xl shadow-card p-6 text-center">
      <h3 className="font-display font-semibold text-dark-900 mb-2">
        Dados ainda não disponíveis para este painel
      </h3>
      <p className="text-sm text-dark-500">
        A base de cobertura da Atenção Primária (e-Gestor/MS) ainda não foi processada. Gere o arquivo de dados e recarregue a página.
      </p>
    </div>
  );
}

function AtencaoPrimariaTab({
  dados,
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
  const aps = useAtencaoPrimaria(dados, geoMap, filters);

  if (!aps.disponivel) return <PainelIndisponivel />;

  const { resumo, serieMensal, serieAnual, ranking, selecaoAtiva, competencia } = aps;

  const kpis = [
    {
      label: 'Cobertura potencial da APS',
      value: formatPercent(resumo.cobertura, 1),
      sublabel: 'média ponderada pela população',
      tone: 'water'
    },
    {
      label: 'Equipes ESF',
      value: formatInteiro(resumo.esf),
      sublabel: 'Estratégia Saúde da Família',
      tone: 'forest'
    },
    {
      label: 'População coberta',
      value: formatNumber(resumo.populacaoCoberta),
      sublabel: 'capacidade das equipes, limitada à população',
      tone: 'secondary'
    },
    {
      label: 'Competência',
      value: formatCompetencia(competencia),
      sublabel: 'último mês disponível',
      tone: 'harvest'
    }
  ];

  const rodapeMensal = selecaoAtiva
    ? 'Série estadual: não muda com o território selecionado.'
    : null;

  return (
    <div className="space-y-6">
      <TabKpis items={kpis} />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <MapChart
          geoData={geoData}
          geoError={geoError}
          onRetryGeo={onRetryGeo}
          data={ranking}
          metric="cobertura"
          title="Cobertura potencial da APS por município"
          colorScale="cobertura"
          formatValue={(v) => formatPercent(v, 1)}
          onFeatureClick={onMunicipioClick}
          selectedFeature={selectedMunicipio}
        />

        <TimeSeriesChart
          data={serieMensal}
          metrics={['cobertura']}
          metricConfig={METRICAS}
          xKey="competencia"
          title="Cobertura potencial da APS no Paraná, mês a mês"
          height={400}
          footer={rodapeMensal}
        />
      </div>

      <TimeSeriesChart
        data={serieAnual}
        metrics={['cobertura']}
        metricConfig={METRICAS}
        title="Cobertura potencial em dezembro de cada ano"
        height={280}
        onPointClick={onAnoClick}
        selectedAno={selectedAno}
        footer="Média ponderada pela população municipal da última competência; valor de dezembro (ou do último mês disponível) de cada ano."
      />

      <RankingTable
        data={ranking}
        columns={[
          { key: 'municipio', label: 'Município' },
          { key: 'regional', label: 'Regional' },
          { key: 'cobertura', label: 'Cobertura', align: 'right', format: 'percent' },
          { key: 'esf', label: 'Equipes ESF', align: 'right', render: formatInteiro },
          { key: 'populacao', label: 'População', align: 'right', format: 'number' }
        ]}
        title="Municípios com menor cobertura potencial"
        defaultSort="cobertura"
        defaultSortDir="asc"
        pageSize={10}
        onRowClick={(row) => onMunicipioClick(row.cod_ibge, row.municipio)}
        selectedRow={selectedMunicipio}
      />

      <FonteNota metadata={dados.metadata}>
        <p>
          Cobertura potencial: capacidade de atendimento das equipes (ESF e eAP) dividida pela população do município, limitada a 100%. A série anterior a 2021 usava outro método de cálculo e não está incluída.
        </p>
      </FonteNota>
    </div>
  );
}

export default AtencaoPrimariaTab;
