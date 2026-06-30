import React, {
  useEffect,
  useRef,
  useState,
  useCallback,
  useMemo,
} from 'react';
import ReactDOM from 'react-dom';
import WaveSurfer from 'wavesurfer.js';
import { MousePointer2, RectangleHorizontal, Scissors, ZoomIn, ZoomOut, Maximize2, Trash2, RefreshCw, ArrowRight } from 'lucide-react';
import { StudioLayer } from '../../types';
import { useStudio, StudioTool, GeneratePrefill } from '../../context/StudioContext';

// ─── Constants & palette ───────────────────────────────────────────────────
const LAYER_COLORS = [
  { bg: 'rgba(59,130,246,0.25)',  border: 'rgba(59,130,246,0.8)',  wave: 'rgba(59,130,246,0.9)'  },
  { bg: 'rgba(34,197,94,0.25)',   border: 'rgba(34,197,94,0.8)',   wave: 'rgba(34,197,94,0.9)'   },
  { bg: 'rgba(168,85,247,0.25)',  border: 'rgba(168,85,247,0.8)',  wave: 'rgba(168,85,247,0.9)'  },
  { bg: 'rgba(249,115,22,0.25)',  border: 'rgba(249,115,22,0.8)',  wave: 'rgba(249,115,22,0.9)'  },
  { bg: 'rgba(236,72,153,0.25)',  border: 'rgba(236,72,153,0.8)',  wave: 'rgba(236,72,153,0.9)'  },
  { bg: 'rgba(20,184,166,0.25)',  border: 'rgba(20,184,166,0.8)',  wave: 'rgba(20,184,166,0.9)'  },
];

const TRACK_HEIGHT        = 64;
const LABEL_WIDTH         = 160;
const MIN_RULER_PX_PER_TICK = 60;
const WS_SETTIME_THRESHOLD  = 0.05;
const TICK_INTERVALS = [0.25, 0.5, 1, 2, 5, 10, 15, 30, 60, 120, 300];
const ZOOM_MIN = 0.25;
const ZOOM_MAX = 32;
const ZOOM_STEP = 1.25; // multiply / divide on each +/- click

function chooseTickInterval(totalDuration: number, pxPerSec: number): number {
  for (const iv of TICK_INTERVALS) {
    if (iv * pxPerSec >= MIN_RULER_PX_PER_TICK) return iv;
  }
  return TICK_INTERVALS[TICK_INTERVALS.length - 1];
}

