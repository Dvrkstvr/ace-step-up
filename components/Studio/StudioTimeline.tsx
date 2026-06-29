import React, {
  useEffect,
  useRef,
  useState,
  useCallback,
  useMemo,
} from 'react';
import WaveSurfer from 'wavesurfer.js';
import { StudioLayer } from '../../types';
import { useStudio } from '../../context/StudioContext';

// ─── Palette ───────────────────────────────────────────────────────────────
const LAYER_COLORS = [
  { bg: 'rgba(59,130,246,0.25)',  border: 'rgba(59,130,246,0.8)',  wave: 'rgba(59,130,246,0.9)'  },
  { bg: 'rgba(34,197,94,0.25)',   border: 'rgba(34,197,94,0.8)',   wave: 'rgba(34,197,94,0.9)'   },
  { bg: 'rgba(168,85,247,0.25)',  border: 'rgba(168,85,247,0.8)',  wave: 'rgba(168,85,247,0.9)'  },
  { bg: 'rgba(249,115,22,0.25)',  border: 'rgba(249,115,22,0.8)',  wave: 'rgba(249,115,22,0.9)'  },
  { bg: 'rgba(236,72,153,0.25)',  border: 'rgba(236,72,153,0.8)',  wave: 'rgba(236,72,153,0.9)'  },
  { bg: 'rgba(20,184,166,0.25)',  border: 'rgba(20,184,166,0.8)',  wave: 'rgba(20,184,166,0.9)'  },
];

const TRACK_HEIGHT = 64;
const LABEL_WIDTH = 160;
const MIN_RULER_PX_PER_TICK = 60;
// Minimum seconds change before we update WaveSurfer's playhead position
const WS_SETTIME_THRESHOLD = 0.05;

const TICK_INTERVALS = [1, 2, 5, 10, 15, 30, 60, 120, 300];

function chooseTickInterval(totalDuration: number, rulerWidthPx: number): number {
  if (totalDuration <= 0 || rulerWidthPx <= 0) return 5;
  for (const interval of TICK_INTERVALS) {
    if (rulerWidthPx / (totalDuration / interval) >= MIN_RULER_PX_PER_TICK) return interval;
  }
  return TICK_INTERVALS[TICK_INTERVALS.length - 1];
}

function formatRulerTime(s: number): string {
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return m === 0 ? `${sec}s` : `${m}:${sec.toString().padStart(2, '0')}`;
}

// ─── WaveRow ───────────────────────────────────────────────────────────────
interface WaveRowProps {
  layer: StudioLayer;
  colorIdx: number;
  totalDuration: number;
  playheadTime: number;
  onBufferDuration: (id: string, dur: number) => void;
  // Called only on mouseup (not during drag) to persist to server
  onOffsetCommit: (id: string, newOffset: number) => void;
  // Left trim moves both clip_start and start_offset together (right edge stays fixed)
  onLeftTrimCommit: (id: string, newClipStart: number, newStartOffset: number) => void;
  onClipEndCommit: (id: string, newClipEnd: number) => void;
}

