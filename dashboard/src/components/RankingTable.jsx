/**
 * RankingTable - Tabela ordenável com busca
 * Padrão DataGeo Paraná - Módulo Saúde
 */

import { useState, useMemo } from 'react';
import { Search, ChevronUp, ChevronDown, ArrowUpDown } from 'lucide-react';
import { formatNumber, formatPercent, formatCurrency } from '../utils/format';

function RankingTable({
  data = [],
  columns = [],
  title = 'Ranking',
  defaultSort = null,
  defaultSortDir = 'desc',
  pageSize = 10,
  showSearch = true,
  showRank = true,
  onRowClick,
  selectedRow,
  height = 400
}) {
  const [search, setSearch] = useState('');
  const [sortColumn, setSortColumn] = useState(defaultSort || (columns[0]?.key || null));
  const [sortDirection, setSortDirection] = useState(defaultSortDir);
  const [currentPage, setCurrentPage] = useState(0);

  // Filtrar por busca
  const filteredData = useMemo(() => {
    if (!search.trim()) return data;

    const searchLower = search.toLowerCase();
    return data.filter(row => {
      return columns.some(col => {
        const value = row[col.key];
        if (value === null || value === undefined) return false;
        return String(value).toLowerCase().includes(searchLower);
      });
    });
  }, [data, search, columns]);

  // Ordenar dados
  const sortedData = useMemo(() => {
    if (!sortColumn) return filteredData;

    return [...filteredData].sort((a, b) => {
      const aVal = a[sortColumn];
      const bVal = b[sortColumn];

      // Handle nulls
      if (aVal === null || aVal === undefined) return 1;
      if (bVal === null || bVal === undefined) return -1;

      // Numeric comparison
      if (typeof aVal === 'number' && typeof bVal === 'number') {
        return sortDirection === 'asc' ? aVal - bVal : bVal - aVal;
      }

      // String comparison
      const aStr = String(aVal).toLowerCase();
      const bStr = String(bVal).toLowerCase();
      const comparison = aStr.localeCompare(bStr, 'pt-BR');
      return sortDirection === 'asc' ? comparison : -comparison;
    });
  }, [filteredData, sortColumn, sortDirection]);

  // Paginar
  const totalPages = Math.ceil(sortedData.length / pageSize);
  const paginatedData = useMemo(() => {
    const start = currentPage * pageSize;
    return sortedData.slice(start, start + pageSize);
  }, [sortedData, currentPage, pageSize]);

  // Handler de ordenação
  const handleSort = (columnKey) => {
    if (sortColumn === columnKey) {
      setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortColumn(columnKey);
      setSortDirection('desc');
    }
  };

  // Formatar valor baseado no tipo da coluna
  const formatValue = (value, column) => {
    if (value === null || value === undefined) return '-';

    switch (column.format) {
      case 'number':
        return formatNumber(value);
      case 'percent':
        return formatPercent(value);
      case 'currency':
        return formatCurrency(value);
      case 'decimal':
        return value.toFixed(column.decimals || 1);
      default:
        return value;
    }
  };

  // Render sort icon
  const renderSortIcon = (columnKey) => {
    if (sortColumn !== columnKey) {
      return <ArrowUpDown className="w-3.5 h-3.5 text-dark-300" />;
    }
    return sortDirection === 'asc'
      ? <ChevronUp className="w-4 h-4 text-water-600" />
      : <ChevronDown className="w-4 h-4 text-water-600" />;
  };

  return (
    <div className="bg-white rounded-2xl shadow-card p-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-4">
        <h3 className="font-display font-semibold text-dark-900">{title}</h3>

        {showSearch && (
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-dark-400" />
            <input
              type="text"
              placeholder="Buscar..."
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setCurrentPage(0);
              }}
              className="pl-9 pr-4 py-2 w-full sm:w-64 bg-neutral-50 border border-neutral-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-water-500/20 focus:border-water-500"
            />
          </div>
        )}
      </div>

      <div className="overflow-x-auto" style={{ maxHeight: height }}>
        <table className="w-full">
          <thead className="sticky top-0 bg-white">
            <tr className="border-b border-neutral-200">
              {showRank && (
                <th className="px-3 py-3 text-left text-xs font-semibold text-dark-500 uppercase tracking-wider w-12">
                  #
                </th>
              )}
              {columns.map(col => (
                <th
                  key={col.key}
                  className={`px-3 py-3 text-xs font-semibold text-dark-500 uppercase tracking-wider cursor-pointer hover:text-dark-700 transition-colors ${
                    col.align === 'right' ? 'text-right' : 'text-left'
                  }`}
                  onClick={() => col.sortable !== false && handleSort(col.key)}
                  style={{ width: col.width }}
                >
                  <div className={`flex items-center gap-1 ${col.align === 'right' ? 'justify-end' : ''}`}>
                    <span>{col.label}</span>
                    {col.sortable !== false && renderSortIcon(col.key)}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100">
            {paginatedData.length === 0 ? (
              <tr>
                <td
                  colSpan={columns.length + (showRank ? 1 : 0)}
                  className="px-3 py-8 text-center text-dark-400"
                >
                  {search ? 'Nenhum resultado encontrado' : 'Sem dados disponíveis'}
                </td>
              </tr>
            ) : (
              paginatedData.map((row, index) => {
                const rowKey = row.id || row.cod_ibge || row.codigo || index;
                const isSelected = selectedRow === rowKey;
                const rank = currentPage * pageSize + index + 1;

                return (
                  <tr
                    key={rowKey}
                    onClick={() => onRowClick && onRowClick(row, rowKey)}
                    className={`
                      transition-colors
                      ${onRowClick ? 'cursor-pointer hover:bg-neutral-50' : ''}
                      ${isSelected ? 'bg-water-50' : ''}
                    `}
                  >
                    {showRank && (
                      <td className="px-3 py-3 text-sm font-medium text-dark-400">
                        {rank}
                      </td>
                    )}
                    {columns.map(col => (
                      <td
                        key={col.key}
                        className={`px-3 py-3 text-sm ${
                          col.align === 'right' ? 'text-right' : 'text-left'
                        } ${col.key === columns[0]?.key ? 'font-medium text-dark-900' : 'text-dark-600'}`}
                      >
                        {col.render
                          ? col.render(row[col.key], row)
                          : formatValue(row[col.key], col)
                        }
                      </td>
                    ))}
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Paginação */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between mt-4 pt-4 border-t border-neutral-100">
          <p className="text-sm text-dark-500">
            Mostrando {currentPage * pageSize + 1}-{Math.min((currentPage + 1) * pageSize, sortedData.length)} de {sortedData.length}
          </p>
          <div className="flex gap-1">
            <button
              onClick={() => setCurrentPage(0)}
              disabled={currentPage === 0}
              className="px-2 py-1 text-sm rounded hover:bg-neutral-100 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Primeira
            </button>
            <button
              onClick={() => setCurrentPage(prev => Math.max(0, prev - 1))}
              disabled={currentPage === 0}
              className="px-2 py-1 text-sm rounded hover:bg-neutral-100 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Anterior
            </button>
            <span className="px-3 py-1 text-sm text-dark-600">
              {currentPage + 1} / {totalPages}
            </span>
            <button
              onClick={() => setCurrentPage(prev => Math.min(totalPages - 1, prev + 1))}
              disabled={currentPage >= totalPages - 1}
              className="px-2 py-1 text-sm rounded hover:bg-neutral-100 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Próxima
            </button>
            <button
              onClick={() => setCurrentPage(totalPages - 1)}
              disabled={currentPage >= totalPages - 1}
              className="px-2 py-1 text-sm rounded hover:bg-neutral-100 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Última
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default RankingTable;
