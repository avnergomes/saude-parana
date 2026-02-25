/**
 * Utilitários de formatação para o dashboard Saúde Paraná
 * Padrão brasileiro de números, moeda e datas
 */

// Formatação de moeda brasileira
export function formatCurrency(value, showSymbol = true) {
  if (value === null || value === undefined || isNaN(value)) return '-';

  const absValue = Math.abs(value);
  let formatted;

  if (absValue >= 1e9) {
    formatted = (value / 1e9).toLocaleString('pt-BR', {
      minimumFractionDigits: 1,
      maximumFractionDigits: 1
    }) + ' bi';
  } else if (absValue >= 1e6) {
    formatted = (value / 1e6).toLocaleString('pt-BR', {
      minimumFractionDigits: 1,
      maximumFractionDigits: 1
    }) + ' mi';
  } else if (absValue >= 1e3) {
    formatted = (value / 1e3).toLocaleString('pt-BR', {
      minimumFractionDigits: 0,
      maximumFractionDigits: 1
    }) + ' mil';
  } else {
    formatted = value.toLocaleString('pt-BR', {
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    });
  }

  return showSymbol ? `R$ ${formatted}` : formatted;
}

// Formatação de números com unidade
export function formatNumber(value, unit = '') {
  if (value === null || value === undefined || isNaN(value)) return '-';

  const absValue = Math.abs(value);
  let formatted;

  if (absValue >= 1e6) {
    formatted = (value / 1e6).toLocaleString('pt-BR', {
      minimumFractionDigits: 1,
      maximumFractionDigits: 1
    }) + ' mi';
  } else if (absValue >= 1e3) {
    formatted = (value / 1e3).toLocaleString('pt-BR', {
      minimumFractionDigits: 0,
      maximumFractionDigits: 1
    }) + ' mil';
  } else {
    formatted = value.toLocaleString('pt-BR', {
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    });
  }

  return unit ? `${formatted} ${unit}` : formatted;
}

// Formatação de porcentagem
export function formatPercent(value, decimals = 1) {
  if (value === null || value === undefined || isNaN(value)) return '-';
  return value.toLocaleString('pt-BR', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals
  }) + '%';
}

// Formatação de taxa (por 1000 hab)
export function formatRate(value, decimals = 1) {
  if (value === null || value === undefined || isNaN(value)) return '-';
  return value.toLocaleString('pt-BR', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals
  }) + '/mil hab';
}

// Cálculo e formatação de variação percentual
export function formatVariation(current, previous) {
  if (!previous || previous === 0) return { text: '-', isPositive: null };

  const variation = ((current - previous) / previous) * 100;
  const isPositive = variation > 0;
  const text = (isPositive ? '+' : '') + variation.toLocaleString('pt-BR', {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1
  }) + '%';

  return { text, isPositive, value: variation };
}

// Calcula variação entre dois valores
export function calculateVariation(current, previous) {
  if (!previous || previous === 0) return null;
  return ((current - previous) / previous) * 100;
}

// Formatação de data brasileira
export function formatDate(dateString) {
  if (!dateString) return '-';
  const date = new Date(dateString);
  return date.toLocaleDateString('pt-BR');
}

// Formatação de data e hora
export function formatDateTime(dateString) {
  if (!dateString) return '-';
  const date = new Date(dateString);
  return date.toLocaleString('pt-BR');
}

// Cores para gráficos
export const CHART_COLORS = {
  // Cores principais do módulo saúde (azul water)
  primary: ['#0ea5e9', '#0284c7', '#0369a1', '#075985', '#0c4a6e'],

  // Cores secundárias (verde forest)
  secondary: ['#10b981', '#059669', '#047857', '#065f46', '#064e3b'],

  // Cores de destaque (vermelho health)
  accent: ['#ef4444', '#dc2626', '#b91c1c', '#991b1b', '#7f1d1d'],

  // Arco-íris para múltiplas categorias
  rainbow: [
    '#ef4444', '#f59e0b', '#10b981', '#3b82f6', '#8b5cf6',
    '#ec4899', '#14b8a6', '#f97316', '#6366f1', '#84cc16'
  ],

  // Tons neutros
  neutral: ['#64748b', '#475569', '#334155', '#1e293b', '#0f172a'],

  // Positivo/Negativo
  positive: '#10b981',
  negative: '#ef4444',
  warning: '#f59e0b'
};

// Gradientes para mapas
export const MAP_GRADIENTS = {
  // Azul (padrão saúde)
  blue: ['#e0f2fe', '#bae6fd', '#7dd3fc', '#38bdf8', '#0ea5e9', '#0284c7', '#0369a1'],

  // Verde (indicadores positivos)
  green: ['#d1fae5', '#a7f3d0', '#6ee7b7', '#34d399', '#10b981', '#059669', '#047857'],

  // Vermelho (mortalidade, alertas)
  red: ['#fee2e2', '#fecaca', '#fca5a5', '#f87171', '#ef4444', '#dc2626', '#b91c1c'],

  // Amarelo (vacinação, cobertura)
  yellow: ['#fef9c3', '#fef08a', '#fde047', '#facc15', '#eab308', '#ca8a04', '#a16207'],

  // Roxo (infraestrutura)
  purple: ['#f3e8ff', '#e9d5ff', '#d8b4fe', '#c084fc', '#a855f7', '#9333ea', '#7c3aed']
};

// Função para obter cor baseada em valor (escala)
export function getColorScale(value, min, max, gradient = MAP_GRADIENTS.blue) {
  if (value === null || value === undefined) return '#e5e7eb';

  const normalized = Math.max(0, Math.min(1, (value - min) / (max - min)));
  const index = Math.floor(normalized * (gradient.length - 1));

  return gradient[index];
}

// Abreviação de nomes longos
export function truncateName(name, maxLength = 20) {
  if (!name) return '';
  if (name.length <= maxLength) return name;
  return name.substring(0, maxLength - 3) + '...';
}

// Formatação de código IBGE (6 dígitos)
export function formatCodIBGE(codigo) {
  if (!codigo) return '';
  const str = String(codigo);
  // Remover dígito verificador se tiver 7 dígitos
  return str.length === 7 ? str.substring(0, 6) : str;
}
