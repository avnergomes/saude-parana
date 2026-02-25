import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
  ReferenceLine
} from 'recharts';
import { formatNumber } from '../utils/format';

export default function PyramidChart({
  data,
  title = 'Pirâmide Etária de Óbitos',
  height = 400
}) {
  if (!data || data.length === 0) {
    return (
      <div className="bg-white rounded-xl shadow-card p-6">
        <p className="text-dark-400 text-center">Sem dados disponíveis</p>
      </div>
    );
  }

  // Ordenar por faixa etária
  const faixasOrdem = [
    '0-4', '5-9', '10-14', '15-19', '20-24', '25-29', '30-34',
    '35-39', '40-44', '45-49', '50-54', '55-59', '60-64',
    '65-69', '70-74', '75-79', '80+'
  ];

  const sortedData = [...data].sort((a, b) => {
    return faixasOrdem.indexOf(a.faixa) - faixasOrdem.indexOf(b.faixa);
  });

  const maxValue = Math.max(
    ...data.map(d => Math.max(Math.abs(d.homens), Math.abs(d.mulheres)))
  );

  const CustomTooltip = ({ active, payload }) => {
    if (!active || !payload || payload.length === 0) return null;

    const item = payload[0].payload;
    return (
      <div className="bg-white rounded-lg shadow-lg border border-neutral-200 p-3">
        <p className="font-semibold text-dark-900 mb-2">
          Faixa: {item.faixa} anos
        </p>
        <div className="space-y-1 text-sm">
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-blue-500" />
            <span>Homens: {formatNumber(Math.abs(item.homens))}</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-pink-500" />
            <span>Mulheres: {formatNumber(Math.abs(item.mulheres))}</span>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="bg-white rounded-xl shadow-card p-6">
      {title && (
        <h3 className="font-display font-semibold text-dark-900 mb-4">
          {title}
        </h3>
      )}

      {/* Legenda */}
      <div className="flex justify-center gap-6 mb-4">
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 rounded bg-blue-500" />
          <span className="text-sm text-dark-600">Homens</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 rounded bg-pink-500" />
          <span className="text-sm text-dark-600">Mulheres</span>
        </div>
      </div>

      <ResponsiveContainer width="100%" height={height}>
        <BarChart
          data={sortedData}
          layout="vertical"
          margin={{ top: 10, right: 30, left: 50, bottom: 10 }}
        >
          <XAxis
            type="number"
            domain={[-maxValue * 1.1, maxValue * 1.1]}
            tick={{ fontSize: 11, fill: '#6b7280' }}
            tickFormatter={(v) => formatNumber(Math.abs(v))}
          />
          <YAxis
            type="category"
            dataKey="faixa"
            tick={{ fontSize: 11, fill: '#6b7280' }}
            axisLine={false}
            tickLine={false}
          />
          <Tooltip content={<CustomTooltip />} />
          <ReferenceLine x={0} stroke="#9ca3af" />

          <Bar dataKey="homens" stackId="a" radius={[4, 0, 0, 4]}>
            {sortedData.map((_, index) => (
              <Cell key={`homens-${index}`} fill="#3b82f6" />
            ))}
          </Bar>
          <Bar dataKey="mulheres" stackId="b" radius={[0, 4, 4, 0]}>
            {sortedData.map((_, index) => (
              <Cell key={`mulheres-${index}`} fill="#ec4899" />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>

      <p className="text-xs text-center text-dark-400 mt-2">
        Valores negativos representam homens (esquerda), positivos mulheres (direita)
      </p>
    </div>
  );
}
