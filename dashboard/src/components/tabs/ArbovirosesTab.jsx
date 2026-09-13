/**
 * Aba "Dengue e arboviroses": casos notificados e estimados (InfoDengue,
 * Fiocruz/FGV), incidência e nível de alerta por município.
 *
 * Recebe `dados` = arboviroses.json (pode ser nulo enquanto a ETL não
 * roda), a malha municipal, o geoMap e os filtros compartilhados do painel.
 * A série semanal é estadual; KPIs, série anual, mapa e ranking respeitam
 * o território selecionado.
 */

import TabKpis from '../TabKpis';
import TimeSeriesChart from '../TimeSeriesChart';
import ArbovirosesAnoChart from './ArbovirosesAnoChart';
import MapChart from '../MapChart';
import RankingTable from '../RankingTable';
import FonteNota from '../FonteNota';
import { ATLAS_CLAY } from '../../utils/format';
import { useArboviroses } from '../../hooks/useArboviroses';

// Base cinza (dark-400) para o notificado; acento clay para o estimado.
const COR_CASOS = '#6e6453';
const COR_CASOS_EST = ATLAS_CLAY[3];
// Ano corrente (parcial) em tom mais claro da mesma rampa.
const COR_ANO_PARCIAL = ATLAS_CLAY[2];

// Inteiro no padrão pt-BR (sem abreviar em "mil"), "-" para nulo
function formatInteiro(valor) {
  if (valor === null || valor === undefined || isNaN(valor)) return '-';
  return Math.round(valor).toLocaleString('pt-BR');
}

// Decimal no padrão pt-BR com casas fixas, "-" para nulo
function formatDecimal(valor, casas = 1) {
  if (valor === null || valor === undefined || isNaN(valor)) return '-';
  return valor.toLocaleString('pt-BR', {
    minimumFractionDigits: casas,
    maximumFractionDigits: casas
  });
}

// "202636" -> "SE 36/2026"
function formatSemanaEpi(semana) {
  const texto = String(semana || '');
  if (texto.length < 6) return texto || '-';
  return `SE ${texto.slice(4, 6)}/${texto.slice(0, 4)}`;
}

const METRICAS = {
  casos: { label: 'Casos notificados', color: COR_CASOS, format: formatInteiro },
  casos_est: { label: 'Casos estimados', color: COR_CASOS_EST, format: formatInteiro }
};

// Níveis de alerta do InfoDengue: cor + número + nome, nunca só a cor.
const NIVEIS = {
  1: { nome: 'Verde', classe: 'bg-green-100 text-green-800 border-green-800/20' },
  2: { nome: 'Amarelo', classe: 'bg-yellow-100 text-yellow-800 border-yellow-800/25' },
  3: { nome: 'Laranja', classe: 'bg-orange-100 text-orange-800 border-orange-800/25' },
  4: { nome: 'Vermelho', classe: 'bg-red-100 text-red-800 border-red-800/25' }
};

