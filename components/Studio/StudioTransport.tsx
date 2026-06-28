import React, { useCallback } from 'react';
import { Play, Pause, Square } from 'lucide-react';

interface StudioTransportProps {
  isPlaying: boolean;
  playheadTime: number;
  totalDuration: number;
  play: () => void;
  pause: () => void;
  stop: () => void;
  seek: (seconds: number) => void;
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  const t = Math.floor((seconds % 1) * 10);
  return `${m}:${s.toString().padStart(2, '0')}.${t}`;
}

const StudioTransport: React.FC<StudioTransportProps> = ({
  isPlaying,
  playheadTime,
  totalDuration,
  play,
  pause,
  stop,
  seek,
}) => {
  const handleSeekBarClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      const rect = e.currentTarget.getBoundingClientRect();
      const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
      seek(ratio * totalDuration);
    },
    [seek, totalDuration],
  );

  const progress = totalDuration > 0 ? playheadTime / totalDuration : 0;

  return (
    <div className="flex flex-col gap-1.5 px-4 py-2 bg-zinc-100 dark:bg-zinc-800 border-b border-zinc-200 dark:border-zinc-700 flex-shrink-0">
      {/* Buttons + time display */}
      <div className="flex items-center gap-3">
        {/* Stop */}
        <button
          onClick={stop}
          title="Stop"
          className="p-1.5 rounded text-zinc-500 dark:text-zinc-400 hover:text-zinc-800 dark:hover:text-white hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-colors"
        >
          <Square size={14} fill="currentColor" />
        </button>

        {/* Play / Pause */}
        <button
          onClick={isPlaying ? pause : play}
          title={isPlaying ? 'Pause' : 'Play'}
          className="w-8 h-8 rounded-full flex items-center justify-center bg-pink-500 hover:bg-pink-600 text-white transition-colors flex-shrink-0"
        >
          {isPlaying ? (
            <Pause size={14} fill="currentColor" />
          ) : (
            <Play size={14} className="ml-0.5" fill="currentColor" />
          )}
        </button>

        {/* Current time */}
        <span className="font-mono text-sm text-zinc-700 dark:text-zinc-200 tabular-nums w-20">
          {formatTime(playheadTime)}
        </span>

        {/* Separator */}
        <span className="text-zinc-300 dark:text-zinc-600">/</span>

        {/* Total duration */}
        <span className="font-mono text-sm text-zinc-400 dark:text-zinc-500 tabular-nums w-20">
          {formatTime(totalDuration)}
        </span>
      </div>

      {/* Seek bar */}
      <div
        className="w-full h-2 rounded-full bg-zinc-200 dark:bg-zinc-700 cursor-pointer relative overflow-hidden group"
        onClick={handleSeekBarClick}
        title="Click to seek"
      >
        {/* Filled portion */}
        <div
          className="absolute left-0 top-0 h-full bg-pink-500 rounded-full transition-none"
          style={{ width: `${progress * 100}%` }}
        />
        {/* Thumb hover effect */}
        <div
          className="absolute top-1/2 -translate-y-1/2 w-3 h-3 rounded-full bg-pink-500 shadow opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none"
          style={{ left: `calc(${progress * 100}% - 6px)` }}
        />
      </div>
    </div>
  );
};

export default StudioTransport;
