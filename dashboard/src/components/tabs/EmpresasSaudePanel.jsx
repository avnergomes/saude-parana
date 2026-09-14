/**
 * Painel Empresas de saúde no CNPJ (Receita Federal, Dados Abertos do CNPJ):
 * estabelecimentos fiscais com CNAE principal de atenção à saúde humana ou
 * de farmácia, por município e classe CNAE. Embutido ao final da aba Rede
 * de Saúde. Só agregados são publicados (LGPD, art. 12).
 */

import MapChart from '../MapChart';
import BarChart from '../BarChart';
import TimeSeriesChart from '../TimeSeriesChart';
import RankingTable from '../RankingTable';
import TabKpis from '../TabKpis';
import FonteNota from '../FonteNota';
import SemDados from './SemDados';
import { useCnpjSaude } from '../../hooks/useCnpjSaude';
import { formatNumber, formatDecimal } from '../../utils/format';

export const FONTE_CNPJ = 'Receita Federal, Dados Abertos do CNPJ';

// Uma série, um acento (azul Okabe-Ito, o mesmo da série da ANS).
const METRICAS_ABERTURAS = {
  total: { label: 'Aberturas', color: '#0072B2', format: formatNumber }
};

const COLUNAS_RANKING = [
  { key: 'municipio', label: 'Município' },
  { key: 'regional', label: 'Regional' },
  { key: 'ativos', label: 'Estabelecimentos de saúde ativos', align: 'right', format: 'number' },
  { key: 'farmacias', label: 'Farmácias ativas', align: 'right', format: 'number' },
  { key: 'ativos_por_10mil', label: 'Ativos/10 mil hab.', align: 'right', format: 'decimal', decimals: 1 },
  { key: 'saude_secundaria', label: 'Saúde como CNAE secundário', align: 'right', format: 'number' }
];

const formatPor10mil = (v) => formatDecimal(v, 1);

// "2026-08" -> "08/2026"
function formatCompetencia(valor) {
  const m = /^(\d{4})-(\d{2})/.exec(String(valor || ''));
  return m ? `${m[2]}/${m[1]}` : String(valor || '-');
}

function montarKpis(k) {
  return [
    {
      label: 'Estabelecimentos de saúde ativos',
      value: formatNumber(k.ativos),
      sublabel: <>{formatNumber(k.inativos)} <span>inativos no cadastro</span></>,
      tone: 'water'
    },
    {
      label: 'Farmácias e drogarias ativas',
      value: formatNumber(k.farmacias),
      sublabel: 'CNAE 4771-7/01 a 03',
      tone: 'harvest'
    },
    {
      label: 'Ativos por 10 mil habitantes',
      value: formatPor10mil(k.ativosPor10mil),
      sublabel: 'população estimada IBGE',
      tone: 'secondary'
    },
    {
      // aberturasPorAno conta só quem ainda está ativo (sobreviventes), e a
      // série é sempre estadual: o rótulo e o sublabel dizem isso.
      label: 'Ativos hoje abertos no último ano completo',
      value: formatNumber(k.aberturas?.total),
      sublabel: k.aberturas
        ? <><span>Paraná, série estadual</span>, {k.aberturas.ano}</>
        : 'sem série anual',
      tone: 'forest'
    }
  ];
}

function Destaque({ porGrupo }) {
  const principal = porGrupo?.[0];
  if (!principal) return null;
  return (
    <p className="text-sm text-dark-600 px-1">
      <span className="font-medium text-dark-800">Classe mais numerosa:</span>
      {' '}{principal.descricao} ({principal.percentual}% <span>dos estabelecimentos de saúde ativos</span>).
    </p>
  );
}

function NotaMetodo() {
  return (
    <div className="bg-white rounded-xl shadow-card p-4 text-sm text-dark-600 space-y-2">
      <p>
        <span>O CNPJ conta estabelecimentos fiscais (matrizes e filiais) pela jurisdição da Receita Federal, com CNAE principal de atenção à saúde humana (divisão 86) ou de farmácias e drogarias.</span>
        {' '}<span>É um recorte diferente do CNES, que conta as unidades de saúde cadastradas no sistema do SUS: uma empresa pode ter CNPJ sem unidade no CNES e vice-versa.</span>
      </p>
      <p>
        <span>Saúde como CNAE secundário: estabelecimentos cuja atividade principal não é de saúde, mas que declaram ao menos um CNAE secundário de saúde; não entram nas contagens de ativos.</span>
        {' '}<span>Só agregados por município e classe CNAE são publicados; nenhum dado individual de empresa aparece no painel.</span>
      </p>
    </div>
  );
}

export default function EmpresasSaudePanel({
  cnpj,
  geoData,
  geoError,
  onRetryGeo,
  geoMap,
  filters,
  onMunicipioClick,
  selectedMunicipio
}) {
  const painel = useCnpjSaude(cnpj, geoMap, filters);

  if (!painel) {
    return <SemDados fonte={FONTE_CNPJ} />;
  }

  const handleRowClick = (row) => onMunicipioClick && onMunicipioClick(row.cod_ibge, row.municipio);

  return (
    <section className="space-y-6" aria-labelledby="empresas-saude-titulo">
      <h2 id="empresas-saude-titulo" className="font-display text-lg font-semibold text-dark-900 px-1">
        Empresas de saúde no CNPJ (Receita Federal)
      </h2>

      <TabKpis items={montarKpis(painel.kpis)} />

      <Destaque porGrupo={painel.porGrupo} />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <BarChart
          data={painel.porGrupo}
          dataKey="total"
          nameKey="nome"
          title="Estabelecimentos de saúde ativos por classe CNAE"
          height={450}
          layout="horizontal"
          useRainbowColors={false}
        />

        <MapChart
          geoData={geoData}
          geoError={geoError}
          onRetryGeo={onRetryGeo}
          data={painel.mapa}
          metric="ativos_por_10mil"
          title="Estabelecimentos de saúde ativos por 10 mil habitantes"
          colorScale="default"
          formatValue={formatPor10mil}
          onFeatureClick={onMunicipioClick}
          selectedFeature={selectedMunicipio}
        />
      </div>

      <TimeSeriesChart
        data={painel.serie}
        metrics={['total']}
        metricConfig={METRICAS_ABERTURAS}
        xKey="ano"
        title="Aberturas de estabelecimentos de saúde ativos hoje, por ano de início de atividade"
        height={300}
        footer={(
          <>
            <span>Série estadual: estabelecimentos ativos hoje, por ano de início de atividade</span>
            {painel.temSelecao && <>. <span>O recorte territorial não altera esta curva.</span></>}
          </>
        )}
      />

      <RankingTable
        data={painel.ranking}
        columns={COLUNAS_RANKING}
        title="Ranking de municípios por estabelecimentos de saúde no CNPJ"
        defaultSort="ativos"
        pageSize={10}
        onRowClick={handleRowClick}
        selectedRow={selectedMunicipio}
      />

      <NotaMetodo />

      <FonteNota metadata={painel.metadata}>
        <p>
          <span>Competência do CNPJ:</span> {formatCompetencia(painel.metadata?.competencia)}.
          {' '}<span>O filtro de ano só se aplica à série de aberturas; os demais números são a fotografia da competência.</span>
        </p>
      </FonteNota>
    </section>
  );
}
