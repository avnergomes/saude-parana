import { Activity, MapPin, Building2, Calendar } from 'lucide-react';

export default function Header({ metadata }) {
  return (
    <header className="bg-gradient-to-r from-water-600 to-water-700 text-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          {/* Logo e Título */}
          <div className="flex items-center gap-4">
            <div className="p-3 bg-white/20 rounded-xl backdrop-blur-sm">
              <Activity className="w-8 h-8" />
            </div>
            <div>
              <h1 className="font-display text-2xl md:text-3xl font-bold">
                Saúde Paraná
              </h1>
              <p className="text-water-100 text-sm md:text-base">
                Indicadores de Saúde Pública do Estado
              </p>
            </div>
          </div>

          {/* Stats rápidas */}
          <div className="flex flex-wrap gap-4 md:gap-6">
            <div className="flex items-center gap-2 text-sm">
              <MapPin className="w-4 h-4 text-water-200" />
              <span className="text-water-100">399</span>
              <span className="text-water-200">municípios</span>
            </div>
            <div className="flex items-center gap-2 text-sm">
              <Building2 className="w-4 h-4 text-water-200" />
              <span className="text-water-100">22</span>
              <span className="text-water-200">regionais</span>
            </div>
            <div className="flex items-center gap-2 text-sm">
              <Calendar className="w-4 h-4 text-water-200" />
              <span className="text-water-100">2010-2024</span>
              <span className="text-water-200">período</span>
            </div>
          </div>
        </div>

        {/* Fonte dos dados */}
        <div className="mt-4 pt-4 border-t border-water-500/30">
          <p className="text-xs text-water-200">
            Fontes: DATASUS (SIM, SIH, SI-PNI, CNES), FNS/MS, SISAB/Previne Brasil, IBGE
          </p>
        </div>
      </div>
    </header>
  );
}
