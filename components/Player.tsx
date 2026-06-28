import React, { useRef, useState, useEffect, useCallback } from 'react';
import { Track } from '../types';
import {
  Play, Pause, SkipBack, SkipForward, Repeat, Shuffle, Download,
  Volume2, VolumeX, Maximize2, Repeat1, ChevronDown, ChevronUp,
} from 'lucide-react';
import { useResponsive } from '../context/ResponsiveContext';
import { useI18n } from '../context/I18nContext';
import { AlbumCover } from './AlbumCover';

export const Player: React.FC = () => {
  const { isMobile } = useResponsive();
  const { t } = useI18n();

  const audioRef = useRef<HTMLAudioElement>(null);
  const progressBarRef = useRef<HTMLDivElement>(null);
  const fullscreenProgressRef = useRef<HTMLDivElement>(null);
  const speedMenuRef = useRef<HTMLDivElement>(null);
  const volumeHideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [currentSong, setCurrentSong] = useState<Track | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(0.8);
  const [playbackRate, setPlaybackRate] = useState(1.0);
  const [isShuffle, setIsShuffle] = useState(false);
  const [repeatMode, setRepeatMode] = useState<'none' | 'all' | 'one'>('none');
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showSpeedMenu, setShowSpeedMenu] = useState(false);
  const [isHoveringVolume, setIsHoveringVolume] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(true);
  const collapseTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const scheduleCollapse = useCallback(() => {
    if (collapseTimer.current) clearTimeout(collapseTimer.current);
    collapseTimer.current = setTimeout(() => setIsCollapsed(true), 4000);
  }, []);

  const handleActivity = useCallback(() => {
    setIsCollapsed(false);
    scheduleCollapse();
  }, [scheduleCollapse]);

  // Start collapse timer when a song loads
  useEffect(() => {
    if (currentSong) scheduleCollapse();
    return () => { if (collapseTimer.current) clearTimeout(collapseTimer.current); };
  }, [currentSong, scheduleCollapse]);

  // Listen for play-track events dispatched by the dashboard play button
  useEffect(() => {
    const handlePlayTrack = (e: Event) => {
      const track = (e as CustomEvent<Track>).detail;
      if (!track.audio_url) return;
      setCurrentSong(track);
      setCurrentTime(0);
      setIsPlaying(true);
      setIsCollapsed(false);
      if (collapseTimer.current) clearTimeout(collapseTimer.current);
      collapseTimer.current = setTimeout(() => setIsCollapsed(true), 4000);
    };
    window.addEventListener('ace:play-track', handlePlayTrack);
    return () => window.removeEventListener('ace:play-track', handlePlayTrack);
  }, []);

  // When currentSong changes, load and auto-play
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !currentSong?.audio_url) return;
    audio.src = currentSong.audio_url;
    audio.load();
    audio.play().catch(() => setIsPlaying(false));
  }, [currentSong]);

  useEffect(() => {
    const audio = audioRef.current;
    if (audio) audio.volume = volume;
  }, [volume]);

  useEffect(() => {
    const audio = audioRef.current;
    if (audio) audio.playbackRate = playbackRate;
  }, [playbackRate]);

  const handleTimeUpdate = useCallback(() => {
    const audio = audioRef.current;
    if (audio) setCurrentTime(audio.currentTime);
  }, []);

  const handleDurationChange = useCallback(() => {
    const audio = audioRef.current;
    if (audio) setDuration(audio.duration || 0);
  }, []);

  const handleEnded = useCallback(() => {
    if (repeatMode === 'one') {
      const audio = audioRef.current;
      if (audio) { audio.currentTime = 0; audio.play().catch(() => {}); }
    } else {
      setIsPlaying(false);
    }
  }, [repeatMode]);

  const togglePlay = useCallback(() => {
    const audio = audioRef.current;
    if (!audio || !currentSong) return;
    if (isPlaying) {
      audio.pause();
    } else {
      audio.play().catch(() => setIsPlaying(false));
    }
  }, [isPlaying, currentSong]);

  const handleSeekInteraction = useCallback((
    e: React.MouseEvent<HTMLDivElement>,
    ref: React.RefObject<HTMLDivElement>,
  ) => {
    if (!ref.current || !duration) return;
    const rect = ref.current.getBoundingClientRect();
    const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const audio = audioRef.current;
    if (audio) { audio.currentTime = pct * duration; setCurrentTime(pct * duration); }
  }, [duration]);

  const handleSeekByPct = useCallback((pct: number) => {
    const audio = audioRef.current;
    if (audio && duration) { audio.currentTime = pct * duration; setCurrentTime(pct * duration); }
  }, [duration]);

  const handleVolumeChange = useCallback((val: number) => {
    setVolume(val);
    const audio = audioRef.current;
    if (audio) audio.volume = val;
  }, []);

  const handlePlaybackRateChange = useCallback((rate: number) => {
    setPlaybackRate(rate);
    const audio = audioRef.current;
    if (audio) audio.playbackRate = rate;
  }, []);

  const toggleRepeat = useCallback(() => {
    setRepeatMode(m => m === 'none' ? 'all' : m === 'all' ? 'one' : 'none');
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isFullscreen) setIsFullscreen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isFullscreen]);

  useEffect(() => {
    const onClickOutside = (e: MouseEvent) => {
      if (speedMenuRef.current && !speedMenuRef.current.contains(e.target as Node)) {
        setShowSpeedMenu(false);
      }
    };
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, []);

  const handleDownload = async () => {
    if (!currentSong?.audio_url) return;
    try {
      const response = await fetch(currentSong.audio_url);
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${currentSong.title || 'track'}.mp3`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Download failed:', error);
    }
  };

  const formatTime = (time: number) => {
    if (isNaN(time) || time === 0) return '0:00';
    const m = Math.floor(time / 60);
    const s = Math.floor(time % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  const progressPercent = duration ? (currentTime / duration) * 100 : 0;

  return (
    <>
      <audio
        ref={audioRef}
        onTimeUpdate={handleTimeUpdate}
        onDurationChange={handleDurationChange}
        onEnded={handleEnded}
        onPlay={() => setIsPlaying(true)}
        onPause={() => setIsPlaying(false)}
      />

      {/* Gradient that shows when collapsed — always fixed to bottom, behind waveform */}
      {!isMobile && !isFullscreen && (
        <div
          className="pointer-events-none fixed bottom-0 left-0 right-0 z-40 transition-opacity duration-500 bg-gradient-to-t from-white dark:from-black to-transparent"
          style={{ height: 64, opacity: isCollapsed ? 1 : 0 }}
        />
      )}

      {!currentSong ? (
        // Layout spacer — keeps flex layout stable; gradient provides the visual
        <div className="h-[68px] lg:h-[76px]" />
      ) : isMobile ? (
        isFullscreen ? (
          <MobileFullscreen
            currentSong={currentSong}
            isPlaying={isPlaying}
            currentTime={currentTime}
            duration={duration}
            volume={volume}
            isShuffle={isShuffle}
            repeatMode={repeatMode}
            fullscreenProgressRef={fullscreenProgressRef}
            onTogglePlay={togglePlay}
            onPrevious={() => {}}
            onNext={() => {}}
            onSeekInteraction={handleSeekInteraction}
            onVolumeChange={handleVolumeChange}
            onToggleShuffle={() => setIsShuffle(s => !s)}
            onToggleRepeat={toggleRepeat}
            onDownload={handleDownload}
            onClose={() => setIsFullscreen(false)}
            formatTime={formatTime}
            progressPercent={progressPercent}
          />
        ) : (
          <MobileBar
            currentSong={currentSong}
            isPlaying={isPlaying}
            progressPercent={progressPercent}
            progressBarRef={progressBarRef}
            onTogglePlay={togglePlay}
            onPrevious={() => {}}
            onNext={() => {}}
            onSeekInteraction={handleSeekInteraction}
            onExpand={() => setIsFullscreen(true)}
          />
        )
      ) : isFullscreen ? (
        <DesktopFullscreen
          currentSong={currentSong}
          isPlaying={isPlaying}
          currentTime={currentTime}
          duration={duration}
          volume={volume}
          playbackRate={playbackRate}
          isShuffle={isShuffle}
          repeatMode={repeatMode}
          fullscreenProgressRef={fullscreenProgressRef}
          speedMenuRef={speedMenuRef}
          showSpeedMenu={showSpeedMenu}
          onTogglePlay={togglePlay}
          onPrevious={() => {}}
          onNext={() => {}}
          onSeekInteraction={handleSeekInteraction}
          onVolumeChange={handleVolumeChange}
          onPlaybackRateChange={handlePlaybackRateChange}
          onToggleShuffle={() => setIsShuffle(s => !s)}
          onToggleRepeat={toggleRepeat}
          onDownload={handleDownload}
          onClose={() => setIsFullscreen(false)}
          onToggleSpeedMenu={() => setShowSpeedMenu(s => !s)}
          formatTime={formatTime}
          progressPercent={progressPercent}
          t={t}
        />
      ) : (
        <DesktopBar
          currentSong={currentSong}
          isPlaying={isPlaying}
          currentTime={currentTime}
          duration={duration}
          volume={volume}
          playbackRate={playbackRate}
          isShuffle={isShuffle}
          repeatMode={repeatMode}
          progressBarRef={progressBarRef}
          speedMenuRef={speedMenuRef}
          showSpeedMenu={showSpeedMenu}
          isHoveringVolume={isHoveringVolume}
          onTogglePlay={togglePlay}
          onPrevious={() => {}}
          onNext={() => {}}
          onSeekInteraction={handleSeekInteraction}
          onVolumeChange={handleVolumeChange}
          onPlaybackRateChange={handlePlaybackRateChange}
          onToggleShuffle={() => setIsShuffle(s => !s)}
          onToggleRepeat={toggleRepeat}
          onDownload={handleDownload}
          onExpand={() => setIsFullscreen(true)}
          onToggleSpeedMenu={() => setShowSpeedMenu(s => !s)}
          onVolumeEnter={() => {
            if (volumeHideTimer.current) clearTimeout(volumeHideTimer.current);
            setIsHoveringVolume(true);
          }}
          onVolumeLeave={() => {
            volumeHideTimer.current = setTimeout(() => setIsHoveringVolume(false), 400);
          }}
          onSeekByPct={handleSeekByPct}
          onActivity={handleActivity}
          isCollapsed={isCollapsed}
          showHorizon={!isCollapsed}
          formatTime={formatTime}
          progressPercent={progressPercent}
          t={t}
        />
      )}
    </>
  );
};

// ─── Waveform visualization ───────────────────────────────────────────────────

function seededRandom(seed: string) {
  let h = 0;
  for (let i = 0; i < seed.length; i++) {
    h = (Math.imul(31, h) + seed.charCodeAt(i)) | 0;
  }
  return (idx: number) => {
    const x = Math.sin(h + idx) * 10000;
    return x - Math.floor(x);
  };
}

const WaveformProgress: React.FC<{
  progressPercent: number;
  seed: string;
  showHorizon: boolean;
  progressBarRef: React.RefObject<HTMLDivElement>;
  onSeekInteraction: (e: React.MouseEvent<HTMLDivElement>, ref: React.RefObject<HTMLDivElement>) => void;
}> = ({ progressPercent, seed, showHorizon, progressBarRef, onSeekInteraction }) => {
  const BAR_COUNT = 160;
  const BAR_W = 1;
  const GAP = 0.9;
  const H = 56;
  const HORIZON = H / 2; // y=28 aligns with the player top border
  const totalW = BAR_COUNT * (BAR_W + GAP) - GAP;
  const rand = seededRandom(seed);
  // Bars grow upward from HORIZON, max height = HORIZON
  const bars = Array.from({ length: BAR_COUNT }, (_, i) => 0.08 + rand(i) * 0.92);
  const playedX = (progressPercent / 100) * totalW;

  return (
    <div
      ref={progressBarRef}
      className="absolute left-0 right-0 top-0 -translate-y-1/2 select-none z-0 cursor-pointer"
      style={{ height: H }}
      onClick={e => onSeekInteraction(e, progressBarRef)}
    >
      <svg width="100%" height={H} viewBox={`0 0 ${totalW} ${H}`} preserveAspectRatio="none" style={{ pointerEvents: 'none' }}>
        <defs>
          <linearGradient id="waveGradPlayed" x1="0" y1="0" x2={totalW} y2="0" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#ec4899" />
            <stop offset="50%" stopColor="#a855f7" />
            <stop offset="100%" stopColor="#6366f1" />
          </linearGradient>
          {/* Fade: transparent at top and bottom, opaque around the center line */}
          <linearGradient id="waveFadeGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%"   stopColor="white" stopOpacity="0" />
            <stop offset="28%"  stopColor="white" stopOpacity="1" />
            <stop offset="72%"  stopColor="white" stopOpacity="1" />
            <stop offset="100%" stopColor="white" stopOpacity="0" />
          </linearGradient>
          <mask id="waveFadeMask">
            <rect x="0" y="0" width={totalW} height={H} fill="url(#waveFadeGrad)" />
          </mask>
        </defs>

        {/* Mirrored bars — symmetric around HORIZON (the center / player top border) */}
        <g mask="url(#waveFadeMask)">
          {bars.map((h, i) => {
            const halfH = Math.max(1, h * HORIZON * 0.92);
            const x = i * (BAR_W + GAP);
            const played = (i / BAR_COUNT) * 100 <= progressPercent;
            const fill = played ? 'url(#waveGradPlayed)' : 'rgba(148,163,184,0.28)';
            return (
              <rect
                key={i}
                x={x}
                y={HORIZON - halfH}
                width={BAR_W}
                height={halfH * 2}
                fill={fill}
                rx={0.5}
              />
            );
          })}
        </g>

        {/* Horizon line — only shown when player is expanded */}
        {showHorizon && <>
          <line x1="0" y1={HORIZON} x2={playedX} y2={HORIZON} stroke="url(#waveGradPlayed)" strokeWidth="1" strokeOpacity="0.7" />
          <line x1={playedX} y1={HORIZON} x2={totalW} y2={HORIZON} stroke="rgba(148,163,184,0.2)" strokeWidth="1" />
        </>}
      </svg>
    </div>
  );
};

const PlayheadHandle: React.FC<{
  progressPercent: number;
  progressBarRef: React.RefObject<HTMLDivElement>;
  onSeekByPct: (pct: number) => void;
}> = ({ progressPercent, progressBarRef, onSeekByPct }) => {
  const seek = useCallback((clientX: number) => {
    if (!progressBarRef.current) return;
    const rect = progressBarRef.current.getBoundingClientRect();
    onSeekByPct(Math.max(0, Math.min(1, (clientX - rect.left) / rect.width)));
  }, [progressBarRef, onSeekByPct]);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    seek(e.clientX);
    const onMove = (ev: MouseEvent) => seek(ev.clientX);
    const onUp = () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }, [seek]);

  return (
    <div
      className="absolute top-0 left-0 right-0 z-0 pointer-events-none"
      style={{ height: 56, transform: 'translateY(-50%)' }}
    >
      {/* Playhead — full height, centered on the waveform, fades at tips */}
      <div
        className="absolute w-[2px] h-full pointer-events-auto cursor-grab active:cursor-grabbing"
        style={{
          left: `${progressPercent}%`,
          transform: 'translateX(-50%)',
          background: 'linear-gradient(to bottom, transparent 0%, rgba(255,255,255,0.85) 28%, rgba(255,255,255,0.85) 72%, transparent 100%)',
        }}
        onMouseDown={handleMouseDown}
      />
    </div>
  );
};

// ─── Sub-components ───────────────────────────────────────────────────────────

interface MobileFullscreenProps {
  currentSong: Track;
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  volume: number;
  isShuffle: boolean;
  repeatMode: 'none' | 'all' | 'one';
  fullscreenProgressRef: React.RefObject<HTMLDivElement>;
  onTogglePlay: () => void;
  onPrevious: () => void;
  onNext: () => void;
  onSeekInteraction: (e: React.MouseEvent<HTMLDivElement>, ref: React.RefObject<HTMLDivElement>) => void;
  onVolumeChange: (v: number) => void;
  onToggleShuffle: () => void;
  onToggleRepeat: () => void;
  onDownload: () => void;
  onClose: () => void;
  formatTime: (t: number) => string;
  progressPercent: number;
}

const MobileFullscreen: React.FC<MobileFullscreenProps> = ({
  currentSong, isPlaying, currentTime, duration, volume, isShuffle, repeatMode,
  fullscreenProgressRef, onTogglePlay, onPrevious, onNext, onSeekInteraction,
  onVolumeChange, onToggleShuffle, onToggleRepeat, onDownload, onClose,
  formatTime, progressPercent,
}) => (
  <div className="fixed inset-0 z-50 bg-gradient-to-b from-zinc-100 to-zinc-50 dark:from-zinc-900 dark:to-black flex flex-col safe-area-inset-top safe-area-inset-bottom transition-colors duration-300">
    <div className="flex items-center justify-between px-4 py-3">
      <button onClick={onClose} className="p-2 text-zinc-600 dark:text-white/70 tap-highlight-none">
        <ChevronDown size={28} />
      </button>
      <span className="text-xs text-zinc-500 dark:text-white/50 uppercase tracking-wider">Now Playing</span>
      <div className="w-11" />
    </div>
    <div className="flex-1 flex items-center justify-center px-8 py-4">
      <div className="w-full max-w-[280px] aspect-square rounded-lg overflow-hidden shadow-2xl">
        {currentSong.cover_url
          ? <img src={currentSong.cover_url} className="w-full h-full object-cover" alt="cover" onError={e => { e.currentTarget.style.display = 'none'; }} />
          : <AlbumCover seed={currentSong.id || currentSong.title} size="full" className="w-full h-full" />}
      </div>
    </div>
    <div className="px-6 mb-4">
      <h2 className="text-xl font-bold text-zinc-900 dark:text-white truncate">{currentSong.title}</h2>
    </div>
    <div className="px-6 mb-2">
      <div
        ref={fullscreenProgressRef}
        className="w-full h-1.5 bg-zinc-300 dark:bg-white/20 rounded-full cursor-pointer relative"
        onClick={e => onSeekInteraction(e, fullscreenProgressRef)}
      >
        <div className="h-full bg-zinc-900 dark:bg-white rounded-full relative" style={{ width: `${progressPercent}%` }}>
          <div className="absolute right-0 top-1/2 -translate-y-1/2 w-4 h-4 bg-zinc-900 dark:bg-white rounded-full shadow-lg -mr-2" />
        </div>
      </div>
      <div className="flex justify-between mt-2 text-xs text-zinc-500 dark:text-white/50 font-mono">
        <span>{formatTime(currentTime)}</span>
        <span>{formatTime(duration)}</span>
      </div>
    </div>
    <div className="flex items-center justify-center gap-8 py-4">
      <button onClick={onToggleShuffle} className={`p-2 tap-highlight-none ${isShuffle ? 'text-pink-600 dark:text-pink-500' : 'text-zinc-400 dark:text-white/50'}`}>
        <Shuffle size={22} />
      </button>
      <button onClick={onPrevious} className="p-2 text-zinc-800 dark:text-white tap-highlight-none">
        <SkipBack size={32} fill="currentColor" />
      </button>
      <button onClick={onTogglePlay} className="w-16 h-16 rounded-full bg-zinc-900 dark:bg-white text-white dark:text-black flex items-center justify-center shadow-lg tap-highlight-none">
        {isPlaying ? <Pause size={32} fill="currentColor" /> : <Play size={32} fill="currentColor" className="ml-1" />}
      </button>
      <button onClick={onNext} className="p-2 text-zinc-800 dark:text-white tap-highlight-none">
        <SkipForward size={32} fill="currentColor" />
      </button>
      <button onClick={onToggleRepeat} className={`p-2 tap-highlight-none relative ${repeatMode !== 'none' ? 'text-pink-600 dark:text-pink-500' : 'text-zinc-400 dark:text-white/50'}`}>
        {repeatMode === 'one' ? <Repeat1 size={22} /> : <Repeat size={22} />}
      </button>
    </div>
    <div className="flex flex-col items-center gap-3 px-6 py-4">
      <div className="relative h-32 w-8 flex items-center justify-center">
        <input
          type="range" min="0" max="1" step="0.01" value={volume}
          onChange={e => onVolumeChange(parseFloat(e.target.value))}
          className="w-32 h-8 -rotate-90 origin-center appearance-none bg-transparent cursor-pointer"
          style={{ WebkitAppearance: 'none', background: `linear-gradient(to right, rgb(236 72 153) 0%, rgb(236 72 153) ${volume * 100}%, rgb(228 228 231) ${volume * 100}%, rgb(228 228 231) 100%)` }}
        />
      </div>
      <button onClick={() => onVolumeChange(volume === 0 ? 0.8 : 0)} className="text-zinc-400 dark:text-white/50 tap-highlight-none">
        {volume === 0 ? <VolumeX size={20} /> : <Volume2 size={20} />}
      </button>
    </div>
    <div className="flex items-center justify-center gap-6 px-6 pb-6 text-zinc-400 dark:text-white/50">
      <button onClick={onDownload} className="p-3 tap-highlight-none"><Download size={20} /></button>
    </div>
  </div>
);

interface MobileBarProps {
  currentSong: Track;
  isPlaying: boolean;
  progressPercent: number;
  progressBarRef: React.RefObject<HTMLDivElement>;
  onTogglePlay: () => void;
  onPrevious: () => void;
  onNext: () => void;
  onSeekInteraction: (e: React.MouseEvent<HTMLDivElement>, ref: React.RefObject<HTMLDivElement>) => void;
  onExpand: () => void;
}

const MobileBar: React.FC<MobileBarProps> = ({
  currentSong, isPlaying, progressPercent, progressBarRef,
  onTogglePlay, onPrevious, onNext, onSeekInteraction, onExpand,
}) => (
  <div className="bg-white dark:bg-black/95 backdrop-blur border-t border-zinc-200 dark:border-white/10 flex flex-col z-50 transition-colors duration-300 safe-area-inset-bottom">
    <div
      ref={progressBarRef}
      className="w-full h-1 bg-zinc-200 dark:bg-zinc-800 cursor-pointer relative"
      onClick={e => onSeekInteraction(e, progressBarRef)}
    >
      <div className="h-full bg-pink-600 dark:bg-pink-500" style={{ width: `${progressPercent}%` }} />
    </div>
    <div className="flex items-center px-3 py-2 gap-3">
      <div className="flex items-center gap-3 flex-1 min-w-0" onClick={onExpand}>
        <div className="w-11 h-11 rounded bg-zinc-200 dark:bg-zinc-800 overflow-hidden shadow-sm flex-shrink-0 relative">
          {currentSong.cover_url
            ? <img src={currentSong.cover_url} className="w-full h-full object-cover" alt="cover" onError={e => { e.currentTarget.style.display = 'none'; }} />
            : <AlbumCover seed={currentSong.id || currentSong.title} size="full" className="w-full h-full" />}
          <div className="absolute inset-0 flex items-center justify-center bg-black/20 opacity-0 active:opacity-100 transition-opacity">
            <ChevronUp size={20} className="text-white" />
          </div>
        </div>
        <div className="overflow-hidden flex-1 min-w-0">
          <h4 className="text-sm font-semibold text-zinc-900 dark:text-white truncate">{currentSong.title}</h4>
        </div>
      </div>
      <div className="flex items-center gap-1 flex-shrink-0">
        <button onClick={onPrevious} className="p-2 text-zinc-700 dark:text-zinc-300 tap-highlight-none">
          <SkipBack size={22} fill="currentColor" />
        </button>
        <button onClick={onTogglePlay} className="w-11 h-11 rounded-full bg-zinc-900 dark:bg-white text-white dark:text-black flex items-center justify-center shadow-lg tap-highlight-none">
          {isPlaying ? <Pause size={22} fill="currentColor" /> : <Play size={22} fill="currentColor" className="ml-0.5" />}
        </button>
        <button onClick={onNext} className="p-2 text-zinc-700 dark:text-zinc-300 tap-highlight-none">
          <SkipForward size={22} fill="currentColor" />
        </button>
      </div>
    </div>
  </div>
);

interface DesktopFullscreenProps {
  currentSong: Track;
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  volume: number;
  playbackRate: number;
  isShuffle: boolean;
  repeatMode: 'none' | 'all' | 'one';
  fullscreenProgressRef: React.RefObject<HTMLDivElement>;
  speedMenuRef: React.RefObject<HTMLDivElement>;
  showSpeedMenu: boolean;
  onTogglePlay: () => void;
  onPrevious: () => void;
  onNext: () => void;
  onSeekInteraction: (e: React.MouseEvent<HTMLDivElement>, ref: React.RefObject<HTMLDivElement>) => void;
  onVolumeChange: (v: number) => void;
  onPlaybackRateChange: (r: number) => void;
  onToggleShuffle: () => void;
  onToggleRepeat: () => void;
  onDownload: () => void;
  onClose: () => void;
  onToggleSpeedMenu: () => void;
  formatTime: (t: number) => string;
  progressPercent: number;
  t: (key: string) => string;
}

const DesktopFullscreen: React.FC<DesktopFullscreenProps> = ({
  currentSong, isPlaying, currentTime, duration, volume, playbackRate,
  isShuffle, repeatMode, fullscreenProgressRef, speedMenuRef, showSpeedMenu,
  onTogglePlay, onPrevious, onNext, onSeekInteraction, onVolumeChange,
  onPlaybackRateChange, onToggleShuffle, onToggleRepeat, onDownload, onClose,
  onToggleSpeedMenu, formatTime, progressPercent, t,
}) => (
  <div
    className="fixed inset-0 z-50 bg-gradient-to-b from-zinc-100 to-zinc-50 dark:from-zinc-900 dark:to-black flex flex-col transition-colors duration-300"
    onClick={onClose}
  >
    <div className="flex items-center justify-between px-6 py-4" onClick={e => e.stopPropagation()}>
      <button onClick={onClose} className="p-2 text-zinc-600 dark:text-white/70 hover:bg-zinc-200 dark:hover:bg-white/10 rounded-full transition-colors">
        <ChevronDown size={28} />
      </button>
      <span className="text-sm text-zinc-500 dark:text-white/50 uppercase tracking-wider font-medium">{t('nowPlaying')}</span>
      <div className="w-11" />
    </div>
    <div className="flex-1 flex items-center justify-center px-8 py-4 overflow-hidden" onClick={e => e.stopPropagation()}>
      <div className="flex flex-col lg:flex-row items-center gap-8 lg:gap-16 max-w-5xl w-full">
        <div className="w-full max-w-[320px] lg:max-w-[400px] aspect-square rounded-lg overflow-hidden shadow-2xl flex-shrink-0">
          {currentSong.cover_url
            ? <img src={currentSong.cover_url} className="w-full h-full object-cover" alt="cover" onError={e => { e.currentTarget.style.display = 'none'; }} />
            : <AlbumCover seed={currentSong.id || currentSong.title} size="full" className="w-full h-full" />}
        </div>
        <div className="flex flex-col items-center lg:items-start gap-6 flex-1 min-w-0 max-w-lg">
          <h2 className="text-2xl lg:text-3xl font-bold text-zinc-900 dark:text-white truncate w-full text-center lg:text-left">{currentSong.title}</h2>
          <div className="w-full">
            <div
              ref={fullscreenProgressRef}
              className="w-full h-2 bg-zinc-300 dark:bg-white/20 rounded-full cursor-pointer relative group"
              onClick={e => onSeekInteraction(e, fullscreenProgressRef)}
            >
              <div className="h-full bg-zinc-900 dark:bg-white rounded-full relative group-hover:bg-pink-600 dark:group-hover:bg-pink-500 transition-colors" style={{ width: `${progressPercent}%` }}>
                <div className="absolute right-0 top-1/2 -translate-y-1/2 w-4 h-4 bg-zinc-900 dark:bg-white group-hover:bg-pink-600 dark:group-hover:bg-pink-500 rounded-full shadow-lg -mr-2 opacity-0 group-hover:opacity-100 transition-opacity" />
              </div>
            </div>
            <div className="flex justify-between mt-2 text-sm text-zinc-500 dark:text-white/50 font-mono">
              <span>{formatTime(currentTime)}</span>
              <span>{formatTime(duration)}</span>
            </div>
          </div>
          <div className="flex items-center justify-center gap-8 py-2 w-full">
            <button onClick={onToggleShuffle} className={`p-2 transition-colors ${isShuffle ? 'text-pink-600 dark:text-pink-500' : 'text-zinc-400 hover:text-zinc-900 dark:hover:text-white'}`}>
              <Shuffle size={22} />
            </button>
            <button onClick={onPrevious} className="p-2 text-zinc-800 dark:text-white hover:scale-110 transition-transform">
              <SkipBack size={36} fill="currentColor" />
            </button>
            <button onClick={onTogglePlay} className="w-18 h-18 p-5 rounded-full bg-zinc-900 dark:bg-white text-white dark:text-black flex items-center justify-center shadow-lg hover:scale-105 transition-transform">
              {isPlaying ? <Pause size={36} fill="currentColor" /> : <Play size={36} fill="currentColor" className="ml-1" />}
            </button>
            <button onClick={onNext} className="p-2 text-zinc-800 dark:text-white hover:scale-110 transition-transform">
              <SkipForward size={36} fill="currentColor" />
            </button>
            <button onClick={onToggleRepeat} className={`p-2 transition-colors relative ${repeatMode !== 'none' ? 'text-pink-600 dark:text-pink-500' : 'text-zinc-400 hover:text-zinc-900 dark:hover:text-white'}`}>
              {repeatMode === 'one' ? <Repeat1 size={22} /> : <Repeat size={22} />}
              {repeatMode !== 'none' && <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-1 h-1 bg-current rounded-full" />}
            </button>
          </div>
          <div className="relative group hidden lg:block" ref={speedMenuRef}>
            <button className="px-2 py-1 text-[11px] font-mono font-bold hover:bg-zinc-200 dark:hover:bg-white/10 rounded transition-colors min-w-[42px] text-center" onClick={onToggleSpeedMenu}>
              {playbackRate}x
            </button>
            {showSpeedMenu && (
              <div className="absolute bottom-full right-0 mb-2 bg-white dark:bg-zinc-800 rounded-lg shadow-xl border border-zinc-200 dark:border-white/10 py-1 min-w-[80px] z-50">
                {[0.25, 0.5, 0.75, 1.0, 1.25, 1.5, 1.75, 2.0].map(rate => (
                  <button key={rate} onClick={() => onPlaybackRateChange(rate)} className={`w-full px-3 py-1.5 text-left text-xs font-mono hover:bg-zinc-100 dark:hover:bg-white/10 transition-colors ${playbackRate === rate ? 'text-pink-600 dark:text-pink-500 font-bold' : 'text-zinc-700 dark:text-zinc-300'}`}>
                    {rate === 1.0 ? t('normalSpeed') : `${rate}x`}
                  </button>
                ))}
              </div>
            )}
          </div>
          <div className="flex items-center gap-4 w-full max-w-xs">
            <button onClick={() => onVolumeChange(volume === 0 ? 0.8 : 0)} className="text-zinc-500 dark:text-white/50 hover:text-zinc-900 dark:hover:text-white transition-colors">
              {volume === 0 ? <VolumeX size={22} /> : <Volume2 size={22} />}
            </button>
            <div className="flex-1 h-1.5 bg-zinc-300 dark:bg-white/20 rounded-full relative">
              <input type="range" min="0" max="1" step="0.01" value={volume} onChange={e => onVolumeChange(parseFloat(e.target.value))} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10" />
              <div className="h-full bg-zinc-700 dark:bg-white/70 rounded-full" style={{ width: `${volume * 100}%` }} />
              <div className="absolute top-1/2 -translate-y-1/2 w-3.5 h-3.5 bg-zinc-700 dark:bg-white/70 rounded-full shadow pointer-events-none" style={{ left: `clamp(0px, calc(${volume * 100}% - 7px), calc(100% - 14px))` }} />
            </div>
          </div>
          <div className="flex items-center justify-center gap-4 text-zinc-400 dark:text-white/50">
            <button onClick={onDownload} className="p-3 rounded-full hover:bg-zinc-200 dark:hover:bg-white/10 transition-colors" title={t('downloadAudio')}>
              <Download size={20} />
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
);

interface DesktopBarProps {
  currentSong: Track;
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  volume: number;
  playbackRate: number;
  isShuffle: boolean;
  repeatMode: 'none' | 'all' | 'one';
  progressBarRef: React.RefObject<HTMLDivElement>;
  speedMenuRef: React.RefObject<HTMLDivElement>;
  showSpeedMenu: boolean;
  isHoveringVolume: boolean;
  onTogglePlay: () => void;
  onPrevious: () => void;
  onNext: () => void;
  onSeekInteraction: (e: React.MouseEvent<HTMLDivElement>, ref: React.RefObject<HTMLDivElement>) => void;
  onVolumeChange: (v: number) => void;
  onPlaybackRateChange: (r: number) => void;
  onToggleShuffle: () => void;
  onToggleRepeat: () => void;
  onDownload: () => void;
  onExpand: () => void;
  onToggleSpeedMenu: () => void;
  onVolumeEnter: () => void;
  onVolumeLeave: () => void;
  onSeekByPct: (pct: number) => void;
  onActivity: () => void;
  isCollapsed: boolean;
  showHorizon: boolean;
  formatTime: (t: number) => string;
  progressPercent: number;
  t: (key: string) => string;
}

const DesktopBar: React.FC<DesktopBarProps> = ({
  currentSong, isPlaying, currentTime, duration, volume, playbackRate,
  isShuffle, repeatMode, progressBarRef, speedMenuRef, showSpeedMenu, isHoveringVolume,
  onTogglePlay, onPrevious, onNext, onSeekInteraction, onVolumeChange, onPlaybackRateChange,
  onToggleShuffle, onToggleRepeat, onDownload, onExpand, onToggleSpeedMenu,
  onVolumeEnter, onVolumeLeave, onSeekByPct, onActivity, isCollapsed, showHorizon, formatTime, progressPercent, t,
}) => (
  <div
    className="h-[68px] lg:h-[76px] relative overflow-visible z-50 transition-transform duration-500 ease-in-out"
    style={{ transform: isCollapsed ? 'translateY(calc(100% - 28px))' : 'translateY(0)' }}
    onMouseEnter={onActivity}
  >
    {/* Waveform at z-0 — straddles the top border, always behind everything */}
    <WaveformProgress
      progressPercent={progressPercent}
      seed={currentSong.id || currentSong.title || 'track'}
      showHorizon={showHorizon}
      progressBarRef={progressBarRef}
      onSeekInteraction={onSeekInteraction}
    />
    {/* Background panel at z-[1] — covers lower half of waveform when expanded, invisible when collapsed */}
    <div
      className="absolute inset-0 z-[1] bg-white dark:bg-black/95 backdrop-blur border-t border-zinc-200 dark:border-white/10 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.1)] dark:shadow-none transition-opacity duration-500 pointer-events-none"
      style={{ opacity: isCollapsed ? 0 : 1 }}
    />
    <PlayheadHandle
      progressPercent={progressPercent}
      progressBarRef={progressBarRef}
      onSeekByPct={onSeekByPct}
    />
    <div className="absolute inset-0 z-10 flex items-center justify-between px-2 sm:px-4 lg:px-6 gap-2 sm:gap-4">
      <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1 max-w-[30%] lg:max-w-[33%]">
        <div className={`w-9 h-9 lg:w-10 lg:h-10 rounded bg-zinc-200 dark:bg-zinc-800 overflow-hidden shadow-sm flex-shrink-0 transition-opacity duration-300 ${isCollapsed ? 'opacity-0 pointer-events-none' : ''}`}>
          {currentSong.cover_url
            ? <img src={currentSong.cover_url} className="w-full h-full object-cover" alt="cover" onError={e => { e.currentTarget.style.display = 'none'; }} />
            : <AlbumCover seed={currentSong.id || currentSong.title} size="full" className="w-full h-full" />}
        </div>
        <div className="overflow-hidden min-w-0">
          <h4 className="text-xs sm:text-sm font-bold text-zinc-900 dark:text-white truncate">{currentSong.title}</h4>
        </div>
      </div>
      <div className="flex flex-col items-center justify-center flex-shrink-0">
        <div className="flex items-center gap-2 sm:gap-4 lg:gap-6">
          <button onClick={onToggleShuffle} className={`transition-colors hidden sm:block ${isShuffle ? 'text-pink-600 dark:text-pink-500' : 'text-zinc-400 hover:text-zinc-900 dark:hover:text-white'}`}>
            <Shuffle size={16} />
          </button>
          <button onClick={onPrevious} className="text-zinc-700 dark:text-zinc-300 hover:text-black dark:hover:text-white transition-colors">
            <SkipBack size={18} className="sm:w-[22px] sm:h-[22px]" fill="currentColor" />
          </button>
          <button onClick={onTogglePlay} className={`w-9 h-9 sm:w-10 sm:h-10 rounded-full bg-zinc-900 dark:bg-white text-white dark:text-black flex items-center justify-center hover:scale-105 transition-[transform,opacity] duration-300 shadow-lg ${isCollapsed ? 'opacity-0 pointer-events-none' : ''}`}>
            {isPlaying ? <Pause size={18} className="sm:w-5 sm:h-5" fill="currentColor" /> : <Play size={18} className="sm:w-5 sm:h-5 ml-0.5" fill="currentColor" />}
          </button>
          <button onClick={onNext} className="text-zinc-700 dark:text-zinc-300 hover:text-black dark:hover:text-white transition-colors">
            <SkipForward size={18} className="sm:w-[22px] sm:h-[22px]" fill="currentColor" />
          </button>
          <button onClick={onToggleRepeat} className={`transition-colors hidden sm:block relative ${repeatMode !== 'none' ? 'text-pink-600 dark:text-pink-500' : 'text-zinc-400 hover:text-zinc-900 dark:hover:text-white'}`}>
            {repeatMode === 'one' ? <Repeat1 size={16} /> : <Repeat size={16} />}
            {repeatMode !== 'none' && <div className="absolute -bottom-1.5 left-1/2 -translate-x-1/2 w-1 h-1 bg-current rounded-full" />}
          </button>
        </div>
      </div>
      <div className="flex items-center justify-end gap-1 sm:gap-2 lg:gap-3 min-w-0 flex-1 max-w-[30%] lg:max-w-[33%] text-zinc-500 dark:text-zinc-400">
        <span className="text-[10px] sm:text-xs font-mono text-right text-zinc-600 dark:text-zinc-400 hidden md:block">
          {formatTime(currentTime)} / {formatTime(duration)}
        </span>
        <div className="relative group hidden lg:block" ref={speedMenuRef}>
          <button className="px-2 py-1 text-[11px] font-mono font-bold hover:bg-zinc-200 dark:hover:bg-white/10 rounded transition-colors min-w-[42px] text-center" onClick={onToggleSpeedMenu}>
            {playbackRate}x
          </button>
          {showSpeedMenu && (
            <div className="absolute bottom-full right-0 mb-2 bg-white dark:bg-zinc-800 rounded-lg shadow-xl border border-zinc-200 dark:border-white/10 py-1 min-w-[80px] z-50">
              {[0.25, 0.5, 0.75, 1.0, 1.25, 1.5, 1.75, 2.0].map(rate => (
                <button key={rate} onClick={() => onPlaybackRateChange(rate)} className={`w-full px-3 py-1.5 text-left text-xs font-mono hover:bg-zinc-100 dark:hover:bg-white/10 transition-colors ${playbackRate === rate ? 'text-pink-600 dark:text-pink-500 font-bold' : 'text-zinc-700 dark:text-zinc-300'}`}>
                  {rate === 1.0 ? t('normalSpeed') : `${rate}x`}
                </button>
              ))}
            </div>
          )}
        </div>
        <div
          className="relative group hidden md:block"
          onMouseEnter={onVolumeEnter}
          onMouseLeave={onVolumeLeave}
        >
          <button onClick={() => onVolumeChange(volume === 0 ? 0.8 : 0)} className="p-1.5 lg:p-2 hover:bg-zinc-100 dark:hover:bg-white/10 rounded-full transition-colors">
            {volume === 0 ? <VolumeX size={18} /> : <Volume2 size={18} />}
          </button>
          {isHoveringVolume && (
            <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 pb-2">
              <div className="bg-white dark:bg-zinc-800 rounded-lg shadow-xl border border-zinc-200 dark:border-white/10 p-2">
                <div className="relative h-24 w-8 flex items-center justify-center">
                  <input
                    type="range" min="0" max="1" step="0.01" value={volume}
                    onChange={e => onVolumeChange(parseFloat(e.target.value))}
                    className="w-24 h-8 -rotate-90 origin-center appearance-none bg-transparent cursor-pointer"
                    style={{ WebkitAppearance: 'none', background: `linear-gradient(to right, rgb(236 72 153) 0%, rgb(236 72 153) ${volume * 100}%, rgb(228 228 231) ${volume * 100}%, rgb(228 228 231) 100%)` }}
                  />
                </div>
                <div className="text-[10px] text-center font-mono text-zinc-600 dark:text-zinc-400 mt-1">{Math.round(volume * 100)}%</div>
              </div>
            </div>
          )}
        </div>
        <button onClick={onDownload} className="p-1.5 lg:p-2 hover:bg-zinc-100 dark:hover:bg-white/10 rounded-full transition-colors hidden lg:block" title={t('downloadAudio')}>
          <Download size={18} />
        </button>
        <button onClick={onExpand} className="p-1.5 lg:p-2 hover:bg-zinc-100 dark:hover:bg-white/10 rounded-full transition-colors">
          <Maximize2 size={16} />
        </button>
      </div>
    </div>
  </div>
);
