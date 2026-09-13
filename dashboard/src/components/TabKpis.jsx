/**
 * Cartões de resumo de uma aba, na mesma linguagem visual dos KpiCards globais.
 *
 * items: [{ label, value, sublabel?, tone? }]
 *   tone: 'water' | 'health' | 'forest' | 'secondary' | 'harvest' (padrão: water)
 *   value já formatado (string) ou número; null/undefined vira "-".
 */

const TONES = {
  water: { bg: 'bg-water-50', text: 'text-water-600' },
  health: { bg: 'bg-orange-50', text: 'text-orange-700' },
  forest: { bg: 'bg-sky-50', text: 'text-sky-700' },
  secondary: { bg: 'bg-indigo-50', text: 'text-indigo-600' },
  harvest: { bg: 'bg-amber-50', text: 'text-amber-600' }
};

export default function TabKpis({ items }) {
  if (!items || items.length === 0) return null;

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      {items.map((item) => {
        const tone = TONES[item.tone] || TONES.water;
        return (
          <div key={item.label} className={`${tone.bg} rounded-xl p-4`}>
            <p className={`text-2xl font-display font-bold ${tone.text}`}>
              {item.value ?? '-'}
            </p>
            <p className="text-sm text-dark-600 mt-1">{item.label}</p>
            {item.sublabel && (
              <p className="text-xs text-dark-400">{item.sublabel}</p>
            )}
          </div>
        );
      })}
    </div>
  );
}
