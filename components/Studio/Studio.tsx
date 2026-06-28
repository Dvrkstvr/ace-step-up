import React, { useEffect, useRef, useState } from 'react';
import { ArrowLeft } from 'lucide-react';
import { useStudio } from '../../context/StudioContext';
import { useStudioAudio } from '../../hooks/useStudioAudio';
import StudioLayerPanel from './StudioLayerPanel';
import StudioToolsPanel from './StudioToolsPanel';
import StudioActionBar from './StudioActionBar';
import StudioRepaintForm from './StudioRepaintForm';
import StudioTransport from './StudioTransport';
import StudioTimeline from './StudioTimeline';

const Studio: React.FC = () => {
  const { isOpen, session, closeStudio, selectedRegion, layers } = useStudio();
  const [showRepaint, setShowRepaint] = useState(false);

  const {
    isPlaying,
    playheadTime,
    totalDuration,
    play,
    pause,
    stop,
    seek,
    loadLayers,
  } = useStudioAudio();

  // Load audio engine when layers change — debounced so rapid updates
  // (e.g. clip position saves) don't retrigger decode for unchanged audio URLs
  const loadDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!isOpen || layers.length === 0) return;
    if (loadDebounceRef.current) clearTimeout(loadDebounceRef.current);
    loadDebounceRef.current = setTimeout(() => {
      loadLayers(layers).catch(console.error);
    }, 150);
    return () => {
      if (loadDebounceRef.current) clearTimeout(loadDebounceRef.current);
    };
  }, [isOpen, layers, loadLayers]);

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

      {/* Transport bar */}
      <StudioTransport
        isPlaying={isPlaying}
        playheadTime={playheadTime}
        totalDuration={totalDuration}
        play={play}
        pause={pause}
        stop={stop}
        seek={seek}
      />

      {/* Three-column layout */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left: Layer panel (256px) */}
        <div className="w-64 flex-shrink-0 overflow-hidden flex flex-col">
          <StudioLayerPanel />
        </div>

        {/* Center: Timeline (flex-1) */}
        <div className="flex-1 overflow-hidden flex flex-col">
          <StudioTimeline
            playheadTime={playheadTime}
            totalDuration={totalDuration}
            seek={seek}
          />
        </div>

        {/* Right: Tools panel (192px) */}
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