function NivelBadge({ nivel }) {
  const info = NIVEIS[Number(nivel)];
  if (!info) return <span className="text-dark-400">-</span>;
  return (
    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full border text-xs font-medium ${info.classe}`}>
      <span className="font-mono">{nivel}</span>
      <span>{info.nome}</span>
    </span>
  );
}

function LegendaSemanal({ selecaoAtiva }) {
  return (
    <span className="inline-flex flex-wrap items-center gap-x-4 gap-y-1">
      <span className="inline-flex items-center gap-1.5">
        <span className="w-3 h-0.5 inline-block" style={{ backgroundColor: COR_CASOS }} />
        <span>Casos notificados</span>
      </span>
      <span className="inline-flex items-center gap-1.5">
        <span className="w-3 h-0.5 inline-block" style={{ backgroundColor: COR_CASOS_EST }} />
        <span>Casos estimados (nowcasting, corrige o atraso de notificação)</span>
      </span>
      {selecaoAtiva && (
        <span>Série estadual: não muda com o território selecionado.</span>
      )}
    </span>
  );
}

function PainelIndisponivel() {
  return (
    <div className="bg-white rounded-xl shadow-card p-6 text-center">
      <h3 className="font-display font-semibold text-dark-900 mb-2">
        Dados ainda não disponíveis para este painel
      </h3>
      <p className="text-sm text-dark-500">
        A base de arboviroses (InfoDengue) ainda não foi processada. Gere o arquivo de dados e recarregue a página.
      </p>
    </div>
  );
}

function ArbovirosesTab({
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
  const arbo = useArboviroses(dados, geoMap, filters);

  if (!arbo.disponivel) return <PainelIndisponivel />;

  const { resumo, serieSemanal, serieAnual, ranking, selecaoAtiva, anoReferencia, semanaUltima } = arbo;

  const kpis = [
    {
      label: 'Casos prováveis no ano',
      value: formatInteiro(resumo.casos),
      sublabel: 'acumulado até a última semana',
      tone: 'health'
    },
    {
      label: 'Incidência por 100 mil hab.',
      value: formatDecimal(resumo.incidencia, 1),
      sublabel: 'casos prováveis / população',
      tone: 'water'
    },
    {
      label: 'Municípios em alerta',
      value: formatInteiro(resumo.emAlerta),
      sublabel: 'nível 3 (laranja) ou 4 (vermelho)',
      tone: 'harvest'
    },
    {
      label: 'Semana epidemiológica',
      value: formatSemanaEpi(semanaUltima),
      sublabel: 'dado mais recente',
      tone: 'secondary'
    }
  ];

  const barrasAnuais = serieAnual.map(p => ({
    ...p,
    cor: p.ano === anoReferencia ? COR_ANO_PARCIAL : COR_CASOS_EST
  }));

  return (
    <div className="space-y-6">
      <TabKpis items={kpis} />

      <TimeSeriesChart
        data={serieSemanal}
        metrics={['casos', 'casos_est']}
        metricConfig={METRICAS}
        xKey="rotulo"
        title="Casos de dengue por semana epidemiológica no Paraná: notificados e estimados"
        height={350}
        footer={<LegendaSemanal selecaoAtiva={selecaoAtiva} />}
      />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <MapChart
          geoData={geoData}
          geoError={geoError}
          onRetryGeo={onRetryGeo}
          data={ranking}
          metric="incidencia_100k"
          title="Incidência de dengue por 100 mil habitantes, por município"
          colorScale="obitos"
          formatValue={(v) => formatDecimal(v, 1)}
          onFeatureClick={onMunicipioClick}
          selectedFeature={selectedMunicipio}
        />

        <ArbovirosesAnoChart
          data={barrasAnuais}
          title="Casos prováveis de dengue por ano"
          height={400}
          onAnoClick={onAnoClick}
          selectedAno={selectedAno}
          footer="Ano corrente parcial (acumulado até a última semana disponível), em tom mais claro."
        />
      </div>

      <RankingTable
        data={ranking}
        columns={[
          { key: 'municipio', label: 'Município' },
          { key: 'regional', label: 'Regional' },
          { key: 'casos', label: 'Casos', align: 'right', render: formatInteiro },
          { key: 'incidencia_100k', label: 'Incidência/100 mil', align: 'right', render: (v) => formatDecimal(v, 1) },
          { key: 'nivel', label: 'Nível de alerta', align: 'right', render: (v) => <NivelBadge nivel={v} /> }
        ]}
        title="Municípios com maior incidência de dengue"
        defaultSort="incidencia_100k"
        pageSize={10}
        onRowClick={(row) => onMunicipioClick(row.cod_ibge, row.municipio)}
        selectedRow={selectedMunicipio}
      />

      <FonteNota metadata={dados.metadata}>
        <p>
          Casos prováveis: notificações sem descarte, no ano de referência. Casos estimados: valor corrigido por nowcasting, que compensa o atraso entre o início dos sintomas e a notificação; nas semanas mais recentes tende a superar os casos já notificados.
        </p>
        <p>
          Dados do InfoDengue (Fiocruz/FGV). Referência metodológica: Codeço CT et al. (2018), Infodengue: a nowcasting system for the surveillance of arboviruses in Brazil.
        </p>
      </FonteNota>
    </div>
  );
}

export default ArbovirosesTab;
