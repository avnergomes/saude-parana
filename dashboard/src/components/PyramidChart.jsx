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
import { tetoRedondo } from '../utils/graficos';

// Fora do componente: criar componentes durante o render reinicia o estado
// deles a cada renderização (regra react-hooks/static-components).
function CustomTooltip({ active, payload }) {
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
}

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
  // Eixo simétrico com teto redondo: antes o domínio era max*1,1 e as marcas
  // saíam tortas ("17,3 mil · 8,3 mil · 662 · 17,3 mil")
  const teto = tetoRedondo(maxValue);
  const marcas = [-teto, -teto / 2, 0, teto / 2, teto];

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
          margin={{ top: 10, right: 30, left: 10, bottom: 10 }}
          barCategoryGap="12%"
          // homens (negativos) e mulheres (positivos) no mesmo stack, cada lado
          // a partir do zero: alinhados na mesma linha, espelhados
          stackOffset="sign"
        >
          <XAxis
            type="number"
            domain={[-teto, teto]}
            ticks={marcas}
            tick={{ fontSize: 11, fill: '#6b7280' }}
            tickFormatter={(v) => formatNumber(Math.abs(v))}
          />
          <YAxis
            type="category"
            dataKey="faixa"
            tick={{ fontSize: 11, fill: '#6b7280' }}
            axisLine={false}
            tickLine={false}
            interval={0}
            width={44}
          />
          <Tooltip content={<CustomTooltip />} />
          <ReferenceLine x={0} stroke="#9ca3af" />

          <Bar dataKey="homens" stackId="piramide" radius={[4, 0, 0, 4]}>
            {sortedData.map((_, index) => (
              <Cell key={`homens-${index}`} fill="#3b82f6" />
            ))}
          </Bar>
          <Bar dataKey="mulheres" stackId="piramide" radius={[0, 4, 4, 0]}>
            {sortedData.map((_, index) => (
              <Cell key={`mulheres-${index}`} fill="#ec4899" />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>

      <p className="text-xs text-center text-dark-400 mt-2">
        Homens à esquerda, mulheres à direita (óbitos por faixa etária)
      </p>
    </div>
  );
}
