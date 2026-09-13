/**
 * Aba "Internações SUS": internações hospitalares (SIH/DATASUS) por
 * município de residência. As séries são estaduais (o JSON não traz série
 * por município); KPIs, capítulos, mapa e ranking seguem a seleção no ano
 * de referência.
 */

import TabKpis from '../TabKpis';
import TimeSeriesChart from '../TimeSeriesChart';
import MapChart from '../MapChart';
import RankingTable from '../RankingTable';
import FonteNota from '../FonteNota';
import SemDados from './SemDados';
import CapitulosBarChart from './CapitulosBarChart';
import { useInternacoes, COR_INTERNACOES } from '../../hooks/useInternacoes';
import { competenciaBr, variacaoUltimosAnos } from '../../hooks/cidHelpers';
import { formatNumber, formatCurrency, formatPercent } from '../../utils/format';

const formatTaxa = (v) => (v == null ? '-' : v.toLocaleString('pt-BR', {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1
}));

const METRIC_CONFIG = {
  internacoes: { label: 'Internações', color: COR_INTERNACOES, format: formatNumber },
  taxa: { label: 'Internações por 1.000 hab', color: COR_INTERNACOES, format: formatTaxa }
};

const COLUNAS_RANKING = [
  { key: 'municipio', label: 'Município' },
  { key: 'regional', label: 'Regional' },
  { key: 'internacoes', label: 'Internações', align: 'right', format: 'number' },
  { key: 'taxa', label: 'Taxa/1.000', align: 'right', render: (v) => formatTaxa(v) },
  { key: 'valor_total', label: 'Valor (R$)', align: 'right', format: 'currency' },
  { key: 'letalidade', label: 'Letalidade', align: 'right', format: 'percent' }
];

// Títulos com a mensagem do gráfico (variação entre os dois últimos anos completos).
function tituloInternacoes(porAno) {
  const v = variacaoUltimosAnos(porAno, 'internacoes');
  if (!v || v.variacao == null) return 'Internações por ano';
  const pct = formatPercent(Math.abs(v.variacao));
  if (v.variacao > 0.5) return `Internações subiram ${pct} em ${v.ano} frente a ${v.anoAnterior}`;
  if (v.variacao < -0.5) return `Internações caíram ${pct} em ${v.ano} frente a ${v.anoAnterior}`;
  return `Internações estáveis em ${v.ano} frente a ${v.anoAnterior}`;
}

function tituloTaxa(porAno) {
  const v = variacaoUltimosAnos(porAno, 'taxa');
  if (!v) return 'Internações por 1.000 habitantes';
  return `Internações por 1.000 hab: ${formatTaxa(v.atual)} em ${v.ano} (${formatTaxa(v.anterior)} em ${v.anoAnterior})`;
}

function tituloCapitulos(porCapitulo, ano) {
  const lider = porCapitulo[0];
  if (!lider) return 'Internações por capítulo CID-10';
  return `${lider.nome}: ${formatPercent(lider.percentual)} das internações em ${ano}`;
}

function tituloMapa(porMunicipio, ano) {
  const maior = porMunicipio.reduce(
    (melhor, linha) => (linha.taxa != null && (melhor == null || linha.taxa > melhor.taxa) ? linha : melhor),
    null
  );
  if (!maior) return `Internações por 1.000 hab por município (${ano})`;
  return `Internações por 1.000 hab (${ano}): maior em ${maior.municipio}, ${formatTaxa(maior.taxa)}`;
}

function rodapeSerie({ temSelecao, anoParcial, ultimaCompetencia, porAno }) {
  const partes = [];
  if (temSelecao) partes.push('Série estadual (o SIH não traz série anual por município)');
  if (anoParcial && porAno.some((l) => l.ano === anoParcial)) {
    partes.push(`${anoParcial} parcial até ${competenciaBr(ultimaCompetencia)}`);
  }
  return partes.length > 0 ? partes.join('. ') : null;
}

function itensKpi(kpis) {
  const escopo = kpis?.escopo === 'selecao' ? 'soma da seleção' : 'Paraná';
  const rotuloAno = kpis ? `${kpis.ano}${kpis.parcial ? ' (parcial)' : ''}, ${escopo}` : '-';
  return [
    { label: 'Internações', value: formatNumber(kpis?.internacoes), sublabel: rotuloAno, tone: 'water' },
    { label: 'Internações por 1.000 hab', value: formatTaxa(kpis?.taxa), sublabel: rotuloAno, tone: 'secondary' },
    { label: 'Valor aprovado', value: formatCurrency(kpis?.valorTotal), sublabel: 'AIH aprovadas no ano', tone: 'harvest' },
    { label: 'Óbitos hospitalares', value: formatNumber(kpis?.obitos), sublabel: `letalidade ${formatPercent(kpis?.letalidade)}`, tone: 'health' }
  ];
}

export default function InternacoesTab({
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
  const internacoes = useInternacoes(dados, filters, geoMap);

  if (!internacoes) return <SemDados fonte="SIH/SUS (DATASUS)" />;

  const {
    metadata, porAno, kpis, porCapitulo, porMunicipio,
    anoReferencia, anoCapitulos, temSelecao, anoParcial, ultimaCompetencia
  } = internacoes;
  const rodape = rodapeSerie({ temSelecao, anoParcial, ultimaCompetencia, porAno });

  return (
    <div className="space-y-6">
      <TabKpis items={itensKpi(kpis)} />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <TimeSeriesChart
          data={porAno}
          metrics={['internacoes']}
          title={tituloInternacoes(porAno)}
          metricConfig={METRIC_CONFIG}
          onPointClick={onAnoClick}
          selectedAno={selectedAno}
          referenceYear={2020}
          footer={rodape}
        />
        <TimeSeriesChart
          data={porAno}
          metrics={['taxa']}
          title={tituloTaxa(porAno)}
          metricConfig={METRIC_CONFIG}
          onPointClick={onAnoClick}
          selectedAno={selectedAno}
          referenceYear={2020}
          footer={rodape}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <CapitulosBarChart
          data={porCapitulo}
          title={tituloCapitulos(porCapitulo, anoCapitulos)}
          unidade="internações"
          height={380}
          footer={temSelecao
            ? 'Soma dos municípios da seleção, ano de referência'
            : 'Paraná, último ano completo do recorte'}
        />
        <MapChart
          geoData={geoData}
          geoError={geoError}
          onRetryGeo={onRetryGeo}
          data={porMunicipio}
          metric="taxa"
          title={tituloMapa(porMunicipio, anoReferencia)}
          colorScale="internacoes"
          formatValue={formatTaxa}
          onFeatureClick={onMunicipioClick}
          selectedFeature={selectedMunicipio}
        />
      </div>

      <RankingTable
        data={porMunicipio}
        columns={COLUNAS_RANKING}
        title={`Ranking de municípios por internações (${anoReferencia})`}
        defaultSort="internacoes"
        pageSize={10}
        onRowClick={(row) => onMunicipioClick(row.cod_ibge, row.municipio)}
        selectedRow={selectedMunicipio}
      />

      <FonteNota metadata={metadata}>
        <p>
          Internações por município de residência, AIH aprovadas no SIH/SUS. A taxa usa a população estimada do IBGE.
        </p>
        {temSelecao && (
          <p>
            Taxa da seleção: soma das internações dividida pela soma da população dos municípios selecionados.
          </p>
        )}
      </FonteNota>
    </div>
  );
}
