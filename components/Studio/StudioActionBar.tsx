import React from 'react';
import { useStudio } from '../../context/StudioContext';

interface StudioActionBarProps {
  onRepaint: () => void;
}

const StudioActionBar: React.FC<StudioActionBarProps> = ({ onRepaint }) => {
  const { selectedRegion, layers, setSelectedRegion } = useStudio();

  if (!selectedRegion) return null;

  const layer = layers.find(l => l.id === selectedRegion.rowId);
  const layerName = layer?.name ?? 'Unknown Layer';

  const fmt = (s: number) => s.toFixed(2);

  return (
    <div className="bg-zinc-900 dark:bg-zinc-950 border-t border-zinc-700 dark:border-white/10 px-4 py-2 flex items-center gap-4 text-sm">
      <span className="text-zinc-300 dark:text-zinc-400 flex-1 truncate">
        Selection:{' '}
        <span className="font-mono text-white">
          {fmt(selectedRegion.start)}s — {fmt(selectedRegion.end)}s
        </span>
        {' '}on{' '}
        <span className="text-pink-400 font-medium">{layerName}</span>
      </span>
      <button
        onClick={onRepaint}
        className="px-3 py-1 rounded bg-pink-600 hover:bg-pink-500 text-white text-xs font-medium transition-colors"
      >
        Repaint
      </button>
      <button
        onClick={() => setSelectedRegion(null)}
        className="px-3 py-1 rounded bg-zinc-700 hover:bg-zinc-600 text-zinc-200 text-xs font-medium transition-colors"
      >
        Clear Selection
      </button>
    </div>
  );
};

export default StudioActionBar;
