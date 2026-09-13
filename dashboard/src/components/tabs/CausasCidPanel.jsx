/**
 * Painel "Óbitos por capítulo CID-10" (SIM/DATASUS), embutido na aba
 * Mortalidade: ranking de capítulos da seleção, série estadual dos cinco
 * principais capítulos e participação (%) da seleção frente ao Paraná.
 */

import TimeSeriesChart from '../TimeSeriesChart';
import FonteNota from '../FonteNota';
import SemDados from './SemDados';
import CapitulosBarChart from './CapitulosBarChart';
import { useMortalidadeCid } from '../../hooks/useMortalidadeCid';
import { CODIGO_OUTROS } from '../../hooks/cidHelpers';
import { formatNumber, formatPercent } from '../../utils/format';

const formatPontos = (v) => (v == null ? '-' : Math.abs(v).toLocaleString('pt-BR', {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1
}));

function nomeSelecao(filters) {
  if (filters?.municipio) return filters.municipio;
  if (filters?.regional) return `Regional ${filters.regional}`;
  if (filters?.mesorregiao) return filters.mesorregiao;
  return 'Paraná';
}

function tituloCapitulos(porCapitulo, ano) {
  const lider = porCapitulo[0];
  if (!lider) return 'Óbitos por capítulo CID-10';
  return `${lider.nome}: ${formatPercent(lider.percentual)} dos óbitos em ${ano}`;
}

function tituloSerie(principais, ano) {
  const lider = principais[0];
  if (!lider) return 'Principais capítulos por ano (Paraná)';
  return `Cinco principais capítulos no Paraná: ${lider.rotulo.toLowerCase()} lideram em ${ano}`;
}

// Diferença em pontos percentuais com glifo (não depende só da cor).
function Diferenca({ valor }) {
  if (valor == null) return <span className="text-dark-400">-</span>;
  if (Math.abs(valor) < 0.05) return <span className="text-dark-400">= 0,0</span>;
  const acima = valor > 0;
  return (
    <span className={acima ? 'text-accent-700' : 'text-water-700'}>
      {acima ? '▲ +' : '▼ -'}{formatPontos(valor)}
    </span>
  );
}

function LegendaSerie({ principais, preliminares }) {
  return (
    <>
      {principais.map((c) => (
        <span key={c.codigo} className="inline-flex items-center gap-1 mr-3">
          <span
            className="inline-block w-2.5 h-2.5 rounded-full"
            style={{ backgroundColor: c.cor }}
            aria-hidden="true"
          />
          <span className="text-dark-600">{c.rotulo}</span>
        </span>
      ))}
      <span className="block mt-1">Série estadual (o SIM não traz série anual por município neste painel)</span>
      {preliminares.length > 0 && (
        <span className="block">{`Dados preliminares: ${preliminares.join(', ')}`}</span>
      )}
    </>
  );
}

function TabelaParticipacao({ linhas, temSelecao, selecao, ano }) {
  if (!linhas || linhas.length === 0) return null;
  const titulo = temSelecao
    ? `Participação por capítulo: ${selecao} frente ao Paraná (${ano})`
    : `Participação por capítulo no Paraná (${ano})`;
  const th = 'px-3 py-2 text-xs font-semibold text-dark-500 uppercase tracking-wider';

  return (
    <div className="bg-white rounded-xl shadow-card p-6">
      <h3 className="font-display font-semibold text-dark-900 mb-1">{titulo}</h3>
      <p className="text-xs text-dark-400 mb-4">
        Percentual dos óbitos de cada capítulo sobre o total do recorte; diferença em pontos percentuais.
      </p>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-neutral-200">
              <th className={`${th} text-left`}>Capítulo</th>
              <th className={`${th} text-right`}>Óbitos</th>
              <th className={`${th} text-right`}>{temSelecao ? 'Seleção (%)' : 'Paraná (%)'}</th>
              {temSelecao && <th className={`${th} text-right`}>Paraná (%)</th>}
              {temSelecao && <th className={`${th} text-right`}>Diferença (p.p.)</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100">
            {linhas.map((l) => (
              <tr key={l.codigo}>
                <td className="px-3 py-2 text-dark-900">
                  {l.codigo !== CODIGO_OUTROS && (
                    <span className="font-mono text-xs text-dark-400 mr-2" data-i18n-skip>{l.codigo}</span>
                  )}
                  {l.nome}
                </td>
                <td className="px-3 py-2 text-right tabular-nums text-dark-600">{formatNumber(l.obitos)}</td>
                <td className="px-3 py-2 text-right tabular-nums font-medium text-dark-900">{formatPercent(l.pctSelecao)}</td>
                {temSelecao && (
                  <td className="px-3 py-2 text-right tabular-nums text-dark-600">{formatPercent(l.pctEstado)}</td>
                )}
                {temSelecao && (
                  <td className="px-3 py-2 text-right tabular-nums"><Diferenca valor={l.diferenca} /></td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function CausasCidPanel({ dados, geoMap, filters }) {
  const cid = useMortalidadeCid(dados, filters, geoMap);

  if (!cid) return <SemDados fonte="SIM (DATASUS)" />;

  const {
    metadata, porAno, porCapitulo, principais, metricConfig,
    participacao, anoReferencia, temSelecao, preliminaresExibidos
  } = cid;
  const selecao = nomeSelecao(filters);

  return (
    <div className="space-y-6">
      <div className="flex items-baseline gap-3">
        <h2 className="font-display font-semibold text-lg text-dark-900">Causas de óbito por capítulo CID-10</h2>
        <span className="text-xs text-dark-400">SIM/DATASUS, causa básica, residência</span>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <CapitulosBarChart
          data={porCapitulo}
          title={tituloCapitulos(porCapitulo, anoReferencia)}
          unidade="óbitos"
          height={380}
          footer={temSelecao
            ? 'Soma dos municípios da seleção, ano de referência'
            : 'Paraná, ano de referência'}
        />
        <TimeSeriesChart
          data={porAno}
          metrics={principais.map((c) => c.codigo)}
          metricConfig={metricConfig}
          title={tituloSerie(principais, anoReferencia)}
          height={380}
          footer={<LegendaSerie principais={principais} preliminares={preliminaresExibidos} />}
        />
      </div>

      <TabelaParticipacao
        linhas={participacao}
        temSelecao={temSelecao}
        selecao={selecao}
        ano={anoReferencia}
      />

      <FonteNota metadata={metadata}>
        <p>
          Óbitos por município de residência e capítulo CID-10 da causa básica (SIM/DATASUS).
        </p>
        <p>
          SIM (DATASUS) e Registro Civil (IBGE) contam óbitos de formas diferentes: o SIM parte da declaração de óbito, por causa e residência; o IBGE parte do registro em cartório. Por isso os totais diferem um pouco entre os painéis.
        </p>
      </FonteNota>
    </div>
  );
}