function formatRulerTime(s: number): string {
  if (s < 60) return `${s % 1 === 0 ? s : s.toFixed(2)}s`;
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, '0')}`;
}

// ── Helpers for converting client positions to timeline times ─────────────
function scrollEl(el: Element): HTMLElement | null {
  return el.closest('[data-timeline-scroll]') as HTMLElement | null;
}
function clientXToTime(clientX: number, sc: HTMLElement, pxPerSec: number): number {
  const rect = sc.getBoundingClientRect();
  return Math.max(0, (clientX - rect.left + sc.scrollLeft) / pxPerSec);
}

// ─── ClipContextMenu ───────────────────────────────────────────────────────
interface ClipContextMenuProps {
  layer: StudioLayer;
  x: number;
  y: number;
  onClose: () => void;
  onDelete: () => void;
  onUsePrompt: () => void;
  onRegenerate: () => void;
}

const ClipContextMenu: React.FC<ClipContextMenuProps> = ({
  layer, x, y, onClose, onDelete, onUsePrompt, onRegenerate,
}) => {
  const isPending = !layer.audio_url || layer.audio_url === 'pending';
  const hasParams = !isPending;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    let timer: ReturnType<typeof setTimeout>;
    const onClickOutside = () => onClose();
    window.addEventListener('keydown', onKey);
    // Delay registering the outside-click so this very right-click doesn't close it
    timer = setTimeout(() => window.addEventListener('click', onClickOutside), 60);
    return () => {
      window.removeEventListener('keydown', onKey);
      clearTimeout(timer);
      window.removeEventListener('click', onClickOutside);
    };
  }, [onClose]);

  // Clamp to viewport so it doesn't overflow
  const menuWidth = 188;
  const menuHeight = hasParams ? 130 : 88;
  const left = Math.min(x, window.innerWidth  - menuWidth  - 8);
  const top  = Math.min(y, window.innerHeight - menuHeight - 8);

  return ReactDOM.createPortal(
    <div
      className="fixed z-[9999] rounded-lg shadow-2xl overflow-hidden select-none"
      style={{ left, top, width: menuWidth }}
      onClick={e => e.stopPropagation()}
      onContextMenu={e => e.preventDefault()}
    >
      {/* Header */}
      <div className="px-3 py-2 bg-zinc-800 border-b border-zinc-700">
        <p className="text-[10px] font-medium text-zinc-400 uppercase tracking-wider truncate">
          {layer.name}
        </p>
      </div>

      <div className="bg-zinc-900 border border-zinc-700 border-t-0 rounded-b-lg py-1">
        {hasParams && (
          <>
            <button
              onClick={() => { onUsePrompt(); onClose(); }}
              className="w-full flex items-center gap-2.5 px-3 py-2 text-xs text-zinc-200 hover:bg-zinc-700 transition-colors"
            >
              <ArrowRight size={13} className="text-pink-400 flex-shrink-0" />
              Use prompt in Generate
            </button>
            <button
              onClick={() => { onRegenerate(); onClose(); }}
              className="w-full flex items-center gap-2.5 px-3 py-2 text-xs text-zinc-200 hover:bg-zinc-700 transition-colors"
            >
              <RefreshCw size={13} className="text-violet-400 flex-shrink-0" />
              Re-generate this clip
            </button>
            <div className="my-1 border-t border-zinc-800" />
          </>
        )}
        <button
          onClick={() => { onDelete(); onClose(); }}
          className="w-full flex items-center gap-2.5 px-3 py-2 text-xs text-red-400 hover:bg-red-500/10 transition-colors"
        >
          <Trash2 size={13} className="flex-shrink-0" />
          Delete clip
        </button>
      </div>
    </div>,
    document.body,
  );
};

// ─── ClipBlock ─────────────────────────────────────────────────────────────
interface ClipBlockProps {
  layer: StudioLayer;
  colorIdx: number;
  totalDuration: number;
  pxPerSec: number;
  playheadTime: number;
  activeTool: StudioTool;
  onBufferDuration: (id: string, dur: number) => void;
  onOffsetCommit:   (id: string, v: number) => void;
  onLeftTrimCommit: (id: string, cs: number, so: number) => void;
  onClipEndCommit:  (id: string, v: number) => void;
  onCutAt: (layerId: string, absoluteTime: number) => void;
  onRowHover?: (rowId: string | null) => void;
  onMoveToRow?: (layerId: string, newRowId: string) => void;
  onClipContextMenu?: (layer: StudioLayer, x: number, y: number) => void;
}

const ClipBlock: React.FC<ClipBlockProps> = ({
  layer, colorIdx, totalDuration, pxPerSec, playheadTime, activeTool,
  onBufferDuration, onOffsetCommit, onLeftTrimCommit, onClipEndCommit, onCutAt,
  onRowHover, onMoveToRow, onClipContextMenu,
}) => {
  // Only child clips (not the row's own master/stem clip) can be dragged to
  // another row — moving the anchor itself would orphan the row it defines.
  const canMoveRow = !!layer.row_id;
  const hoverRowRef = useRef<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const wsRef        = useRef<WaveSurfer | null>(null);
  const bufDurRef    = useRef<number>(0);
  const lastSetRef   = useRef<number>(-1);
  const color = LAYER_COLORS[colorIdx % LAYER_COLORS.length];
  const isPending = !layer.audio_url || layer.audio_url === 'pending';

  const [dragVisual, setDragVisual] = useState<{
    startOffset: number; clipStart: number; clipEnd: number | null;
  } | null>(null);
  const dragRef = useRef<{
    type: 'body' | 'left-trim' | 'right-trim';
    startX: number; startValue: number; startOffsetValue: number; pxPerSec: number;
  } | null>(null);

  // ── WaveSurfer ────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!containerRef.current || isPending) return;
    const isDark = document.documentElement.classList.contains('dark');
    const ws = WaveSurfer.create({
      container: containerRef.current,
      waveColor: isDark ? 'rgba(255,255,255,0.3)' : color.wave,
      progressColor: isDark ? 'rgba(255,255,255,0.3)' : color.wave,
      cursorWidth: 0,
      height: TRACK_HEIGHT - 8,
      barWidth: 2, barGap: 1, barRadius: 2,
      normalize: true, interact: false,
    });
    wsRef.current = ws;
    ws.load(layer.audio_url);
    ws.on('ready', () => {
      bufDurRef.current = ws.getDuration();
      lastSetRef.current = -1;
      onBufferDuration(layer.id, bufDurRef.current);
    });
    return () => { ws.destroy(); wsRef.current = null; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layer.audio_url, layer.id, isPending]);

  // ── Playhead sync ─────────────────────────────────────────────────────────
  useEffect(() => {
    const ws = wsRef.current;
    if (!ws) return;
    const localTime = Math.max(0, playheadTime - layer.start_offset + layer.clip_start);
    const dur = ws.getDuration();
    if (dur <= 0) return;
    const t = Math.min(localTime, dur);
    if (Math.abs(t - lastSetRef.current) >= WS_SETTIME_THRESHOLD) {
      ws.setTime(t);
      lastSetRef.current = t;
    }
  }, [playheadTime, layer.start_offset, layer.clip_start]);

  // ── Geometry ──────────────────────────────────────────────────────────────
  const startOffset  = dragVisual?.startOffset ?? layer.start_offset;
  const clipStart    = dragVisual?.clipStart   ?? layer.clip_start;
  const clipEnd      = dragVisual?.clipEnd     ?? layer.clip_end;
  const clipDuration = Math.max(0, (clipEnd ?? bufDurRef.current) - clipStart);

  const leftPx  = startOffset * pxPerSec;
  const widthPx = Math.max(clipDuration * pxPerSec, 8);

  // ── Move drag ─────────────────────────────────────────────────────────────
  const startMoveDrag = useCallback(
    (e: React.MouseEvent, type: 'body' | 'left-trim' | 'right-trim') => {
      e.preventDefault(); e.stopPropagation();
      const startValue =
        type === 'body'       ? layer.start_offset :
        type === 'left-trim'  ? layer.clip_start :
        layer.clip_end ?? bufDurRef.current;

      dragRef.current = { type, startX: e.clientX, startValue, startOffsetValue: layer.start_offset, pxPerSec };
      setDragVisual({ startOffset: layer.start_offset, clipStart: layer.clip_start, clipEnd: layer.clip_end });
      hoverRowRef.current = layer.row_id ?? null;

      const onMove = (me: MouseEvent) => {
        if (!dragRef.current) return;
        const dSec = (me.clientX - dragRef.current.startX) / dragRef.current.pxPerSec;
        const { type: dt, startValue: sv } = dragRef.current;
        setDragVisual(prev => {
          if (!prev || !dragRef.current) return prev;
          if (dt === 'body')      return { ...prev, startOffset: Math.max(0, sv + dSec) };
          if (dt === 'left-trim') {
            const newCs = Math.max(0, Math.min(sv + dSec, (prev.clipEnd ?? bufDurRef.current) - 0.1));
            return { ...prev, clipStart: newCs, startOffset: Math.max(0, dragRef.current.startOffsetValue + (newCs - sv)) };
          }
          return { ...prev, clipEnd: Math.max(prev.clipStart + 0.1, Math.min(sv + dSec, bufDurRef.current)) };
        });

        if (dt === 'body' && canMoveRow) {
          const el = document.elementFromPoint(me.clientX, me.clientY);
          const rowEl = el?.closest('[data-row-id]') as HTMLElement | null;
          const hovered = rowEl?.getAttribute('data-row-id') ?? null;
          if (hovered !== hoverRowRef.current) {
            hoverRowRef.current = hovered;
            onRowHover?.(hovered);
          }
        }
      };

      const onUp = () => {
        const ft = dragRef.current?.type ?? type;
        const finalHoverRow = hoverRowRef.current;
        setDragVisual(final => {
          if (final) {
            if (ft === 'body') {
              onOffsetCommit(layer.id, final.startOffset);
              if (canMoveRow && finalHoverRow && finalHoverRow !== layer.row_id) {
                onMoveToRow?.(layer.id, finalHoverRow);
              }
            }
            else if (ft === 'left-trim')  onLeftTrimCommit(layer.id, final.clipStart, final.startOffset);
            else                          onClipEndCommit(layer.id, final.clipEnd ?? bufDurRef.current);
          }
          return null;
        });
        dragRef.current = null;
        hoverRowRef.current = null;
        onRowHover?.(null);
        window.removeEventListener('mousemove', onMove);
        window.removeEventListener('mouseup', onUp);
      };
      window.addEventListener('mousemove', onMove);
      window.addEventListener('mouseup', onUp);
    },
    [layer, pxPerSec, onOffsetCommit, onLeftTrimCommit, onClipEndCommit, canMoveRow, onRowHover, onMoveToRow],
  );

  const handleCutClick = useCallback((e: React.MouseEvent) => {
    e.preventDefault(); e.stopPropagation();
    const sc = scrollEl(e.currentTarget as Element);
    if (!sc) return;
    onCutAt(layer.id, clientXToTime(e.clientX, sc, pxPerSec));
  }, [layer.id, pxPerSec, onCutAt]);

  const clipCursor =
    activeTool === 'cut'    ? 'crosshair' :
    activeTool === 'select' ? 'default' :
    dragVisual              ? 'grabbing' : 'grab';

  return (
    <div
      className="absolute top-1 bottom-1 rounded-md overflow-hidden select-none"
      style={{
        left:            leftPx,
        width:           widthPx,
        backgroundColor: isPending ? 'rgba(129,140,248,0.15)' : color.bg,
        border:          `1px solid ${isPending ? 'rgba(129,140,248,0.6)' : color.border}`,
        opacity:         layer.is_muted ? 0.4 : 1,
        cursor:          isPending ? 'default' : clipCursor,
      }}
      onMouseDown={e => {
        if (isPending || activeTool === 'select') return;
        if (activeTool === 'cut') handleCutClick(e);
        else startMoveDrag(e, 'body');
      }}
      onContextMenu={e => {
        e.preventDefault();
        e.stopPropagation();
        onClipContextMenu?.(layer, e.clientX, e.clientY);
      }}
    >
      {isPending ? (
        <>
          <div className="absolute inset-0 bg-gradient-to-r from-indigo-500/0 via-indigo-400/20 to-indigo-500/0 animate-pulse" />
          <div className="absolute inset-0 flex items-center justify-center gap-1.5 pointer-events-none">
            {[0, 150, 300].map(d => (
              <div key={d} className="w-1 h-1 rounded-full bg-indigo-400 animate-bounce"
                style={{ animationDelay: `${d}ms` }} />
            ))}
          </div>
        </>
      ) : (
        <>
          {activeTool === 'move' && (
            <div className="absolute left-0 top-0 bottom-0 w-2 z-10 cursor-ew-resize bg-white/20 hover:bg-white/40 transition-colors"
              onMouseDown={e => startMoveDrag(e, 'left-trim')} />
          )}
          <div
            ref={containerRef}
            className="absolute top-0 bottom-0"
            style={{
              pointerEvents: 'none',
              width: bufDurRef.current > 0 ? bufDurRef.current * pxPerSec : '100%',
              left:  bufDurRef.current > 0 ? -(clipStart * pxPerSec) : 0,
            }}
          />
          {activeTool === 'move' && (
            <div className="absolute right-0 top-0 bottom-0 w-2 z-10 cursor-ew-resize bg-white/20 hover:bg-white/40 transition-colors"
              onMouseDown={e => startMoveDrag(e, 'right-trim')} />
          )}
        </>
      )}
    </div>
  );
};

// ─── GroupRow ──────────────────────────────────────────────────────────────
interface GroupRowProps {
  anchor: StudioLayer;
  clips: StudioLayer[];
  rowIdx: number;
  totalDuration: number;
  pxPerSec: number;
  playheadTime: number;
  activeTool: StudioTool;
  selectedRegion: { rowId: string; start: number; end: number } | null;
  onBufferDuration: (id: string, dur: number) => void;
  onOffsetCommit:   (id: string, v: number) => void;
  onLeftTrimCommit: (id: string, cs: number, so: number) => void;
  onClipEndCommit:  (id: string, v: number) => void;
  onCutCommit:  (layerId: string, absoluteTime: number) => void;
  onSelectRegion: (r: { rowId: string; start: number; end: number } | null) => void;
  onRowHover: (rowId: string | null) => void;
  onMoveToRow: (layerId: string, newRowId: string) => void;
  onClipContextMenu: (layer: StudioLayer, x: number, y: number) => void;
  isDropTarget: boolean;
}

const GroupRow: React.FC<GroupRowProps> = ({
  anchor, clips, rowIdx, totalDuration, pxPerSec, playheadTime,
  activeTool, selectedRegion,
  onBufferDuration, onOffsetCommit, onLeftTrimCommit, onClipEndCommit, onCutCommit, onSelectRegion,
  onRowHover, onMoveToRow, onClipContextMenu, isDropTarget,
}) => {
  const [liveSelection, setLiveSelection] = useState<{ start: number; end: number } | null>(null);
  const selectDragRef = useRef<{ startTime: number; sc: HTMLElement } | null>(null);
  const [cutLineTime, setCutLineTime] = useState<number | null>(null);

  // ── Select drag ───────────────────────────────────────────────────────────
  const startSelectDrag = useCallback((e: React.MouseEvent) => {
    e.preventDefault(); e.stopPropagation();
    const sc = scrollEl(e.currentTarget as Element);
    if (!sc) return;
    const startTime = clientXToTime(e.clientX, sc, pxPerSec);
    selectDragRef.current = { startTime, sc };
    setLiveSelection({ start: startTime, end: startTime });

    const onMove = (me: MouseEvent) => {
      if (!selectDragRef.current) return;
      const t = clientXToTime(me.clientX, selectDragRef.current.sc, pxPerSec);
      setLiveSelection({
        start: Math.min(selectDragRef.current.startTime, t),
        end:   Math.max(selectDragRef.current.startTime, t),
      });
    };
    const onUp = () => {
      setLiveSelection(final => {
        if (final && final.end - final.start > 0.05) {
          onSelectRegion({ rowId: anchor.id, start: final.start, end: final.end });
        }
        return null;
      });
      selectDragRef.current = null;
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }, [anchor.id, pxPerSec, onSelectRegion]);

  // ── Cut hover ─────────────────────────────────────────────────────────────
  const handleRowMouseMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (activeTool !== 'cut') { setCutLineTime(null); return; }
    const sc = scrollEl(e.currentTarget as Element);
    if (!sc) return;
    setCutLineTime(clientXToTime(e.clientX, sc, pxPerSec));
  }, [activeTool, pxPerSec]);

  const committedSel = selectedRegion?.rowId === anchor.id ? selectedRegion : null;
  const visibleSel   = liveSelection ?? committedSel;

  const hasRealClips = clips.some(c => c.audio_url && c.audio_url !== '' && c.audio_url !== 'pending');

  return (
    <div
      className={`relative border-b flex-shrink-0 transition-colors ${
        isDropTarget
          ? 'border-pink-400 dark:border-pink-500 bg-pink-50/60 dark:bg-pink-900/15 ring-2 ring-inset ring-pink-400/70 dark:ring-pink-500/60'
          : 'border-zinc-200 dark:border-zinc-700'
      }`}
      style={{ height: TRACK_HEIGHT, cursor: activeTool === 'select' ? 'crosshair' : undefined }}
      data-layer-row="true"
      data-row-id={anchor.id}
      onMouseMove={handleRowMouseMove}
      onMouseLeave={() => setCutLineTime(null)}
      onMouseDown={e => { if (activeTool === 'select') startSelectDrag(e); }}
    >
      {!hasRealClips && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <span className="text-[10px] text-zinc-500 dark:text-zinc-600 select-none">
            Select a region and generate audio
          </span>
        </div>
      )}

      {clips.map((clip, ci) => (
        <ClipBlock
          key={clip.id}
          layer={clip}
          colorIdx={(rowIdx * 3 + ci) % LAYER_COLORS.length}
          totalDuration={totalDuration}
          pxPerSec={pxPerSec}
          playheadTime={playheadTime}
          activeTool={activeTool}
          onBufferDuration={onBufferDuration}
          onOffsetCommit={onOffsetCommit}
          onLeftTrimCommit={onLeftTrimCommit}
          onClipEndCommit={onClipEndCommit}
          onCutAt={onCutCommit}
          onRowHover={onRowHover}
          onMoveToRow={onMoveToRow}
          onClipContextMenu={onClipContextMenu}
        />
      ))}

      {/* Selection overlay — pixel positioned */}
      {visibleSel && (
        <div
          className="absolute top-0 bottom-0 pointer-events-none z-10"
          style={{
            left:  visibleSel.start * pxPerSec,
            width: Math.max(2, (visibleSel.end - visibleSel.start) * pxPerSec),
            backgroundColor: 'rgba(99,102,241,0.2)',
            borderLeft:  '2px solid rgba(99,102,241,0.9)',
            borderRight: '2px solid rgba(99,102,241,0.9)',
          }}
        />
      )}

      {/* Cut hover line */}
      {activeTool === 'cut' && cutLineTime !== null && (
        <div
          className="absolute top-0 bottom-0 w-px bg-yellow-400 dark:bg-yellow-300 z-20 pointer-events-none"
          style={{ left: cutLineTime * pxPerSec }}
        />
      )}
    </div>
  );
};

// ─── Tool toolbar ──────────────────────────────────────────────────────────
const TOOLS: { mode: StudioTool; icon: React.ReactNode; label: string; key: string }[] = [
  { mode: 'move',   icon: <MousePointer2 size={14} />,       label: 'Move',   key: 'V' },
  { mode: 'select', icon: <RectangleHorizontal size={14} />, label: 'Select', key: 'S' },
  { mode: 'cut',    icon: <Scissors size={14} />,             label: 'Cut',    key: 'C' },
];

interface ToolToolbarProps {
  activeTool: StudioTool;
  setActiveTool: (t: StudioTool) => void;
  zoom: number;
  setZoom: (z: number) => void;
  onFit: () => void;
}

const ToolToolbar: React.FC<ToolToolbarProps> = ({ activeTool, setActiveTool, zoom, setZoom, onFit }) => (
  <div className="flex-shrink-0 h-8 flex items-center gap-1 px-2 border-b border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800/60">
    {TOOLS.map(({ mode, icon, label, key }) => (
      <button
        key={mode}
        onClick={() => setActiveTool(mode)}
        title={`${label} (${key})`}
        className={`flex items-center gap-1.5 px-2 py-1 rounded text-xs font-medium transition-colors ${
          activeTool === mode
            ? 'bg-pink-500/15 text-pink-500 dark:text-pink-400 ring-1 ring-pink-500/40'
            : 'text-zinc-500 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-zinc-700'
        }`}
      >
        {icon}{label}
        <kbd className="ml-0.5 text-[9px] opacity-50 font-mono">{key}</kbd>
      </button>
    ))}

    <div className="mx-2 w-px h-4 bg-zinc-300 dark:bg-zinc-600" />

    {/* Zoom controls */}
    <button
      onClick={() => setZoom(Math.max(ZOOM_MIN, zoom / ZOOM_STEP))}
      title="Zoom out"
      className="p-1 rounded text-zinc-500 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-colors"
    >
      <ZoomOut size={14} />
    </button>

    <span className="text-[11px] font-mono text-zinc-500 dark:text-zinc-400 w-10 text-center select-none">
      {zoom < 1 ? zoom.toFixed(2) : zoom % 1 === 0 ? `${zoom}×` : `${zoom.toFixed(1)}×`}
    </span>

    <button
      onClick={() => setZoom(Math.min(ZOOM_MAX, zoom * ZOOM_STEP))}
      title="Zoom in"
      className="p-1 rounded text-zinc-500 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-colors"
    >
      <ZoomIn size={14} />
    </button>

    <button
      onClick={onFit}
      title="Fit to window"
      className="p-1 rounded text-zinc-500 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-colors"
    >
      <Maximize2 size={13} />
    </button>
  </div>
);

// ─── StudioTimeline ────────────────────────────────────────────────────────
interface StudioTimelineProps {
  playheadTime: number;
  totalDuration: number;
  seek: (seconds: number) => void;
}

const StudioTimeline: React.FC<StudioTimelineProps> = ({ playheadTime, totalDuration, seek }) => {
  const {
    layers, updateLayer, addLayer, deleteLayer, activeTool, setActiveTool,
    selectedRegion, setSelectedRegion, setGeneratePrefill,
  } = useStudio();

  const sorted = useMemo(() => [...layers].sort((a, b) => a.sort_order - b.sort_order), [layers]);

  const groups = useMemo(() => {
    const anchors = sorted.filter(l => !l.row_id);
    return anchors.map(anchor => {
      const children = sorted.filter(l => l.row_id === anchor.id);
      const anchorClip = anchor.audio_url ? [anchor] : [];
      return { anchor, clips: [...anchorClip, ...children] };
    });
  }, [sorted]);

  const [bufferDurations, setBufferDurations] = useState<Record<string, number>>({});
  const handleBufferDuration = useCallback((id: string, dur: number) => {
    setBufferDurations(prev => ({ ...prev, [id]: dur }));
  }, []);

  // ── Clip context menu ─────────────────────────────────────────────────────
  const [clipMenu, setClipMenu] = useState<{ layer: StudioLayer; x: number; y: number } | null>(null);
  const closeClipMenu = useCallback(() => setClipMenu(null), []);

  const handleClipContextMenu = useCallback((layer: StudioLayer, x: number, y: number) => {
    setClipMenu({ layer, x, y });
  }, []);

  const buildPrefill = useCallback((layer: StudioLayer): GeneratePrefill => {
    const gp = layer.generation_params ?? {};
    return {
      prompt:         (gp as any).prompt ?? (gp as any).style ?? layer.name ?? '',
      style:          (gp as any).style ?? '',
      lyrics:         (gp as any).lyrics ?? '',
      inferenceSteps: (gp as any).inferenceSteps ?? 8,
      guidanceScale:  (gp as any).guidanceScale  ?? 7,
    };
  }, []);

  const handleContextMenuDelete = useCallback(() => {
    if (!clipMenu) return;
    deleteLayer(clipMenu.layer.id);
    setClipMenu(null);
  }, [clipMenu, deleteLayer]);

  const handleContextMenuUsePrompt = useCallback(() => {
    if (!clipMenu) return;
    setGeneratePrefill(buildPrefill(clipMenu.layer));
    setClipMenu(null);
  }, [clipMenu, setGeneratePrefill, buildPrefill]);

  const handleContextMenuRegenerate = useCallback(() => {
    if (!clipMenu) return;
    const { layer } = clipMenu;
    const bufDur     = bufferDurations[layer.id] ?? 0;
    const clipDur    = (layer.clip_end ?? bufDur) - (layer.clip_start ?? 0);
    const rowId      = layer.row_id ?? layer.id;
    setSelectedRegion({ rowId, start: layer.start_offset, end: layer.start_offset + clipDur });
    setGeneratePrefill(buildPrefill(layer));
    setClipMenu(null);
  }, [clipMenu, bufferDurations, setSelectedRegion, setGeneratePrefill, buildPrefill]);

  const effectiveDuration = useMemo(() => {
    const maxBuf = (Object.values(bufferDurations) as number[]).reduce((a: number, d: number) => Math.max(a, d), 0);
    return Math.max(totalDuration, maxBuf, 10);
  }, [totalDuration, bufferDurations]);

  // ── Viewport width ────────────────────────────────────────────────────────
  const scrollRef   = useRef<HTMLDivElement>(null);
  const [viewportW, setViewportW] = useState(800);
  useEffect(() => {
    if (!scrollRef.current) return;
    const ro = new ResizeObserver(e => setViewportW(e[0].contentRect.width));
    ro.observe(scrollRef.current);
    return () => ro.disconnect();
  }, []);

  // ── Zoom ──────────────────────────────────────────────────────────────────
  const [zoom, setZoomState] = useState(1.0);

  const setZoom = useCallback((z: number) => {
    setZoomState(Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, z)));
  }, []);

  const fitToWindow = useCallback(() => {
    setZoomState(1.0);
    if (scrollRef.current) scrollRef.current.scrollLeft = 0;
  }, []);

  // pxPerSec is zoom-scaled. At zoom=1, content exactly fills viewport.
  const pxPerSec = effectiveDuration > 0 ? (viewportW / effectiveDuration) * zoom : zoom;
  const contentWidth = Math.max(viewportW, effectiveDuration * pxPerSec);

  // Ctrl+wheel to zoom, anchored to cursor position
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      const factor = e.deltaY < 0 ? ZOOM_STEP : 1 / ZOOM_STEP;
      setZoomState(prev => {
        const next = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, prev * factor));
        // Anchor zoom to cursor position
        const rect = el.getBoundingClientRect();
        const cursorContentX = (e.clientX - rect.left) + el.scrollLeft;
        const cursorTime = cursorContentX / ((viewportW / effectiveDuration) * prev);
        const newBasePx = (viewportW / effectiveDuration) * next;
        requestAnimationFrame(() => {
          el.scrollLeft = Math.max(0, cursorTime * newBasePx - (e.clientX - rect.left));
        });
        return next;
      });
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [viewportW, effectiveDuration]);

  // ── Ruler ─────────────────────────────────────────────────────────────────
  const tickInterval = useMemo(() => chooseTickInterval(effectiveDuration, pxPerSec), [effectiveDuration, pxPerSec]);
  const ticks = useMemo(() => {
    const arr: number[] = [];
    for (let t = 0; t <= effectiveDuration + tickInterval; t += tickInterval) arr.push(t);
    return arr;
  }, [effectiveDuration, tickInterval]);

  const handleRulerClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const sc = scrollRef.current;
    if (!sc) return;
    seek(clientXToTime(e.clientX, sc, pxPerSec));
  }, [seek, pxPerSec]);

  // ── Playhead ─────────────────────────────────────────────────────────────
  const playheadPx = playheadTime * pxPerSec;

  // ── Commit handlers ────────────────────────────────────────────────────────
  const handleOffsetCommit   = useCallback((id: string, v: number) => updateLayer(id, { start_offset: v }), [updateLayer]);
  const handleLeftTrimCommit = useCallback((id: string, cs: number, so: number) => updateLayer(id, { clip_start: cs, start_offset: so }), [updateLayer]);
  const handleClipEndCommit  = useCallback((id: string, v: number) => updateLayer(id, { clip_end: v }), [updateLayer]);

  const [dragOverRowId, setDragOverRowId] = useState<string | null>(null);
  const handleMoveToRow = useCallback((layerId: string, newRowId: string) => {
    updateLayer(layerId, { row_id: newRowId }).catch(console.error);
  }, [updateLayer]);

  const handleCutCommit = useCallback(async (layerId: string, absoluteCutTime: number) => {
    const layer = sorted.find(l => l.id === layerId);
    if (!layer) return;
    const bufDur = bufferDurations[layerId] ?? 0;
    const cs = layer.clip_start ?? 0;
    const ce = layer.clip_end ?? (bufDur > 0 ? bufDur : absoluteCutTime + 1);
    const timelineEnd = layer.start_offset + (ce - cs);
    const clampedCut = Math.max(layer.start_offset + 0.1, Math.min(absoluteCutTime, timelineEnd - 0.1));
    const localCut   = clampedCut - layer.start_offset + cs;

    await updateLayer(layerId, { clip_end: localCut });
    await addLayer({
      source_type:     layer.source_type,
      name:            layer.name + ' (cut)',
      audio_url:       layer.audio_url,
      row_id:          layer.row_id ?? layer.id,
      parent_layer_id: layer.parent_layer_id,
      stem_id:         layer.stem_id,
      clip_start:      localCut,
      clip_end:        layer.clip_end,
      start_offset:    clampedCut,
      volume:          layer.volume,
      is_muted:        layer.is_muted,
      is_solo:         layer.is_solo,
      is_locked:       layer.is_locked,
      sort_order:      layer.sort_order + 1,
    });
  }, [sorted, updateLayer, addLayer, bufferDurations]);

  return (
    <>
    <div className="flex flex-col flex-1 overflow-hidden">
      <ToolToolbar
        activeTool={activeTool} setActiveTool={setActiveTool}
        zoom={zoom} setZoom={setZoom} onFit={fitToWindow}
      />

      <div className="flex flex-1 overflow-hidden">
        {/* Label column — fixed, does not scroll */}
        <div
          className="flex-shrink-0 flex flex-col bg-zinc-50 dark:bg-zinc-900 border-r border-zinc-200 dark:border-zinc-700 z-10"
          style={{ width: LABEL_WIDTH }}
        >
          {/* Ruler placeholder */}
          <div className="h-6 border-b border-zinc-200 dark:border-zinc-700 bg-zinc-100 dark:bg-zinc-800 flex-shrink-0" />
          {groups.map(({ anchor }) => (
            <div
              key={anchor.id}
              className="flex items-center px-3 text-xs font-medium text-zinc-600 dark:text-zinc-300 border-b border-zinc-200 dark:border-zinc-700 flex-shrink-0 truncate"
              style={{ height: TRACK_HEIGHT }}
            >
              {anchor.name}
            </div>
          ))}
          {groups.length === 0 && (
            <div className="flex items-center justify-center h-20 text-xs text-zinc-400 px-3 text-center">
              Add layers to begin.
            </div>
          )}
        </div>

        {/* Scrollable timeline */}
        <div
          ref={scrollRef}
          className="flex-1 overflow-x-auto overflow-y-hidden relative bg-zinc-100 dark:bg-zinc-800"
          data-timeline-scroll="true"
        >
          {/* Inner content — width driven by zoom */}
          <div className="relative" style={{ width: contentWidth, minHeight: '100%' }}>

            {/* Playhead */}
            <div
              className="absolute top-0 bottom-0 w-px bg-pink-500 z-20 pointer-events-none"
              style={{ left: playheadPx }}
            />

            {/* Ruler */}
            <div
              className="sticky top-0 z-10 h-6 bg-zinc-200 dark:bg-zinc-700 border-b border-zinc-300 dark:border-zinc-600 relative cursor-crosshair"
              onClick={handleRulerClick}
            >
              {ticks.map(t => (
                <div key={t} className="absolute bottom-0 flex flex-col justify-end" style={{ left: t * pxPerSec }}>
                  <div className="w-px h-2 bg-zinc-400 dark:bg-zinc-500" />
                  <span className="absolute bottom-full mb-0.5 left-0.5 text-[9px] font-mono text-zinc-500 dark:text-zinc-400 whitespace-nowrap select-none pointer-events-none">
                    {formatRulerTime(t)}
                  </span>
                </div>
              ))}
            </div>

            {/* Track rows */}
            {groups.map(({ anchor, clips }, idx) => (
              <GroupRow
                key={anchor.id}
                anchor={anchor}
                clips={clips}
                rowIdx={idx}
                totalDuration={effectiveDuration}
                pxPerSec={pxPerSec}
                playheadTime={playheadTime}
                activeTool={activeTool}
                selectedRegion={selectedRegion}
                onBufferDuration={handleBufferDuration}
                onOffsetCommit={handleOffsetCommit}
                onLeftTrimCommit={handleLeftTrimCommit}
                onClipEndCommit={handleClipEndCommit}
                onCutCommit={handleCutCommit}
                onSelectRegion={setSelectedRegion}
                onRowHover={setDragOverRowId}
                onMoveToRow={handleMoveToRow}
                onClipContextMenu={handleClipContextMenu}
                isDropTarget={dragOverRowId === anchor.id}
              />
            ))}

            {groups.length === 0 && (
              <div className="flex items-center justify-center h-32 text-sm text-zinc-400 dark:text-zinc-500">
                No layers — add some in the panel on the left.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>

    {/* Clip right-click context menu */}
    {clipMenu && (
      <ClipContextMenu
        layer={clipMenu.layer}
        x={clipMenu.x}
        y={clipMenu.y}
        onClose={closeClipMenu}
        onDelete={handleContextMenuDelete}
        onUsePrompt={handleContextMenuUsePrompt}
        onRegenerate={handleContextMenuRegenerate}
      />
    )}
    </>
  );
};

export default StudioTimeline;
