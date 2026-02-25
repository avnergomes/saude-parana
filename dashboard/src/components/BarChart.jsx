import {
  BarChart as RechartsBarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell
} from 'recharts';
import { formatNumber, formatCurrency, formatPercent, CHART_COLORS } from '../utils/format';

export default function BarChart({
  data,
  dataKey = 'total',
  nameKey = 'nome',
  title,
  height = 300,
  layout = 'horizontal',
  onBarClick,
  selectedItem,
  showPercentage = false,
  colorKey = 'cor',
  useRainbowColors = true
}) {
  if (!data || data.length === 0) {
    return (
      <div className="bg-white rounded-xl shadow-card p-6">
        <p className="text-dark-400 text-center">Sem dados disponíveis</p>
      </div>
    );
  }

  const isHorizontal = layout === 'horizontal';

  const formatValue = (value) => {
    if (showPercentage) return formatPercent(value, 1);
    if (value >= 1e6) return formatCurrency(value, false);
    return formatNumber(value);
  };

  const CustomTooltip = ({ active, payload }) => {
    if (!active || !payload || payload.length === 0) return null;

    const item = payload[0].payload;
    return (
      <div className="bg-white rounded-lg shadow-lg border border-neutral-200 p-3">
        <p className="font-semibold text-dark-900 mb-1">
          {item[nameKey]}
        </p>
        <p className="text-sm text-dark-600">
          {formatValue(item[dataKey])}
        </p>
        {item.percentual && (
          <p className="text-xs text-dark-400 mt-1">
            {item.percentual}% do total
          </p>
        )}
      </div>
    );
  };

  const handleClick = (data) => {
    if (onBarClick && data) {
      onBarClick(data[nameKey]);
    }
  };

  const getBarColor = (entry, index) => {
    // Usa cor definida no dado, ou rainbow colors
    if (entry[colorKey]) return entry[colorKey];
    if (useRainbowColors) return CHART_COLORS.rainbow[index % CHART_COLORS.rainbow.length];
    return CHART_COLORS.primary[0];
  };

  return (
    <div className="bg-white rounded-xl shadow-card p-6">
      {title && (
        <h3 className="font-display font-semibold text-dark-900 mb-4">
          {title}
        </h3>
      )}

      <ResponsiveContainer width="100%" height={height}>
        <RechartsBarChart
          data={data}
          layout={isHorizontal ? 'vertical' : 'horizontal'}
          margin={
            isHorizontal
              ? { top: 5, right: 30, left: 100, bottom: 5 }
              : { top: 5, right: 30, left: 20, bottom: 30 }
          }
        >
          <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />

          {isHorizontal ? (
            <>
              <XAxis
                type="number"
                tick={{ fontSize: 11, fill: '#6b7280' }}
                tickFormatter={(v) => {
                  if (v >= 1e6) return (v / 1e6).toFixed(0) + 'M';
                  if (v >= 1e3) return (v / 1e3).toFixed(0) + 'K';
                  return v;
                }}
              />
              <YAxis
                type="category"
                dataKey={nameKey}
                tick={{ fontSize: 11, fill: '#6b7280' }}
                width={90}
                tickFormatter={(v) => v?.length > 15 ? v.substring(0, 15) + '...' : v}
              />
            </>
          ) : (
            <>
              <XAxis
                dataKey={nameKey}
                tick={{ fontSize: 11, fill: '#6b7280', angle: -45, textAnchor: 'end' }}
                height={60}
                tickFormatter={(v) => v?.length > 10 ? v.substring(0, 10) + '...' : v}
              />
              <YAxis
                tick={{ fontSize: 11, fill: '#6b7280' }}
                tickFormatter={(v) => {
                  if (v >= 1e6) return (v / 1e6).toFixed(0) + 'M';
                  if (v >= 1e3) return (v / 1e3).toFixed(0) + 'K';
                  return v;
                }}
              />
            </>
          )}

          <Tooltip content={<CustomTooltip />} />

          <Bar
            dataKey={dataKey}
            radius={[4, 4, 4, 4]}
            cursor={onBarClick ? 'pointer' : 'default'}
            onClick={handleClick}
          >
            {data.map((entry, index) => (
              <Cell
                key={`cell-${index}`}
                fill={getBarColor(entry, index)}
                opacity={selectedItem && entry[nameKey] !== selectedItem ? 0.4 : 1}
                stroke={entry[nameKey] === selectedItem ? '#1f2937' : 'none'}
                strokeWidth={entry[nameKey] === selectedItem ? 2 : 0}
              />
            ))}
          </Bar>
        </RechartsBarChart>
      </ResponsiveContainer>

      {onBarClick && (
        <p className="text-xs text-center text-dark-400 mt-2">
          Clique em uma barra para filtrar
        </p>
      )}
    </div>
  );
}
