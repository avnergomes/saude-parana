import { useState, useMemo } from 'react';
import { ChevronDown, X, Search } from 'lucide-react';

export default function Filters({
  metadata,
  geoMap,
  filters,
  onFiltersChange
}) {
  const [openDropdown, setOpenDropdown] = useState(null);
  const [searchMunicipio, setSearchMunicipio] = useState('');

  // Anos disponiveis
  const anos = useMemo(() => {
    return metadata?.filtros?.anosDisponiveis || [];
  }, [metadata]);

  // Regionais
  const regionais = useMemo(() => {
    return geoMap?.regionais || [];
  }, [geoMap]);

  // Mesorregioes
  const mesorregioes = useMemo(() => {
    return geoMap?.mesorregioes || [];
  }, [geoMap]);

  // Municipios filtrados por regional (usando nome da regional como chave)
  const municipios = useMemo(() => {
    if (!geoMap?.municipiosPorRegional) return [];

    let lista = [];

    if (filters.regional) {
      // Buscar pelo nome da regional
      lista = geoMap.municipiosPorRegional[filters.regional] || [];
    } else if (filters.mesorregiao) {
      // Buscar pela mesorregiao
      lista = geoMap.municipiosPorMesorregiao?.[filters.mesorregiao] || [];
    } else {
      // Todos os municipios
      lista = Object.values(geoMap.municipiosPorRegional).flat();
    }

    // Ordenar por nome
    lista = lista.sort((a, b) => (a.nome || a).localeCompare(b.nome || b, 'pt-BR'));

    // Filtrar por busca
    if (searchMunicipio.trim()) {
      const search = searchMunicipio.toLowerCase();
      lista = lista.filter(m => {
        const nome = typeof m === 'string' ? m : m.nome;
        return nome.toLowerCase().includes(search);
      });
    }

    return lista;
  }, [geoMap, filters.regional, filters.mesorregiao, searchMunicipio]);

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

  const handleRegionalChange = (regionalNome) => {
    onFiltersChange({
      ...filters,
      regional: regionalNome === filters.regional ? null : regionalNome,
      municipio: null // Reset municipio quando regional muda
    });
    setOpenDropdown(null);
    setSearchMunicipio('');
  };

  const handleMesorregiaoChange = (mesorregiao) => {
    onFiltersChange({
      ...filters,
      mesorregiao: mesorregiao === filters.mesorregiao ? null : mesorregiao,
      regional: null, // Reset regional quando mesorregiao muda
      municipio: null
    });
    setOpenDropdown(null);
    setSearchMunicipio('');
  };

  const handleMunicipioChange = (municipio) => {
    // municipio pode ser objeto {cod_ibge, nome} ou string
    const codIbge = typeof municipio === 'object' ? municipio.cod_ibge : null;
    const nome = typeof municipio === 'object' ? municipio.nome : municipio;

    onFiltersChange({
      ...filters,
      municipio: nome === filters.municipio ? null : nome,
      municipioCodigo: codIbge
    });
    setOpenDropdown(null);
    setSearchMunicipio('');
  };

  const clearFilters = () => {
    onFiltersChange({
      anoMin: anos[0] || 2010,
      anoMax: anos[anos.length - 1] || 2024,
      regional: null,
      mesorregiao: null,
      municipio: null,
      municipioCodigo: null
    });
    setSearchMunicipio('');
  };

  const hasActiveFilters = filters.regional || filters.mesorregiao || filters.municipio;

  return (
    <div className="bg-white rounded-xl shadow-card p-4 mb-6">
      <div className="flex flex-wrap items-center gap-4">
        {/* Periodo */}
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-dark-600">Periodo:</span>

          {/* Ano Minimo */}
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

          {/* Ano Maximo */}
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

        {/* Mesorregiao */}
        <div className="relative">
          <button
            onClick={() => setOpenDropdown(openDropdown === 'mesorregiao' ? null : 'mesorregiao')}
            className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-sm transition-colors ${
              filters.mesorregiao
                ? 'bg-primary-100 text-primary-700 border border-primary-300'
                : 'bg-neutral-100 hover:bg-neutral-200'
            }`}
          >
            {filters.mesorregiao || 'Mesorregiao'}
            <ChevronDown className="w-4 h-4" />
          </button>
          {openDropdown === 'mesorregiao' && (
            <div className="absolute top-full mt-1 left-0 bg-white rounded-lg shadow-lg border border-neutral-200 py-1 z-50 max-h-64 overflow-y-auto w-56">
              <button
                onClick={() => handleMesorregiaoChange(null)}
                className="w-full px-4 py-1.5 text-left text-sm hover:bg-neutral-100 text-dark-500"
              >
                Todas as mesorregioes
              </button>
              {mesorregioes.map((meso) => (
                <button
                  key={meso.nome}
                  onClick={() => handleMesorregiaoChange(meso.nome)}
                  className={`w-full px-4 py-1.5 text-left text-sm hover:bg-neutral-100 ${
                    filters.mesorregiao === meso.nome ? 'bg-primary-50 text-primary-600' : ''
                  }`}
                >
                  {meso.nome} ({meso.totalMunicipios})
                </button>
              ))}
            </div>
          )}
        </div>

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
            {filters.regional || 'Regional'}
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
                  onClick={() => handleRegionalChange(reg.nome)}
                  className={`w-full px-4 py-1.5 text-left text-sm hover:bg-neutral-100 ${
                    filters.regional === reg.nome ? 'bg-water-50 text-water-600' : ''
                  }`}
                >
                  {reg.nome} ({reg.totalMunicipios})
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Municipio */}
        <div className="relative">
          <button
            onClick={() => setOpenDropdown(openDropdown === 'municipio' ? null : 'municipio')}
            className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-sm transition-colors ${
              filters.municipio
                ? 'bg-water-100 text-water-700 border border-water-300'
                : 'bg-neutral-100 hover:bg-neutral-200'
            }`}
          >
            {filters.municipio || 'Municipio'}
            <ChevronDown className="w-4 h-4" />
          </button>
          {openDropdown === 'municipio' && (
            <div className="absolute top-full mt-1 left-0 bg-white rounded-lg shadow-lg border border-neutral-200 z-50 w-64">
              {/* Busca */}
              <div className="p-2 border-b border-neutral-100">
                <div className="relative">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-dark-400" />
                  <input
                    type="text"
                    placeholder="Buscar municipio..."
                    value={searchMunicipio}
                    onChange={(e) => setSearchMunicipio(e.target.value)}
                    className="w-full pl-8 pr-3 py-1.5 text-sm bg-neutral-50 border border-neutral-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-water-500/20 focus:border-water-500"
                    autoFocus
                  />
                </div>
              </div>

              {/* Lista de municipios */}
              <div className="max-h-64 overflow-y-auto py-1">
                <button
                  onClick={() => handleMunicipioChange(null)}
                  className="w-full px-4 py-1.5 text-left text-sm hover:bg-neutral-100 text-dark-500"
                >
                  Todos os municipios
                </button>
                {municipios.slice(0, 100).map((mun, index) => {
                  const nome = typeof mun === 'object' ? mun.nome : mun;
                  const key = typeof mun === 'object' ? mun.cod_ibge : `${nome}-${index}`;

                  return (
                    <button
                      key={key}
                      onClick={() => handleMunicipioChange(mun)}
                      className={`w-full px-4 py-1.5 text-left text-sm hover:bg-neutral-100 truncate ${
                        filters.municipio === nome ? 'bg-water-50 text-water-600' : ''
                      }`}
                    >
                      {nome}
                    </button>
                  );
                })}
                {municipios.length > 100 && (
                  <div className="px-4 py-1.5 text-xs text-dark-400">
                    +{municipios.length - 100} municipios (use a busca)
                  </div>
                )}
                {municipios.length === 0 && searchMunicipio && (
                  <div className="px-4 py-2 text-sm text-dark-400 text-center">
                    Nenhum municipio encontrado
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

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

      {/* Resumo dos filtros ativos */}
      {hasActiveFilters && (
        <div className="mt-3 pt-3 border-t border-neutral-100 flex flex-wrap gap-2">
          {filters.mesorregiao && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-primary-50 text-primary-700 rounded text-xs">
              Meso: {filters.mesorregiao}
              <X
                className="w-3 h-3 cursor-pointer hover:text-primary-900"
                onClick={() => handleMesorregiaoChange(null)}
              />
            </span>
          )}
          {filters.regional && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-water-50 text-water-700 rounded text-xs">
              Regional: {filters.regional}
              <X
                className="w-3 h-3 cursor-pointer hover:text-water-900"
                onClick={() => handleRegionalChange(null)}
              />
            </span>
          )}
          {filters.municipio && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-water-50 text-water-700 rounded text-xs">
              {filters.municipio}
              <X
                className="w-3 h-3 cursor-pointer hover:text-water-900"
                onClick={() => handleMunicipioChange(null)}
              />
            </span>
          )}
        </div>
      )}

      {/* Overlay para fechar dropdowns */}
      {openDropdown && (
        <div
          className="fixed inset-0 z-40"
          onClick={() => {
            setOpenDropdown(null);
            setSearchMunicipio('');
          }}
        />
      )}
    </div>
  );
}
