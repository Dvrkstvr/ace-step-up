import React, { useEffect, useRef, useCallback } from 'react';
import { ArrowLeft } from 'lucide-react';
import { useStudio } from '../../context/StudioContext';
import { useStudioAudio } from '../../hooks/useStudioAudio';
import StudioLayerPanel from './StudioLayerPanel';
import StudioBottomPanel from './StudioBottomPanel';
import StudioTransport from './StudioTransport';
import StudioTimeline from './StudioTimeline';

const Studio: React.FC = () => {
  const { isOpen, session, closeStudio, selectedRegion, setSelectedRegion, layers, activeTool, setActiveTool, setSeekPlayhead } = useStudio();

  const {
    isPlaying,
    playheadTime,
    totalDuration,
    play,
    pause,
    stop,
    seek,
    loadLayers,
    updateLayersMetadata,
  } = useStudioAudio();

  // Register seek into context so child components (e.g. StudioBottomPanel) can seek the playhead
  useEffect(() => {
    setSeekPlayhead(seek);
    return () => setSeekPlayhead(null);
  }, [seek, setSeekPlayhead]);

  // Sync layer metadata (clip points, volume, solo/mute) immediately so that
  // play() always uses the latest values even before decode completes.
  useEffect(() => {
    if (!isOpen) return;
    updateLayersMetadata(layers);
  }, [isOpen, layers, updateLayersMetadata]);

  // Re-decode only when audio URLs change — debounced to avoid redundant fetches.
  // Always runs (even with empty layers) so deleted layers are purged from the engine.
  const loadDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!isOpen) return;
    if (loadDebounceRef.current) clearTimeout(loadDebounceRef.current);
    loadDebounceRef.current = setTimeout(() => {
      loadLayers(layers).catch(console.error);
    }, 150);
    return () => {
      if (loadDebounceRef.current) clearTimeout(loadDebounceRef.current);
    };
  }, [isOpen, layers, loadLayers]);

  // Space = play/pause; double-space = stop to beginning
  const lastSpaceRef = useRef<number>(0);

  // Tool shortcuts + Escape + Space transport
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      if (e.key === ' ') {
        e.preventDefault();
        const now = Date.now();
        if (now - lastSpaceRef.current < 300) {
          // Double-space → stop + return to beginning
          stop();
          lastSpaceRef.current = 0;
        } else {
          // Single space → play/pause toggle
          if (isPlaying) pause(); else play();
          lastSpaceRef.current = now;
        }
        return;
      }

      if (e.key === 'v' || e.key === 'V') { setActiveTool('move');   return; }
      if (e.key === 's' || e.key === 'S') { setActiveTool('select'); return; }
      if (e.key === 'c' || e.key === 'C') { setActiveTool('cut');    return; }
      if (e.key === 'Escape') {
        if (selectedRegion) { setSelectedRegion(null); return; }
        closeStudio();
      }
    };
    if (isOpen) {
      window.addEventListener('keydown', handler);
      return () => window.removeEventListener('keydown', handler);
    }
  }, [isOpen, isPlaying, play, pause, stop, closeStudio, activeTool, setActiveTool, selectedRegion, setSelectedRegion]);

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

      {/* Two-column layout: layer panel + timeline */}
      <div className="flex flex-1 overflow-hidden">
        <div className="w-64 flex-shrink-0 overflow-hidden flex flex-col">
          <StudioLayerPanel />
        </div>
        <div className="flex-1 overflow-hidden flex flex-col">
          <StudioTimeline
            playheadTime={playheadTime}
            totalDuration={totalDuration}
            seek={seek}
          />
        </div>
      </div>

      {/* Bottom: context-sensitive tools + repaint form */}
      <StudioBottomPanel />
    </div>
  );
};

export default Studio;
