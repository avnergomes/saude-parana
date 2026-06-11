import {
  Skull,
  Activity,
  Baby,
  Users,
  TrendingUp,
  TrendingDown,
  Minus
} from 'lucide-react';
import { formatNumber } from '../utils/format';

// KPIs restritos ao que tem fonte real (IBGE Registro Civil + população).
const kpiConfig = {
  obitos: {
    label: 'Óbitos',
    sublabel: 'último ano',
    icon: Skull,
    color: 'health',
    format: (v) => formatNumber(v)
  },
  taxaBruta: {
    label: 'Taxa Bruta',
    sublabel: 'óbitos/1.000 hab',
    icon: Activity,
    color: 'water',
    format: (v) => (v == null ? '-' : v.toFixed(1))
  },
  nascidos: {
    label: 'Nascidos Vivos',
    sublabel: 'último ano',
    icon: Baby,
    color: 'forest',
    format: (v) => formatNumber(v)
  },
  populacao: {
    label: 'População',
    sublabel: 'estimativa IBGE',
    icon: Users,
    color: 'secondary',
    format: (v) => formatNumber(v)
  }
};

const colorClasses = {
  health: {
    bg: 'bg-orange-50',
    icon: 'bg-orange-100 text-orange-700',
    text: 'text-orange-700'
  },
  water: {
    bg: 'bg-water-50',
    icon: 'bg-water-100 text-water-600',
    text: 'text-water-600'
  },
  forest: {
    bg: 'bg-sky-50',
    icon: 'bg-sky-100 text-sky-700',
    text: 'text-sky-700'
  },
  secondary: {
    bg: 'bg-indigo-50',
    icon: 'bg-indigo-100 text-indigo-600',
    text: 'text-indigo-600'
  },
  harvest: {
    bg: 'bg-amber-50',
    icon: 'bg-amber-100 text-amber-600',
    text: 'text-amber-600'
  }
};

function KpiCard({ kpiKey, data }) {
  const config = kpiConfig[kpiKey];
  if (!config) return null;

  const { label, sublabel, icon: Icon, color, format } = config;
  const colors = colorClasses[color];
  const { valor, variacao } = data || { valor: 0, variacao: null };

  // Determinar ícone e cor da variação
  let VariationIcon = Minus;
  let variationColor = 'text-dark-400';

  if (variacao !== null && variacao !== undefined) {
    if (variacao > 0) {
      VariationIcon = TrendingUp;
      // Para mortalidade, aumento é negativo. Par azul/laranja em vez de
      // verde/vermelho (regra daltônica); o ícone reforça a direção.
      variationColor = kpiKey === 'obitos' ? 'text-orange-700' : 'text-sky-700';
    } else if (variacao < 0) {
      VariationIcon = TrendingDown;
      variationColor = kpiKey === 'obitos' ? 'text-sky-700' : 'text-orange-700';
    }
  }

  return (
    <div className={`${colors.bg} rounded-xl p-4 transition-shadow hover:shadow-md`}>
      <div className="flex items-start justify-between">
        <div className={`p-2 rounded-lg ${colors.icon}`}>
          <Icon className="w-5 h-5" />
        </div>

        {variacao !== null && variacao !== undefined && (
          <div className={`flex items-center gap-1 text-sm ${variationColor}`}>
            <VariationIcon className="w-4 h-4" />
            <span>{variacao > 0 ? '+' : ''}{variacao.toFixed(1)}%</span>
          </div>
        )}
      </div>

      <div className="mt-3">
        <p className={`text-2xl font-display font-bold ${colors.text}`}>
          {format(valor)}
        </p>
        <p className="text-sm text-dark-600 mt-1">{label}</p>
        <p className="text-xs text-dark-400">{sublabel}</p>
      </div>
    </div>
  );
}

export default function KpiCards({ kpis }) {
  const kpiKeys = ['obitos', 'taxaBruta', 'nascidos', 'populacao'];

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
      {kpiKeys.map((key) => (
        <KpiCard key={key} kpiKey={key} data={kpis?.[key]} />
      ))}
    </div>
  );
}
