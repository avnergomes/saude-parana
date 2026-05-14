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
// Gradientes para mapas
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

// ATLAS-PALETTE-V1
// Re-export the shared Atlas Editorial palette (daltonic-safe).
export { CHART_COLORS, MAP_GRADIENTS, ATLAS_CATEGORICAL, ATLAS_FOREST, ATLAS_WATER, ATLAS_CLAY, ATLAS_EARTH, ATLAS_HARVEST, ATLAS_DIVERGING, ATLAS_CHROME, categoricalColor, sequentialColor } from './chart-palette.js';
