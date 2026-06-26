import React, { useEffect, useState } from 'react';
import { ArrowLeft } from 'lucide-react';
import { useStudio } from '../../context/StudioContext';
import StudioLayerPanel from './StudioLayerPanel';
import StudioToolsPanel from './StudioToolsPanel';
import StudioActionBar from './StudioActionBar';
import StudioRepaintForm from './StudioRepaintForm';

// Simple placeholder timeline that renders layers as colored horizontal bars
const TimelinePlaceholder: React.FC = () => {
  const { layers, selectedRegion, setSelectedRegion } = useStudio();
  const sorted = [...layers].sort((a, b) => a.sort_order - b.sort_order);

  const TRACK_HEIGHT = 48;
  const COLORS = [
    'bg-blue-400 dark:bg-blue-600',
    'bg-green-400 dark:bg-green-600',
    'bg-purple-400 dark:bg-purple-600',
    'bg-orange-400 dark:bg-orange-600',
    'bg-pink-400 dark:bg-pink-600',
    'bg-teal-400 dark:bg-teal-600',
  ];

  // Simulate clicking a region (30s to 60s) on a layer
  const handleLayerClick = (layerId: string) => {
    setSelectedRegion({ layerId, start: 30, end: 60 });
  };

  return (
    <div className="flex-1 overflow-auto bg-zinc-100 dark:bg-zinc-800 relative">
      {/* Time ruler */}
      <div className="sticky top-0 z-10 h-6 bg-zinc-200 dark:bg-zinc-700 border-b border-zinc-300 dark:border-zinc-600 flex items-center px-3 gap-8">
        {[0, 15, 30, 45, 60, 75, 90].map(s => (
          <span key={s} className="text-[10px] font-mono text-zinc-500 dark:text-zinc-400">{s}s</span>
        ))}
      </div>

      {/* Layer rows */}
      {sorted.length === 0 && (
        <div className="flex items-center justify-center h-32 text-sm text-zinc-400 dark:text-zinc-500">
          Add layers in the left panel to begin editing.
        </div>
      )}

      {sorted.map((layer, idx) => (
        <div
          key={layer.id}
          style={{ height: TRACK_HEIGHT }}
          className={`relative flex items-center border-b border-zinc-200 dark:border-zinc-700 group cursor-pointer ${
            selectedRegion?.layerId === layer.id ? 'bg-pink-50 dark:bg-pink-900/10' : 'hover:bg-zinc-50 dark:hover:bg-zinc-750'
          } ${layer.is_muted ? 'opacity-40' : ''}`}
          onClick={() => handleLayerClick(layer.id)}
          title="Click to select a region (30s–60s) — full waveform editor coming soon"
        >
          {/* Waveform bar placeholder */}
          <div className={`absolute left-4 right-4 rounded-md ${COLORS[idx % COLORS.length]} opacity-70`} style={{ height: 28 }}>
            {/* Fake waveform lines */}
            <div className="w-full h-full flex items-center px-2 gap-0.5 overflow-hidden">
              {Array.from({ length: 80 }).map((_, i) => (
                <div
                  key={i}
                  className="flex-shrink-0 w-px rounded-full bg-white/60"
                  style={{ height: `${20 + Math.sin(i * 0.4 + idx) * 10 + Math.random() * 6}%` }}
                />
              ))}
            </div>
          </div>

          {/* Selected region highlight */}
          {selectedRegion?.layerId === layer.id && (
            <div className="absolute top-1 bottom-1 bg-white/30 dark:bg-white/10 border-2 border-pink-500 rounded pointer-events-none"
              style={{ left: '33%', width: '20%' }}
            />
          )}

          {/* Layer name overlay */}
          <span className="absolute left-6 text-[10px] font-medium text-white/90 drop-shadow pointer-events-none truncate max-w-[120px]">
            {layer.name}
          </span>
        </div>
      ))}

      {/* Future note */}
      <div className="px-4 py-3 text-[10px] text-zinc-400 dark:text-zinc-600 border-t border-zinc-200 dark:border-zinc-700 mt-2">
        Full waveform editor (AudioMass integration) coming in a future phase. Click a layer row to simulate selecting a region.
      </div>
    </div>
  );
};

const Studio: React.FC = () => {
  const { isOpen, session, closeStudio, selectedRegion } = useStudio();
  const [showRepaint, setShowRepaint] = useState(false);

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeStudio();
    };
    if (isOpen) {
      window.addEventListener('keydown', handler);
      return () => window.removeEventListener('keydown', handler);
    }
  }, [isOpen, closeStudio]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-white dark:bg-zinc-900 flex flex-col">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-zinc-200 dark:border-white/10 flex-shrink-0 bg-white dark:bg-zinc-900">
        <button
          onClick={closeStudio}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-white/10 transition-colors"
        >
          <ArrowLeft size={16} />
          Back
        </button>

        <div className="w-px h-5 bg-zinc-200 dark:bg-white/10" />

        <div className="flex flex-col min-w-0">
          <span className="text-sm font-semibold text-zinc-900 dark:text-white truncate">
            {session?.name ?? 'Studio Session'}
          </span>
          {session && (
            <span className="text-[10px] text-zinc-400 dark:text-zinc-500 font-mono">
              Session {session.id.slice(0, 8)}
            </span>
          )}
        </div>

        <div className="ml-auto flex items-center gap-2">
          <span className="text-xs text-zinc-400 dark:text-zinc-500 hidden sm:block">
            Press <kbd className="px-1 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800 text-[10px] font-mono">Esc</kbd> to exit
          </span>
        </div>
      </div>

      {/* Three-column layout */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left: Layer panel (~280px) */}
        <div className="w-64 flex-shrink-0 overflow-hidden flex flex-col">
          <StudioLayerPanel />
        </div>

        {/* Center: Timeline (flex-1) */}
        <div className="flex-1 overflow-hidden flex flex-col">
          <TimelinePlaceholder />
        </div>

        {/* Right: Tools panel (~200px) */}
        <div className="w-48 flex-shrink-0 overflow-hidden flex flex-col">
          <StudioToolsPanel />
        </div>
      </div>

      {/* Bottom: Action bar (shown when region is selected) */}
      {selectedRegion && (
        <StudioActionBar onRepaint={() => setShowRepaint(true)} />
      )}

      {/* Repaint form (opened from action bar) */}
      {showRepaint && (
        <StudioRepaintForm onClose={() => setShowRepaint(false)} />
      )}
    </div>
  );
};

export default Studio;
