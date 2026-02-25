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
import { formatNumber, formatCurrency } from '../utils/format';

const metricConfig = {
  total: { label: 'Total', color: '#0284c7', format: formatNumber },
  obitos: { label: 'Óbitos', color: '#ef4444', format: formatNumber },
  internacoes: { label: 'Internações', color: '#3b82f6', format: formatNumber },
  valor_sus: { label: 'Valor SUS', color: '#10b981', format: (v) => formatCurrency(v, false) },
  taxa_bruta: { label: 'Taxa/mil hab', color: '#8b5cf6', format: (v) => v?.toFixed(2) },
  cobertura: { label: 'Cobertura %', color: '#f59e0b', format: (v) => v?.toFixed(1) + '%' }
};

export default function TimeSeriesChart({
  data,
  metrics = ['total'],
  title,
  height = 300,
  onPointClick,
  selectedAno,
  showGrid = true,
  referenceYear = null
}) {
  if (!data || data.length === 0) {
    return (
      <div className="bg-white rounded-xl shadow-card p-6">
        <p className="text-dark-400 text-center">Sem dados disponíveis</p>
      </div>
    );
  }

  const CustomTooltip = ({ active, payload, label }) => {
    if (!active || !payload || payload.length === 0) return null;

    return (
      <div className="bg-white rounded-lg shadow-lg border border-neutral-200 p-3">
        <p className="font-semibold text-dark-900 mb-2">{label}</p>
        {payload.map((item, index) => {
          const config = metricConfig[item.dataKey] || { label: item.dataKey, format: formatNumber };
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
  };

  const handleClick = (data) => {
    if (onPointClick && data?.activePayload?.[0]?.payload?.ano) {
      onPointClick(data.activePayload[0].payload.ano);
    }
  };

  return (
    <div className="bg-white rounded-xl shadow-card p-6">
      {title && (
        <h3 className="font-display font-semibold text-dark-900 mb-4">
          {title}
        </h3>
      )}

      <ResponsiveContainer width="100%" height={height}>
        <LineChart
          data={data}
          margin={{ top: 10, right: 30, left: 10, bottom: 10 }}
          onClick={handleClick}
          style={{ cursor: onPointClick ? 'pointer' : 'default' }}
        >
          {showGrid && (
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
          )}

          <XAxis
            dataKey="ano"
            tick={{ fontSize: 12, fill: '#6b7280' }}
            tickLine={{ stroke: '#d1d5db' }}
            axisLine={{ stroke: '#d1d5db' }}
          />

          <YAxis
            tick={{ fontSize: 12, fill: '#6b7280' }}
            tickLine={{ stroke: '#d1d5db' }}
            axisLine={{ stroke: '#d1d5db' }}
            tickFormatter={(value) => {
              if (value >= 1e6) return (value / 1e6).toFixed(0) + 'M';
              if (value >= 1e3) return (value / 1e3).toFixed(0) + 'K';
              return value;
            }}
          />

          <Tooltip content={<CustomTooltip />} />

          {referenceYear && (
            <ReferenceLine
              x={referenceYear}
              stroke="#94a3b8"
              strokeDasharray="5 5"
              label={{ value: 'COVID-19', position: 'top', fontSize: 10 }}
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
                dot={(props) => {
                  const { cx, cy, payload } = props;
                  const isSelected = selectedAno === payload.ano;
                  return (
                    <circle
                      cx={cx}
                      cy={cy}
                      r={isSelected ? 6 : 4}
                      fill={isSelected ? config.color : 'white'}
                      stroke={config.color}
                      strokeWidth={2}
                    />
                  );
                }}
                activeDot={{ r: 6, strokeWidth: 2 }}
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
    </div>
  );
}
