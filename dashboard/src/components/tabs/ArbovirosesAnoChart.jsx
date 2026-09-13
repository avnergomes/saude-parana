/**
 * Barras anuais de casos prováveis de dengue (aba Arboviroses).
 *
 * Usa os primitivos do Recharts com os eixos como filhos diretos do gráfico:
 * o BarChart genérico envolve XAxis/YAxis em um Fragment, que o Recharts 2
 * não reconhece sob React 19 (os eixos e as barras somem).
 *
 * data: [{ ano, casos, cor }] (cor já definida pela aba: ano parcial em tom claro).
 */

import {
  BarChart,
  Bar,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer
} from 'recharts';

// Inteiro no padrão pt-BR, "-" para nulo
function formatInteiro(valor) {
  if (valor === null || valor === undefined || isNaN(valor)) return '-';
  return Math.round(valor).toLocaleString('pt-BR');
}

function formatEixo(valor) {
  if (valor >= 1e6) return (valor / 1e6).toFixed(1) + ' mi';
  if (valor >= 1e3) return Math.round(valor / 1e3) + ' mil';
  return String(valor);
}

// Fora do componente: criar componentes durante o render reinicia o estado
// deles a cada renderização (regra react-hooks/static-components).
function TooltipCasos({ active, payload }) {
  if (!active || !payload || payload.length === 0) return null;
  const item = payload[0].payload;
  return (
    <div className="bg-white rounded-lg shadow-lg border border-neutral-200 p-3">
      <p className="font-semibold text-dark-900 mb-1">{item.ano}</p>
      <p className="text-sm text-dark-600">
        <span>Casos prováveis: </span>
        <span className="font-medium text-dark-900">{formatInteiro(item.casos)}</span>
      </p>
    </div>
  );
}

export default function ArbovirosesAnoChart({
  data,
  title,
  height = 320,
  onAnoClick,
  selectedAno,
  footer = null
}) {
  if (!data || data.length === 0) {
    return (
      <div className="bg-white rounded-xl shadow-card p-6">
        {title && <h3 className="font-display font-semibold text-dark-900 mb-4">{title}</h3>}
        <p className="text-dark-400 text-center">Sem dados disponíveis</p>
      </div>
    );
  }

  const handleBarClick = (entry) => {
    if (onAnoClick && entry?.ano) onAnoClick(entry.ano);
  };

  return (
    <div className="bg-white rounded-xl shadow-card p-6">
      {title && <h3 className="font-display font-semibold text-dark-900 mb-4">{title}</h3>}

      <ResponsiveContainer width="100%" height={height}>
        <BarChart data={data} margin={{ top: 10, right: 30, left: 10, bottom: 10 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" vertical={false} />
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
            tickFormatter={formatEixo}
          />
          <Tooltip content={<TooltipCasos />} cursor={{ fill: 'rgba(20, 17, 12, 0.06)' }} />
          <Bar
            dataKey="casos"
            maxBarSize={72}
            radius={[4, 4, 0, 0]}
            cursor={onAnoClick ? 'pointer' : 'default'}
            onClick={handleBarClick}
          >
            {data.map((entry) => {
              const esmaecida = selectedAno !== null && selectedAno !== undefined && entry.ano !== selectedAno;
              return (
                <Cell
                  key={entry.ano}
                  fill={entry.cor}
                  opacity={esmaecida ? 0.4 : 1}
                  stroke={entry.ano === selectedAno ? '#14110c' : 'none'}
                  strokeWidth={entry.ano === selectedAno ? 2 : 0}
                />
              );
            })}
          </Bar>
        </BarChart>
      </ResponsiveContainer>

      {onAnoClick && (
        <p className="text-xs text-center text-dark-400 mt-2">
          Clique em uma barra para filtrar por ano
        </p>
      )}
      {footer && <p className="text-xs text-dark-400 mt-2">{footer}</p>}
    </div>
  );
}
