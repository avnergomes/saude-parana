import { useRef, useEffect, useState } from 'react';
import { LayoutDashboard, Skull, ChevronLeft, ChevronRight } from 'lucide-react';

// Abas restritas aos domínios com fonte real (IBGE Registro Civil).
// Internações/Vacinação/Infraestrutura/Financiamento exibiam dados
// simulados e foram removidas até existir ingestão real do DATASUS.
const tabs = [
  { id: 'visao-geral', label: 'Visão Geral', icon: LayoutDashboard },
  { id: 'mortalidade', label: 'Mortalidade', icon: Skull },
];

export default function Tabs({ activeTab, onTabChange }) {
  const scrollRef = useRef(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  const checkScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    setCanScrollLeft(el.scrollLeft > 4);
    setCanScrollRight(el.scrollLeft < el.scrollWidth - el.clientWidth - 4);
  };

  useEffect(() => {
    checkScroll();
    const el = scrollRef.current;
    if (el) {
      el.addEventListener('scroll', checkScroll, { passive: true });
      window.addEventListener('resize', checkScroll);
      return () => {
        el.removeEventListener('scroll', checkScroll);
        window.removeEventListener('resize', checkScroll);
      };
    }
  }, []);

  const scroll = (dir) => {
    scrollRef.current?.scrollBy({ left: dir * 160, behavior: 'smooth' });
  };

  return (
    <div className="bg-white border-b border-neutral-200 sticky top-0 z-40">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative">
        {canScrollLeft && (
          <button
            onClick={() => scroll(-1)}
            className="absolute left-4 top-1/2 -translate-y-1/2 z-10 p-1 bg-white/90 backdrop-blur-sm rounded-full shadow-md border border-neutral-200 sm:hidden"
            aria-label="Rolar abas para a esquerda"
          >
            <ChevronLeft className="w-4 h-4 text-neutral-600" />
          </button>
        )}
        <nav
          ref={scrollRef}
          className="flex overflow-x-auto scrollbar-hide -mb-px"
        >
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;

            return (
              <button
                key={tab.id}
                onClick={() => onTabChange(tab.id)}
                role="tab"
                aria-selected={isActive}
                className={`
                  flex items-center gap-2 px-4 py-4 border-b-2 font-medium text-sm
                  whitespace-nowrap transition-colors min-h-[44px]
                  ${isActive
                    ? 'border-water-500 text-water-600'
                    : 'border-transparent text-dark-500 hover:text-dark-700 hover:border-dark-300'
                  }
                `}
              >
                <Icon className="w-4 h-4" />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </nav>
        {canScrollRight && (
          <button
            onClick={() => scroll(1)}
            className="absolute right-4 top-1/2 -translate-y-1/2 z-10 p-1 bg-white/90 backdrop-blur-sm rounded-full shadow-md border border-neutral-200 sm:hidden"
            aria-label="Rolar abas para a direita"
          >
            <ChevronRight className="w-4 h-4 text-neutral-600" />
          </button>
        )}
      </div>
    </div>
  );
}

export { tabs };
