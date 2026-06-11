import {
  LayoutDashboard,
  Skull
} from 'lucide-react';

// Abas restritas aos domínios com fonte real (IBGE Registro Civil).
// Internações/Vacinação/Infraestrutura/Financiamento exibiam dados
// simulados e foram removidas até existir ingestão real do DATASUS.
const tabs = [
  { id: 'visao-geral', label: 'Visão Geral', icon: LayoutDashboard },
  { id: 'mortalidade', label: 'Mortalidade', icon: Skull },
];

export default function Tabs({ activeTab, onTabChange }) {
  return (
    <div className="bg-white border-b border-neutral-200 sticky top-0 z-40">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <nav className="flex overflow-x-auto scrollbar-hide -mb-px">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;

            return (
              <button
                key={tab.id}
                onClick={() => onTabChange(tab.id)}
                className={`
                  flex items-center gap-2 px-4 py-4 border-b-2 font-medium text-sm
                  whitespace-nowrap transition-colors
                  ${isActive
                    ? 'border-water-500 text-water-600'
                    : 'border-transparent text-dark-500 hover:text-dark-700 hover:border-dark-300'
                  }
                `}
              >
                <Icon className="w-4 h-4" />
                <span className="hidden sm:inline">{tab.label}</span>
              </button>
            );
          })}
        </nav>
      </div>
    </div>
  );
}

export { tabs };
