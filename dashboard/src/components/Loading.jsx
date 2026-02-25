import { Activity } from 'lucide-react';

export default function Loading() {
  return (
    <div className="min-h-screen bg-neutral-50 flex items-center justify-center">
      <div className="text-center">
        {/* Ícone animado */}
        <div className="relative">
          <div className="w-20 h-20 rounded-full bg-water-100 animate-ping absolute inset-0 opacity-75"></div>
          <div className="relative w-20 h-20 rounded-full bg-water-500 flex items-center justify-center">
            <Activity className="w-10 h-10 text-white animate-pulse" />
          </div>
        </div>

        {/* Texto */}
        <div className="mt-6">
          <h2 className="font-display text-xl font-semibold text-dark-900">
            Carregando dados...
          </h2>
          <p className="text-dark-500 mt-2">
            Saúde Paraná
          </p>
        </div>

        {/* Skeleton cards */}
        <div className="mt-8 flex gap-4 justify-center">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="w-24 h-16 bg-white rounded-lg shadow-card animate-pulse"
            />
          ))}
        </div>
      </div>
    </div>
  );
}
