import React, { useEffect, useRef, useState, useCallback } from 'react';
import WaveSurfer from 'wavesurfer.js';
import RegionsPlugin from 'wavesurfer.js/dist/plugins/regions.esm.js';
import { Play, Pause, Square, X } from 'lucide-react';
import { Stem, Track } from '../types';

interface StemWaveformProps {
  stem: Stem;
  track: Track;
}

const STEM_META: Record<string, { emoji: string; label: string }> = {
  vocals: { emoji: '🎤', label: 'Vocals' },
  drums:  { emoji: '🥁', label: 'Drums' },
  bass:   { emoji: '🎸', label: 'Bass' },
  other:  { emoji: '🎹', label: 'Other' },
  guitar: { emoji: '🎸', label: 'Guitar' },
  piano:  { emoji: '🎹', label: 'Piano' },
};

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

const StemWaveform: React.FC<StemWaveformProps> = ({ stem, track }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const wsRef = useRef<WaveSurfer | null>(null);
  const regionsRef = useRef<InstanceType<typeof RegionsPlugin> | null>(null);
  const activeRegionRef = useRef<any>(null);

  const [playing, setPlaying] = useState(false);
  const [ready, setReady] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [hasRegion, setHasRegion] = useState(false);

  const meta = STEM_META[stem.instrument_class] ?? { emoji: '🎵', label: stem.instrument_class };

  const isDark = document.documentElement.classList.contains('dark');

  useEffect(() => {
    if (!containerRef.current) return;

    const regions = RegionsPlugin.create();
    regionsRef.current = regions;

    const ws = WaveSurfer.create({
      container: containerRef.current,
      waveColor: isDark ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.12)',
      progressColor: '#ec4899',
      cursorColor: '#ec4899',
      cursorWidth: 1,
      height: 52,
      barWidth: 2,
      barGap: 1,
      barRadius: 2,
      normalize: true,
      plugins: [regions],
    });

    wsRef.current = ws;

    ws.load(stem.audio_url);

    ws.on('ready', () => {
      setReady(true);
      setDuration(ws.getDuration());
    });

    ws.on('timeupdate', (t) => setCurrentTime(t));

    ws.on('play', () => setPlaying(true));
    ws.on('pause', () => setPlaying(false));
    ws.on('finish', () => {
      setPlaying(false);
      // If we played a region, loop back to region start visually
      if (activeRegionRef.current) {
        ws.seekTo(activeRegionRef.current.start / ws.getDuration());
      }
    });

    // Drag to select region
    regions.enableDragSelection({ color: 'rgba(236,72,153,0.18)' });

    regions.on('region-created', (region: any) => {
      // Only keep one region at a time
      for (const r of regions.getRegions()) {
        if (r.id !== region.id) r.remove();
      }
      activeRegionRef.current = region;
      setHasRegion(true);
    });

    regions.on('region-updated', (region: any) => {
      activeRegionRef.current = region;
    });

    return () => {
      ws.destroy();
      wsRef.current = null;
      regionsRef.current = null;
      activeRegionRef.current = null;
    };
  }, [stem.audio_url]);

  const handlePlayPause = useCallback(() => {
    const ws = wsRef.current;
    if (!ws || !ready) return;

    if (playing) {
      ws.pause();
    } else if (activeRegionRef.current) {
      activeRegionRef.current.play();
    } else {
      ws.play();
    }
  }, [playing, ready]);

  const handleStop = useCallback(() => {
    const ws = wsRef.current;
    if (!ws) return;
    ws.stop();
  }, []);

  const clearRegion = useCallback(() => {
    const regions = regionsRef.current;
    if (!regions) return;
    for (const r of regions.getRegions()) r.remove();
    activeRegionRef.current = null;
    setHasRegion(false);
  }, []);

  return (
    <div className="flex items-center gap-2.5 px-3 py-2 pl-8 bg-zinc-50 dark:bg-white/[0.02] border-t border-zinc-100 dark:border-white/5">

      {/* Stem label */}
      <div className="flex items-center gap-1.5 flex-shrink-0 w-16">
        <span className="text-sm leading-none">{meta.emoji}</span>
        <span className="text-[11px] font-medium text-zinc-500 dark:text-zinc-400 truncate">{meta.label}</span>
      </div>

      {/* Waveform */}
      <div className="flex-1 min-w-0 relative">
        {!ready && (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="flex gap-0.5 items-end h-6">
              {Array.from({ length: 18 }).map((_, i) => (
                <div
                  key={i}
                  className="w-0.5 bg-zinc-200 dark:bg-white/10 rounded-full animate-pulse"
                  style={{ height: `${Math.random() * 60 + 20}%`, animationDelay: `${i * 60}ms` }}
                />
              ))}
            </div>
          </div>
        )}
        <div ref={containerRef} className={ready ? '' : 'opacity-0'} />
      </div>

      {/* Time */}
      <span className="text-[10px] font-mono text-zinc-400 dark:text-zinc-500 flex-shrink-0 w-16 text-right">
        {formatTime(currentTime)} / {formatTime(duration)}
      </span>

      {/* Controls */}
      <div className="flex items-center gap-1 flex-shrink-0">
        {hasRegion && (
          <button
            onClick={clearRegion}
            title="Clear selection"
            className="p-1 rounded text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 hover:bg-zinc-200 dark:hover:bg-white/10 transition-colors"
          >
            <X size={11} />
          </button>
        )}
        <button
          onClick={handleStop}
          disabled={!ready}
          title="Stop"
          className="p-1 rounded text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 hover:bg-zinc-200 dark:hover:bg-white/10 disabled:opacity-30 transition-colors"
        >
          <Square size={12} fill="currentColor" />
        </button>
        <button
          onClick={handlePlayPause}
          disabled={!ready}
          title={playing ? 'Pause' : hasRegion ? 'Play selection' : 'Play'}
          className="w-7 h-7 rounded-full flex items-center justify-center bg-pink-500 hover:bg-pink-600 text-white disabled:opacity-30 transition-colors flex-shrink-0"
        >
          {playing
            ? <Pause size={12} fill="currentColor" />
            : <Play size={12} className="ml-0.5" fill="currentColor" />}
        </button>
      </div>
    </div>
  );
};

export default StemWaveform;
