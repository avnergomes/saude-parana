// ATLAS-A11Y-HEX-SWEPT
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine
} from 'recharts';
import { formatNumber, formatCurrency, formatDecimal } from '../utils/format';
import { SUFIXO_PARCIAL, formatarEixo, separarParcial, marcasEixo } from '../utils/graficos';

// Métricas conhecidas; cada aba pode estender/sobrescrever via prop metricConfig
// (label, color, format) sem editar este arquivo.
const DEFAULT_METRIC_CONFIG = {
  total: { label: 'Total', color: '#2d5f7f', format: formatNumber },
  obitos: { label: 'Óbitos', color: '#D55E00', format: formatNumber },
  internacoes: { label: 'Internações', color: '#3b82f6', format: formatNumber },
  valor_sus: { label: 'Valor SUS', color: '#009E73', format: (v) => formatCurrency(v, false) },
  taxa_bruta: { label: 'Taxa/mil hab', color: '#CC79A7', format: (v) => formatDecimal(v, 2) },
  cobertura: { label: 'Cobertura %', color: '#c89b3c', format: (v) => formatDecimal(v, 1) + '%' }
};

// Definido fora do componente: criar componentes durante o render
// reinicia o estado deles a cada renderização (regra react-hooks/static-components).
function CustomTooltip({ active, payload, label, config: metricConfig = DEFAULT_METRIC_CONFIG }) {
  if (!active || !payload || payload.length === 0) return null;
  const parcial = Boolean(payload[0]?.payload?.parcial);
  // Uma linha por métrica: no ano de junção a série cheia e a tracejada
  // trazem o mesmo valor
  const vistos = new Set();
  const itens = payload.filter((item) => {
    const base = String(item.dataKey).replace(SUFIXO_PARCIAL, '');
    if (item.value == null || vistos.has(base)) return false;
    vistos.add(base);
    return true;
  });
  if (itens.length === 0) return null;

  return (
    <div className="bg-white rounded-lg shadow-lg border border-neutral-200 p-3">
      <p className="font-semibold text-dark-900 mb-2">{label}{parcial ? ' (parcial)' : ''}</p>
      {itens.map((item, index) => {
        const base = String(item.dataKey).replace(SUFIXO_PARCIAL, '');
        const config = metricConfig[base] || { label: base, format: formatNumber };
        return (
          <div key={index} className="flex items-center gap-2 text-sm">
            <div
              className="w-3 h-3 rounded-full"
              style={{ backgroundColor: item.color }}
            />
            <span className="text-dark-600">{config.label}:</span>
            <span className="font-medium text-dark-900">
              {config.format(item.value)}
            </span>
          </div>
        );
      })}
    </div>
  );
}

