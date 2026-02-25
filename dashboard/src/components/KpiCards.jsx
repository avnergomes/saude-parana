import {
  Skull,
  BedDouble,
  Syringe,
  Building2,
  Bed,
  Wallet,
  TrendingUp,
  TrendingDown,
  Minus
} from 'lucide-react';
import { formatNumber, formatCurrency, formatPercent } from '../utils/format';

const kpiConfig = {
  obitos: {
    label: 'Óbitos',
    sublabel: 'último ano',
    icon: Skull,
    color: 'health',
    format: (v) => formatNumber(v)
  },
  internacoes: {
    label: 'Internações SUS',
    sublabel: 'último ano',
    icon: BedDouble,
    color: 'water',
    format: (v) => formatNumber(v)
  },
  coberturaVacinal: {
    label: 'Cobertura Vacinal',
    sublabel: 'média infantil',
    icon: Syringe,
    color: 'forest',
    format: (v) => formatPercent(v, 1)
  },
  estabelecimentos: {
    label: 'Estabelecimentos',
    sublabel: 'ativos no PR',
    icon: Building2,
    color: 'secondary',
    format: (v) => formatNumber(v)
  },
  leitosSus: {
    label: 'Leitos SUS',
    sublabel: 'disponíveis',
    icon: Bed,
    color: 'water',
    format: (v) => formatNumber(v)
  },
  repassePerCapita: {
    label: 'Repasse SUS',
    sublabel: 'per capita/ano',
    icon: Wallet,
    color: 'harvest',
    format: (v) => formatCurrency(v, true)
  }
};

const colorClasses = {
  health: {
    bg: 'bg-red-50',
    icon: 'bg-red-100 text-red-600',
    text: 'text-red-600'
  },
  water: {
    bg: 'bg-water-50',
    icon: 'bg-water-100 text-water-600',
    text: 'text-water-600'
  },
  forest: {
    bg: 'bg-green-50',
    icon: 'bg-green-100 text-green-600',
    text: 'text-green-600'
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
      // Para mortalidade, aumento é negativo
      variationColor = kpiKey === 'obitos' ? 'text-red-500' : 'text-green-500';
    } else if (variacao < 0) {
      VariationIcon = TrendingDown;
      variationColor = kpiKey === 'obitos' ? 'text-green-500' : 'text-red-500';
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
  const kpiKeys = ['obitos', 'internacoes', 'coberturaVacinal', 'estabelecimentos', 'leitosSus', 'repassePerCapita'];

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 mb-6">
      {kpiKeys.map((key) => (
        <KpiCard key={key} kpiKey={key} data={kpis?.[key]} />
      ))}
    </div>
  );
}