const WaveRow: React.FC<WaveRowProps> = ({
  layer,
  colorIdx,
  totalDuration,
  playheadTime,
  onBufferDuration,
  onOffsetCommit,
  onLeftTrimCommit,
  onClipEndCommit,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const wsRef = useRef<WaveSurfer | null>(null);
  const bufDurRef = useRef<number>(0);
  const lastSetTimeRef = useRef<number>(-1);
  const color = LAYER_COLORS[colorIdx % LAYER_COLORS.length];

  // Local visual state during drag — avoids triggering React re-renders on every mousemove
  const [dragVisual, setDragVisual] = useState<{
    startOffset: number;
    clipStart: number;
    clipEnd: number | null;
  } | null>(null);

  const dragRef = useRef<{
    type: 'body' | 'left-trim' | 'right-trim';
    startX: number;
    startValue: number;
    startOffsetValue: number; // start_offset at drag start, used by left-trim
    pixelsPerSecond: number;
  } | null>(null);

  // ── WaveSurfer lifecycle ────────────────────────────────────────────────
  useEffect(() => {
    if (!containerRef.current || !layer.audio_url) return;
    const isDark = document.documentElement.classList.contains('dark');

    const ws = WaveSurfer.create({
      container: containerRef.current,
      waveColor: isDark ? 'rgba(255,255,255,0.3)' : color.wave,
      progressColor: isDark ? 'rgba(255,255,255,0.3)' : color.wave,
      cursorWidth: 0,
      height: TRACK_HEIGHT - 8,
      barWidth: 2,
      barGap: 1,
      barRadius: 2,
      normalize: true,
      interact: false,
    });

    wsRef.current = ws;
    ws.load(layer.audio_url);

    ws.on('ready', () => {
      const dur = ws.getDuration();
      bufDurRef.current = dur;
      lastSetTimeRef.current = -1;
      onBufferDuration(layer.id, dur);
    });

    return () => {
      ws.destroy();
      wsRef.current = null;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layer.audio_url, layer.id]);

  // ── Sync playhead — throttled to WS_SETTIME_THRESHOLD ──────────────────
  // Uses committed layer values only — drag operations don't move the waveform cursor.
  useEffect(() => {
    const ws = wsRef.current;
    if (!ws) return;
    const localTime = Math.max(0, playheadTime - layer.start_offset + layer.clip_start);
    const dur = ws.getDuration();
    if (dur <= 0) return;
    const clamped = Math.min(localTime, dur);
    if (Math.abs(clamped - lastSetTimeRef.current) >= WS_SETTIME_THRESHOLD) {
      ws.setTime(clamped);
      lastSetTimeRef.current = clamped;
    }
  }, [playheadTime, layer.start_offset, layer.clip_start]);

  // ── Derived geometry (use dragVisual during drag for instant feedback) ──
  const startOffset = dragVisual?.startOffset ?? layer.start_offset;
  const clipStart  = dragVisual?.clipStart  ?? layer.clip_start;
  const clipEnd    = dragVisual?.clipEnd    ?? layer.clip_end;

  const clipDuration = useMemo(() => {
    const end = clipEnd ?? bufDurRef.current;
    return Math.max(0, end - clipStart);
  }, [clipStart, clipEnd]);

  const leftPercent  = totalDuration > 0 ? (startOffset / totalDuration) * 100 : 0;
  const widthPercent = totalDuration > 0 ? (clipDuration / totalDuration) * 100 : 10;

  // ── Drag handlers — visual updates via local state, persist on mouseup ──
  const startDrag = useCallback(
    (e: React.MouseEvent, type: 'body' | 'left-trim' | 'right-trim', rulerEl: HTMLElement) => {
      e.preventDefault();
      e.stopPropagation();
      const pxPerSec = totalDuration > 0 ? rulerEl.getBoundingClientRect().width / totalDuration : 1;

      let startValue: number;
      if (type === 'body') startValue = layer.start_offset;
      else if (type === 'left-trim') startValue = layer.clip_start;
      else startValue = layer.clip_end ?? bufDurRef.current;

      dragRef.current = { type, startX: e.clientX, startValue, startOffsetValue: layer.start_offset, pixelsPerSecond: pxPerSec };

      // Initialise visual state from current layer values
      setDragVisual({
        startOffset: layer.start_offset,
        clipStart: layer.clip_start,
        clipEnd: layer.clip_end,
      });

      const onMove = (me: MouseEvent) => {
        if (!dragRef.current) return;
        const dSec = (me.clientX - dragRef.current.startX) / dragRef.current.pixelsPerSecond;
        const { type: dt, startValue: sv } = dragRef.current;

        setDragVisual(prev => {
          if (!prev || !dragRef.current) return prev;
          if (dt === 'body') {
            return { ...prev, startOffset: Math.max(0, sv + dSec) };
          } else if (dt === 'left-trim') {
            // Clamp new clip_start between 0 and clip_end - 0.1
            const newCs = Math.max(0, Math.min(sv + dSec, (prev.clipEnd ?? bufDurRef.current) - 0.1));
            // Move start_offset by the same delta so the right edge stays fixed
            const delta = newCs - sv;
            const newOffset = Math.max(0, dragRef.current.startOffsetValue + delta);
            return { ...prev, clipStart: newCs, startOffset: newOffset };
          } else {
            const newCe = Math.max(prev.clipStart + 0.1, Math.min(sv + dSec, bufDurRef.current));
            return { ...prev, clipEnd: newCe };
          }
        });
      };

      const onUp = () => {
        // Capture type before nulling the ref — updater may run after assignment
        const finalType = dragRef.current?.type ?? type;
        setDragVisual(final => {
          if (final) {
            if (finalType === 'body')
              onOffsetCommit(layer.id, final.startOffset);
            else if (finalType === 'left-trim')
              onLeftTrimCommit(layer.id, final.clipStart, final.startOffset);
            else
              onClipEndCommit(layer.id, final.clipEnd ?? bufDurRef.current);
          }
          return null; // clear drag visual
        });
        dragRef.current = null;
        window.removeEventListener('mousemove', onMove);
        window.removeEventListener('mouseup', onUp);
      };

      window.addEventListener('mousemove', onMove);
      window.addEventListener('mouseup', onUp);
    },
    [layer, totalDuration, onOffsetCommit, onLeftTrimCommit, onClipEndCommit],
  );

  return (
    <div
      className="relative border-b border-zinc-200 dark:border-zinc-700 flex-shrink-0"
      style={{ height: TRACK_HEIGHT }}
      data-layer-row="true"
    >
      <div
        className="absolute top-1 bottom-1 rounded-md overflow-hidden select-none"
        style={{
          left: `${leftPercent}%`,
          width: `${Math.max(widthPercent, 0.5)}%`,
          minWidth: 8,
          backgroundColor: color.bg,
          border: `1px solid ${color.border}`,
          opacity: layer.is_muted ? 0.4 : 1,
          cursor: dragVisual ? 'grabbing' : 'grab',
        }}
        onMouseDown={(e) => {
          const rulerEl = e.currentTarget.closest('[data-timeline-scroll]') as HTMLElement | null;
          if (rulerEl) startDrag(e, 'body', rulerEl);
        }}
      >
        {/* Left trim handle */}
        <div
          className="absolute left-0 top-0 bottom-0 w-2 z-10 cursor-ew-resize bg-white/20 hover:bg-white/40 transition-colors"
          onMouseDown={(e) => {
            const rulerEl = e.currentTarget.closest('[data-timeline-scroll]') as HTMLElement | null;
            if (rulerEl) startDrag(e, 'left-trim', rulerEl);
          }}
        />

        {/* Waveform */}
        <div ref={containerRef} className="absolute inset-0 px-2" style={{ pointerEvents: 'none' }} />

        {/* Right trim handle */}
        <div
          className="absolute right-0 top-0 bottom-0 w-2 z-10 cursor-ew-resize bg-white/20 hover:bg-white/40 transition-colors"
          onMouseDown={(e) => {
            const rulerEl = e.currentTarget.closest('[data-timeline-scroll]') as HTMLElement | null;
            if (rulerEl) startDrag(e, 'right-trim', rulerEl);
          }}
        />
      </div>
    </div>
  );
};

// ─── StudioTimeline ────────────────────────────────────────────────────────
interface StudioTimelineProps {
  playheadTime: number;
  totalDuration: number;
  seek: (seconds: number) => void;
}

const StudioTimeline: React.FC<StudioTimelineProps> = ({ playheadTime, totalDuration, seek }) => {
  const { layers, updateLayer } = useStudio();
  const sorted = useMemo(
    () => [...layers].sort((a, b) => a.sort_order - b.sort_order),
    [layers],
  );

  const [bufferDurations, setBufferDurations] = useState<Record<string, number>>({});
  const handleBufferDuration = useCallback((id: string, dur: number) => {
    setBufferDurations(prev => ({ ...prev, [id]: dur }));
  }, []);

  const effectiveDuration = useMemo(() => {
    const maxBuf = (Object.values(bufferDurations) as number[]).reduce((a: number, d: number) => Math.max(a, d), 0);
    return Math.max(totalDuration, maxBuf, 10);
  }, [totalDuration, bufferDurations]);

  const scrollRef = useRef<HTMLDivElement>(null);
  const [rulerWidth, setRulerWidth] = useState(800);
  useEffect(() => {
    if (!scrollRef.current) return;
    const ro = new ResizeObserver(entries => setRulerWidth(entries[0].contentRect.width));
    ro.observe(scrollRef.current);
    return () => ro.disconnect();
  }, []);

  const tickInterval = useMemo(() => chooseTickInterval(effectiveDuration, rulerWidth), [effectiveDuration, rulerWidth]);
  const ticks = useMemo(() => {
    const arr: number[] = [];
    for (let t = 0; t <= effectiveDuration; t += tickInterval) arr.push(t);
    return arr;
  }, [effectiveDuration, tickInterval]);

  const playheadPercent = effectiveDuration > 0 ? (playheadTime / effectiveDuration) * 100 : 0;

  const handleRulerClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    seek(Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width)) * effectiveDuration);
  }, [seek, effectiveDuration]);

  // Commit handlers — called only on mouseup, triggers one API call
  const handleOffsetCommit   = useCallback((id: string, v: number) => updateLayer(id, { start_offset: v }), [updateLayer]);
  // Left trim moves both clip_start and start_offset atomically so the right edge stays fixed
  const handleLeftTrimCommit = useCallback((id: string, cs: number, so: number) => updateLayer(id, { clip_start: cs, start_offset: so }), [updateLayer]);
  const handleClipEndCommit  = useCallback((id: string, v: number) => updateLayer(id, { clip_end: v }), [updateLayer]);

  return (
    <div className="flex flex-1 overflow-hidden">
      {/* Left label column */}
      <div
        className="flex-shrink-0 flex flex-col bg-zinc-50 dark:bg-zinc-900 border-r border-zinc-200 dark:border-zinc-700"
        style={{ width: LABEL_WIDTH }}
      >
        <div className="h-6 border-b border-zinc-200 dark:border-zinc-700 bg-zinc-100 dark:bg-zinc-800 flex-shrink-0" />
        {sorted.map(layer => (
          <div
            key={layer.id}
            className="flex items-center px-3 text-xs font-medium text-zinc-600 dark:text-zinc-300 border-b border-zinc-200 dark:border-zinc-700 flex-shrink-0 truncate"
            style={{ height: TRACK_HEIGHT }}
          >
            {layer.name}
          </div>
        ))}
        {sorted.length === 0 && (
          <div className="flex items-center justify-center h-20 text-xs text-zinc-400 dark:text-zinc-600 px-3 text-center">
            Add layers to begin editing.
          </div>
        )}
      </div>

      {/* Scrollable timeline */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-x-auto overflow-y-hidden relative bg-zinc-100 dark:bg-zinc-800"
        data-timeline-scroll="true"
      >
        {/* Playhead */}
        <div
          className="absolute top-0 bottom-0 w-px bg-pink-500 z-20 pointer-events-none"
          style={{ left: `${playheadPercent}%` }}
        />

        {/* Time ruler */}
        <div
          className="sticky top-0 z-10 h-6 bg-zinc-200 dark:bg-zinc-700 border-b border-zinc-300 dark:border-zinc-600 relative cursor-crosshair flex-shrink-0"
          onClick={handleRulerClick}
        >
          {ticks.map(t => (
            <div
              key={t}
              className="absolute top-0 bottom-0 flex flex-col justify-end"
              style={{ left: `${(t / effectiveDuration) * 100}%` }}
            >
              <div className="w-px h-2 bg-zinc-400 dark:bg-zinc-500" />
              <span className="absolute bottom-full mb-0.5 left-0.5 text-[9px] font-mono text-zinc-500 dark:text-zinc-400 whitespace-nowrap select-none">
                {formatRulerTime(t)}
              </span>
            </div>
          ))}
        </div>

        {/* Layer rows */}
        {sorted.map((layer, idx) => (
          <WaveRow
            key={layer.id}
            layer={{ ...layer, clip_end: layer.clip_end ?? bufferDurations[layer.id] ?? null }}
            colorIdx={idx}
            totalDuration={effectiveDuration}
            playheadTime={playheadTime}
            onBufferDuration={handleBufferDuration}
            onOffsetCommit={handleOffsetCommit}
            onLeftTrimCommit={handleLeftTrimCommit}
            onClipEndCommit={handleClipEndCommit}
          />
        ))}

        {sorted.length === 0 && (
          <div className="flex items-center justify-center h-32 text-sm text-zinc-400 dark:text-zinc-500">
            No layers — add some in the panel on the left.
          </div>
        )}
      </div>
    </div>
  );
};

export default StudioTimeline;