export default function TimeSeriesChart({
  data,
  metrics = ['total'],
  title,
  height = 300,
  onPointClick,
  selectedAno,
  showGrid = true,
  referenceYear = null,
  // Linha horizontal de referência, ex.: { valor: 15, rotulo: 'mínimo 15%' }
  referenceValue = null,
  metricConfig: metricOverrides = {},
  xKey = 'ano',
  footer = null
}) {
  if (!data || data.length === 0) {
    return (
      <div className="bg-white rounded-xl shadow-card p-6">
        {title && (
          <h3 className="font-display font-semibold text-dark-900 mb-4">{title}</h3>
        )}
        <p className="text-dark-400 text-center">Sem dados disponíveis</p>
      </div>
    );
  }

  const metricConfig = { ...DEFAULT_METRIC_CONFIG, ...metricOverrides };

  // Um único período na fonte: uma linha não tem o que ligar; mostra o valor
  // em destaque em vez de eixos vazios com um ponto solto. Com um ano
  // selecionado (clique), mantém o gráfico: o ponto precisa continuar
  // clicável para desmarcar o ano.
  if (data.length === 1 && selectedAno == null) {
    const linha = data[0];
    return (
      <div className="bg-white rounded-xl shadow-card p-6 h-full flex flex-col">
        {title && <h3 className="font-display font-semibold text-dark-900 mb-4">{title}</h3>}
        <div className="flex-1 flex flex-col items-center justify-center gap-2 py-8">
          {metrics.map((metric) => {
            const config = metricConfig[metric] || { label: metric, format: formatNumber };
            return (
              <p key={metric} className="text-center">
                <span className="block font-display text-4xl font-semibold" style={{ color: config.color }}>
                  {config.format(linha[metric])}
                </span>
                <span className="text-sm text-dark-500">{config.label}, {linha[xKey]}</span>
              </p>
            );
          })}
          <p className="text-xs text-dark-400">Só um período disponível: a série aparece quando houver o próximo.</p>
        </div>
        {footer && <p className="text-xs text-dark-400 mt-2">{footer}</p>}
      </div>
    );
  }

  const { dados, parciais } = separarParcial(data, metrics);
  // Séries longas (ex.: 66 meses da APS): círculos em todo ponto se
  // amontoavam; mostra só o ponto selecionado e o de destaque ao passar o mouse
  const muitosPontos = dados.length > 30;
  // Eixo Y de zero a um teto redondo com marcas redondas (o automático do
  // Recharts gerava "450 · 900 · 1,4 mil · 1,8 mil"); a referência entra no teto
  const valoresY = dados.flatMap((linha) => [...metrics, ...parciais.map((m) => m + SUFIXO_PARCIAL)]
    .map((m) => Number(linha[m])).filter(Number.isFinite));
  const { teto, marcas } = marcasEixo(Math.max(0, ...valoresY, referenceValue?.valor ?? 0));

  // Ponto de uma série; valor nulo não desenha nada (antes virava um círculo
  // no topo do gráfico, com cy indefinido)
  const desenharPonto = (metric, cor, vazado) => (props) => {
    const { cx, cy, payload, value } = props;
    const chave = `${metric}-${payload[xKey]}`;
    if (value == null || cx == null || cy == null) return <g key={chave} />;
    const isSelected = selectedAno === payload[xKey];
    if (muitosPontos && !isSelected) return <g key={chave} />;
    return (
      <circle
        key={chave}
        cx={cx}
        cy={cy}
        r={isSelected ? 6 : 4}
        fill={isSelected ? cor : 'white'}
        stroke={cor}
        strokeWidth={2}
        strokeDasharray={vazado ? '2 2' : undefined}
      />
    );
  };

  const handleClick = (data) => {
    if (onPointClick && data?.activePayload?.[0]?.payload?.[xKey]) {
      onPointClick(data.activePayload[0].payload[xKey]);
    }
  };

  return (
    <div className="bg-white rounded-xl shadow-card p-6 h-full">
      {title && (
        <h3 className="font-display font-semibold text-dark-900 mb-4">
          {title}
        </h3>
      )}

      <ResponsiveContainer width="100%" height={height}>
        <LineChart
          data={dados}
          // topo maior para o rótulo da linha de referência (COVID-19) não ser cortado
          margin={{ top: 24, right: 30, left: 10, bottom: 10 }}
          onClick={handleClick}
          style={{ cursor: onPointClick ? 'pointer' : 'default' }}
        >
          {showGrid && (
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
          )}

          <XAxis
            dataKey={xKey}
            tick={{ fontSize: 12, fill: '#6b7280' }}
            tickLine={{ stroke: '#d1d5db' }}
            axisLine={{ stroke: '#d1d5db' }}
          />

          <YAxis
            tick={{ fontSize: 12, fill: '#6b7280' }}
            tickLine={{ stroke: '#d1d5db' }}
            axisLine={{ stroke: '#d1d5db' }}
            tickFormatter={formatarEixo}
            domain={[0, teto]}
            ticks={marcas}
          />

          <Tooltip content={<CustomTooltip config={metricConfig} />} />

          {referenceYear && (
            <ReferenceLine
              x={referenceYear}
              stroke="#918058"
              strokeDasharray="5 5"
              label={{ value: 'COVID-19', position: 'top', fontSize: 10 }}
            />
          )}

          {referenceValue && (
            <ReferenceLine
              y={referenceValue.valor}
              stroke="#b45309"
              strokeDasharray="4 4"
              label={{ value: referenceValue.rotulo, position: 'insideBottomRight', fontSize: 10, fill: '#b45309' }}
            />
          )}

          {metrics.map((metric) => {
            const config = metricConfig[metric] || { color: '#6b7280' };
            return (
              <Line
                key={metric}
                type="monotone"
                dataKey={metric}
                stroke={config.color}
                strokeWidth={2}
                dot={desenharPonto(metric, config.color, false)}
                activeDot={{ r: 6, strokeWidth: 2 }}
              />
            );
          })}

          {parciais.map((metric) => {
            const config = metricConfig[metric] || { color: '#6b7280' };
            return (
              <Line
                key={metric + SUFIXO_PARCIAL}
                type="linear"
                dataKey={metric + SUFIXO_PARCIAL}
                stroke={config.color}
                strokeWidth={2}
                strokeDasharray="5 4"
                strokeOpacity={0.7}
                dot={desenharPonto(metric + SUFIXO_PARCIAL, config.color, true)}
                activeDot={{ r: 6, strokeWidth: 2 }}
                legendType="none"
              />
            );
          })}
        </LineChart>
      </ResponsiveContainer>

      {onPointClick && (
        <p className="text-xs text-center text-dark-400 mt-2">
          Clique em um ponto para filtrar por ano
        </p>
      )}
      {footer && (
        <p className="text-xs text-dark-400 mt-2">{footer}</p>
      )}
    </div>
  );
}
