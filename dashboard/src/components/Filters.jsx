import { useState, useMemo } from 'react';
import { ChevronDown, X } from 'lucide-react';

export default function Filters({
  metadata,
  geoMap,
  filters,
  onFiltersChange
}) {
  const [openDropdown, setOpenDropdown] = useState(null);

  // Anos disponíveis
  const anos = useMemo(() => {
    return metadata?.filtros?.anosDisponiveis || [];
  }, [metadata]);

  // Regionais de saúde
  const regionais = useMemo(() => {
    return geoMap?.regionais || [];
  }, [geoMap]);

  // Municípios filtrados por regional
  const municipios = useMemo(() => {
    if (!geoMap?.municipiosPorRegional) return [];
    if (filters.regional) {
      return geoMap.municipiosPorRegional[filters.regional] || [];
    }
    return Object.values(geoMap.municipiosPorRegional).flat().sort();
  }, [geoMap, filters.regional]);

  const handleAnoMinChange = (ano) => {
    onFiltersChange({
      ...filters,
      anoMin: ano,
      anoMax: Math.max(ano, filters.anoMax || ano)
    });
    setOpenDropdown(null);
  };

  const handleAnoMaxChange = (ano) => {
    onFiltersChange({
      ...filters,
      anoMax: ano,
      anoMin: Math.min(ano, filters.anoMin || ano)
    });
    setOpenDropdown(null);
  };

  const handleRegionalChange = (regional) => {
    onFiltersChange({
      ...filters,
      regional: regional === filters.regional ? null : regional,
      municipio: null // Reset município quando regional muda
    });
    setOpenDropdown(null);
  };

  const handleMunicipioChange = (municipio) => {
    onFiltersChange({
      ...filters,
      municipio: municipio === filters.municipio ? null : municipio
    });
    setOpenDropdown(null);
  };

  const clearFilters = () => {
    onFiltersChange({
      anoMin: anos[0] || 2010,
      anoMax: anos[anos.length - 1] || 2024,
      regional: null,
      municipio: null
    });
  };

  const hasActiveFilters = filters.regional || filters.municipio;

  return (
    <div className="bg-white rounded-xl shadow-card p-4 mb-6">
      <div className="flex flex-wrap items-center gap-4">
        {/* Período */}
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-dark-600">Período:</span>

          {/* Ano Mínimo */}
          <div className="relative">
            <button
              onClick={() => setOpenDropdown(openDropdown === 'anoMin' ? null : 'anoMin')}
              className="flex items-center gap-1 px-3 py-1.5 bg-neutral-100 hover:bg-neutral-200 rounded-lg text-sm transition-colors"
            >
              {filters.anoMin || anos[0]}
              <ChevronDown className="w-4 h-4" />
            </button>
            {openDropdown === 'anoMin' && (
              <div className="absolute top-full mt-1 left-0 bg-white rounded-lg shadow-lg border border-neutral-200 py-1 z-50 max-h-48 overflow-y-auto">
                {anos.map((ano) => (
                  <button
                    key={ano}
                    onClick={() => handleAnoMinChange(ano)}
                    className={`w-full px-4 py-1.5 text-left text-sm hover:bg-neutral-100 ${
                      filters.anoMin === ano ? 'bg-water-50 text-water-600' : ''
                    }`}
                  >
                    {ano}
                  </button>
                ))}
              </div>
            )}
          </div>

          <span className="text-dark-400">a</span>

          {/* Ano Máximo */}
          <div className="relative">
            <button
              onClick={() => setOpenDropdown(openDropdown === 'anoMax' ? null : 'anoMax')}
              className="flex items-center gap-1 px-3 py-1.5 bg-neutral-100 hover:bg-neutral-200 rounded-lg text-sm transition-colors"
            >
              {filters.anoMax || anos[anos.length - 1]}
              <ChevronDown className="w-4 h-4" />
            </button>
            {openDropdown === 'anoMax' && (
              <div className="absolute top-full mt-1 left-0 bg-white rounded-lg shadow-lg border border-neutral-200 py-1 z-50 max-h-48 overflow-y-auto">
                {anos.filter(a => a >= (filters.anoMin || 0)).map((ano) => (
                  <button
                    key={ano}
                    onClick={() => handleAnoMaxChange(ano)}
                    className={`w-full px-4 py-1.5 text-left text-sm hover:bg-neutral-100 ${
                      filters.anoMax === ano ? 'bg-water-50 text-water-600' : ''
                    }`}
                  >
                    {ano}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Separador */}
        <div className="h-6 w-px bg-neutral-200 hidden sm:block" />

        {/* Regional */}
        <div className="relative">
          <button
            onClick={() => setOpenDropdown(openDropdown === 'regional' ? null : 'regional')}
            className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-sm transition-colors ${
              filters.regional
                ? 'bg-water-100 text-water-700 border border-water-300'
                : 'bg-neutral-100 hover:bg-neutral-200'
            }`}
          >
            {filters.regional
              ? regionais.find(r => r.codigo === filters.regional)?.nome || 'Regional'
              : 'Regional de Saúde'}
            <ChevronDown className="w-4 h-4" />
          </button>
          {openDropdown === 'regional' && (
            <div className="absolute top-full mt-1 left-0 bg-white rounded-lg shadow-lg border border-neutral-200 py-1 z-50 max-h-64 overflow-y-auto w-64">
              <button
                onClick={() => handleRegionalChange(null)}
                className="w-full px-4 py-1.5 text-left text-sm hover:bg-neutral-100 text-dark-500"
              >
                Todas as regionais
              </button>
              {regionais.map((reg) => (
                <button
                  key={reg.codigo}
                  onClick={() => handleRegionalChange(reg.codigo)}
                  className={`w-full px-4 py-1.5 text-left text-sm hover:bg-neutral-100 ${
                    filters.regional === reg.codigo ? 'bg-water-50 text-water-600' : ''
                  }`}
                >
                  {reg.nome}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Município */}
        {municipios.length > 0 && (
          <div className="relative">
            <button
              onClick={() => setOpenDropdown(openDropdown === 'municipio' ? null : 'municipio')}
              className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-sm transition-colors ${
                filters.municipio
                  ? 'bg-water-100 text-water-700 border border-water-300'
                  : 'bg-neutral-100 hover:bg-neutral-200'
              }`}
            >
              {filters.municipio || 'Município'}
              <ChevronDown className="w-4 h-4" />
            </button>
            {openDropdown === 'municipio' && (
              <div className="absolute top-full mt-1 left-0 bg-white rounded-lg shadow-lg border border-neutral-200 py-1 z-50 max-h-64 overflow-y-auto w-56">
                <button
                  onClick={() => handleMunicipioChange(null)}
                  className="w-full px-4 py-1.5 text-left text-sm hover:bg-neutral-100 text-dark-500"
                >
                  Todos os municípios
                </button>
                {municipios.slice(0, 50).map((mun) => (
                  <button
                    key={mun}
                    onClick={() => handleMunicipioChange(mun)}
                    className={`w-full px-4 py-1.5 text-left text-sm hover:bg-neutral-100 truncate ${
                      filters.municipio === mun ? 'bg-water-50 text-water-600' : ''
                    }`}
                  >
                    {mun}
                  </button>
                ))}
                {municipios.length > 50 && (
                  <div className="px-4 py-1.5 text-xs text-dark-400">
                    +{municipios.length - 50} municípios...
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Limpar filtros */}
        {hasActiveFilters && (
          <button
            onClick={clearFilters}
            className="flex items-center gap-1 px-3 py-1.5 text-sm text-dark-500 hover:text-dark-700 transition-colors"
          >
            <X className="w-4 h-4" />
            Limpar
          </button>
        )}
      </div>

      {/* Overlay para fechar dropdowns */}
      {openDropdown && (
        <div
          className="fixed inset-0 z-40"
          onClick={() => setOpenDropdown(null)}
        />
      )}
    </div>
  );
}
