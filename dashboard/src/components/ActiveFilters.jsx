import { X } from 'lucide-react';

const filterLabels = {
  causa: 'Causa',
  capitulo: 'Capítulo CID',
  regional: 'Regional',
  municipio: 'Município',
  ano: 'Ano',
  vacina: 'Vacina',
  tipoEstabelecimento: 'Tipo',
  blocoFinanciamento: 'Bloco',
  grupoDiagnostico: 'Diagnóstico'
};

export default function ActiveFilters({ filters, onClear, onRemove }) {
  const activeFilters = Object.entries(filters).filter(
    ([_, value]) => value !== null && value !== undefined
  );

  if (activeFilters.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-2 p-3 bg-water-50 border border-water-200 rounded-lg mb-4">
      <span className="text-sm font-medium text-water-700">
        Filtros ativos:
      </span>

      {activeFilters.map(([key, value]) => (
        <span
          key={key}
          className="inline-flex items-center gap-1 px-2 py-1 bg-water-100 text-water-800 rounded-full text-sm"
        >
          <span className="text-water-600">{filterLabels[key] || key}:</span>
          <span className="font-medium">{value}</span>
          <button
            onClick={() => onRemove(key)}
            className="ml-1 p-0.5 hover:bg-water-200 rounded-full transition-colors"
            aria-label={`Remover filtro ${filterLabels[key]}`}
          >
            <X className="w-3 h-3" />
          </button>
        </span>
      ))}

      <button
        onClick={onClear}
        className="text-sm text-water-600 hover:text-water-800 ml-2 underline transition-colors"
      >
        Limpar todos
      </button>
    </div>
  );
}
