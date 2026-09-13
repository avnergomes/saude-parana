/**
 * Barras horizontais de capítulos CID-10 (top N + Outros): um único matiz
 * para os capítulos, cinza para "Outros" (cor vem no campo `cor`), rótulo
 * curto no eixo e percentual no fim de cada barra; o nome completo aparece
 * na dica de ferramenta.
 *
 * Os eixos são filhos diretos do BarChart: com React 19, o Recharts 2 (via
 * react-is 18) não enxerga eixos dentro de Fragment e o gráfico fica sem
 * eixos e sem barras.
 */

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
  LabelList
} from 'recharts';
import { formatNumber, formatPercent } from '../../utils/format';

// Eixo numérico em pt-BR: 30000 -> "30 mil", 1200000 -> "1,2 mi"
function formatEixo(valor) {
  if (valor >= 1e6) return `${(valor / 1e6).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} mi`;
  if (valor >= 1e3) return `${Math.round(valor / 1e3)} mil`;
  return String(valor);
}

// Fora do componente: criar componentes durante o render reinicia o estado
// deles a cada renderização (regra react-hooks/static-components).
function TooltipCapitulo({ active, payload, unidade }) {
  if (!active || !payload || payload.length === 0) return null;
  const item = payload[0].payload;
  return (
    <div className="bg-white rounded-lg shadow-lg border border-neutral-200 p-3">
      <p className="font-semibold text-dark-900 mb-1">{item.nome}</p>
      <p className="text-sm text-dark-600">{formatNumber(item.total)} {unidade}</p>
      <p className="text-xs text-dark-400">{formatPercent(item.percentual)} do total</p>
    </div>
  );
}

export default function CapitulosBarChart({
  data,
  title,
  unidade = 'internações',
  height = 380,
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

  return (
    <div className="bg-white rounded-xl shadow-card p-6">
      {title && <h3 className="font-display font-semibold text-dark-900 mb-4">{title}</h3>}

      <ResponsiveContainer width="100%" height={height}>
        <BarChart
          data={data}
          layout="vertical"
          margin={{ top: 4, right: 56, left: 8, bottom: 4 }}
          barCategoryGap="28%"
        >
          <CartesianGrid horizontal={false} strokeDasharray="3 3" stroke="#e5e7eb" />
          <XAxis
            type="number"
            tick={{ fontSize: 11, fill: '#6b7280' }}
            tickFormatter={formatEixo}
            axisLine={{ stroke: '#d1d5db' }}
            tickLine={false}
          />
          <YAxis
            type="category"
            dataKey="rotulo"
            width={112}
            interval={0}
            tick={{ fontSize: 11, fill: '#6b7280' }}
            axisLine={false}
            tickLine={false}
          />
          <Tooltip
            content={<TooltipCapitulo unidade={unidade} />}
            cursor={{ fill: 'rgba(20, 17, 12, 0.06)' }}
          />
          <Bar dataKey="total" radius={[0, 4, 4, 0]} maxBarSize={22} isAnimationActive={false}>
            {data.map((entry) => (
              <Cell key={entry.codigo} fill={entry.cor} />
            ))}
            <LabelList
              dataKey="percentual"
              position="right"
              formatter={(valor) => formatPercent(valor)}
              style={{ fontSize: 11, fill: '#3c342a' }}
            />
          </Bar>
        </BarChart>
      </ResponsiveContainer>

      {footer && <p className="text-xs text-dark-400 mt-2">{footer}</p>}
    </div>
  );
}
