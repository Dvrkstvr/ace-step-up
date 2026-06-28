import { useRef, useState, useCallback, useEffect } from 'react';
import { StudioLayer } from '../types';

export interface StudioAudioEngine {
  isPlaying: boolean;
  playheadTime: number;
  totalDuration: number;
  play: () => void;
  pause: () => void;
  stop: () => void;
  seek: (seconds: number) => void;
  loadLayers: (layers: StudioLayer[]) => Promise<void>;
}

interface LayerBuffer {
  layerId: string;
  cacheKey: string;
  buffer: AudioBuffer;
}

interface ActiveSource {
  source: AudioBufferSourceNode;
  gain: GainNode;
  layerId: string;
}

export function useStudioAudio(): StudioAudioEngine {
  const [isPlaying, setIsPlaying] = useState(false);
  const [playheadTime, setPlayheadTime] = useState(0);
  const [totalDuration, setTotalDuration] = useState(0);

  // AudioContext — created lazily on first play / loadLayers call
  const audioCtxRef = useRef<AudioContext | null>(null);

  // Decoded buffers cache: key = layerId + '\0' + audio_url
  const buffersRef = useRef<Map<string, LayerBuffer>>(new Map());

  // Current layers (kept in ref so callbacks stay stable)
  const layersRef = useRef<StudioLayer[]>([]);

  // Playback state
  const activeSourcesRef = useRef<ActiveSource[]>([]);
  const startedAtRef = useRef<number>(0);   // audioCtx.currentTime when play() was called
  const seekOffsetRef = useRef<number>(0);  // timeline position at the time of last play/seek
  const isPlayingRef = useRef<boolean>(false);

  // RAF handle
  const rafRef = useRef<number | null>(null);

  // ── Helpers ──────────────────────────────────────────────────────────────

  function getOrCreateContext(): AudioContext {
    if (!audioCtxRef.current || audioCtxRef.current.state === 'closed') {
      audioCtxRef.current = new AudioContext();
    }
    return audioCtxRef.current;
  }

  function stopAllSources() {
    for (const { source } of activeSourcesRef.current) {
      try { source.stop(); } catch (_) { /* already stopped */ }
      source.disconnect();
    }
    activeSourcesRef.current = [];
  }

  function cancelRaf() {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
  }

  function startRafLoop(ctx: AudioContext) {
    const tick = () => {
      const elapsed = ctx.currentTime - startedAtRef.current;
      setPlayheadTime(seekOffsetRef.current + elapsed);
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
  }

  function computeTotalDuration(layers: StudioLayer[], buffers: Map<string, LayerBuffer>): number {
    let max = 0;
    for (const layer of layers) {
      if (!layer.audio_url) continue;
      const key = layer.id + '\0' + layer.audio_url;
      const entry = buffers.get(key);
      if (!entry) continue;
      const clipStart = layer.clip_start ?? 0;
      const clipEnd = layer.clip_end ?? entry.buffer.duration;
      const effectiveDuration = Math.max(0, clipEnd - clipStart);
      const end = layer.start_offset + effectiveDuration;
      if (end > max) max = end;
    }
    return max;
  }

  // ── loadLayers ───────────────────────────────────────────────────────────

  const loadLayers = useCallback(async (layers: StudioLayer[]): Promise<void> => {
    layersRef.current = layers;

    const ctx = getOrCreateContext();
    const existing = buffersRef.current;
    const next = new Map<string, LayerBuffer>();

    await Promise.all(
      layers.map(async (layer) => {
        if (!layer.audio_url) return;

        const key = layer.id + '\0' + layer.audio_url;

        // Re-use cached buffer if url unchanged
        if (existing.has(key)) {
          next.set(key, existing.get(key)!);
          return;
        }

        try {
          const response = await fetch(layer.audio_url);
          if (!response.ok) throw new Error(`HTTP ${response.status}`);
          const arrayBuffer = await response.arrayBuffer();
          const audioBuffer = await ctx.decodeAudioData(arrayBuffer);
          next.set(key, { layerId: layer.id, cacheKey: key, buffer: audioBuffer });
        } catch (err) {
          console.warn(
            `[useStudioAudio] Failed to load layer "${layer.name}" (${layer.audio_url}):`,
            err
          );
        }
      })
    );

    buffersRef.current = next;
    setTotalDuration(computeTotalDuration(layers, next));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── createAndStartSources ────────────────────────────────────────────────

  function createAndStartSources(ctx: AudioContext, fromTimeline: number) {
    stopAllSources();

    const layers = layersRef.current;
    const buffers = buffersRef.current;

    const anySolo = layers.some((l) => l.is_solo);
    const newSources: ActiveSource[] = [];

    for (const layer of layers) {
      if (!layer.audio_url) continue;

      const key = layer.id + '\0' + layer.audio_url;
      const entry = buffers.get(key);
      if (!entry) continue;

      const buffer = entry.buffer;
      const clipStart = layer.clip_start ?? 0;
      const clipEnd = layer.clip_end ?? buffer.duration;
      const effectiveDuration = Math.max(0, clipEnd - clipStart);

      // Skip if clip ends before the current seek position
      const clipEndOnTimeline = layer.start_offset + effectiveDuration;
      if (clipEndOnTimeline <= fromTimeline) continue;

      // How far into this clip we already are (seek past the clip's start)
      const clipPlaybackOffset = Math.max(0, fromTimeline - layer.start_offset);
      // Delay before the clip should start (if seek is before the clip's start on the timeline)
      const scheduleDelay = Math.max(0, layer.start_offset - fromTimeline);
      // Remaining playback duration
      const remainingDuration = effectiveDuration - clipPlaybackOffset;
      if (remainingDuration <= 0) continue;

      // GainNode
      const gain = ctx.createGain();
      const shouldPlay = anySolo ? layer.is_solo : !layer.is_muted;
      gain.gain.value = shouldPlay ? layer.volume : 0;
      gain.connect(ctx.destination);

      // SourceNode
      const source = ctx.createBufferSource();
      source.buffer = buffer;
      source.connect(gain);

      source.start(
        ctx.currentTime + scheduleDelay,
        clipStart + clipPlaybackOffset,
        remainingDuration
      );

      newSources.push({ source, gain, layerId: layer.id });
    }

    activeSourcesRef.current = newSources;
  }

  // ── Transport ─────────────────────────────────────────────────────────────

  const play = useCallback(() => {
    const ctx = getOrCreateContext();
    if (ctx.state === 'suspended') {
      ctx.resume();
    }

    const from = seekOffsetRef.current;
    startedAtRef.current = ctx.currentTime;

    createAndStartSources(ctx, from);

    isPlayingRef.current = true;
    setIsPlaying(true);
    startRafLoop(ctx);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const pause = useCallback(() => {
    cancelRaf();

    const ctx = audioCtxRef.current;
    if (ctx && ctx.state !== 'closed') {
      // Snapshot current timeline position before suspending
      seekOffsetRef.current = seekOffsetRef.current + (ctx.currentTime - startedAtRef.current);
      ctx.suspend();
    }

    stopAllSources();
    isPlayingRef.current = false;
    setIsPlaying(false);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const stop = useCallback(() => {
    cancelRaf();

    const ctx = audioCtxRef.current;
    if (ctx && ctx.state !== 'closed') {
      ctx.suspend();
    }

    stopAllSources();
    seekOffsetRef.current = 0;
    isPlayingRef.current = false;
    setIsPlaying(false);
    setPlayheadTime(0);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const seek = useCallback((seconds: number) => {
    const wasPlaying = isPlayingRef.current;

    cancelRaf();
    stopAllSources();

    seekOffsetRef.current = Math.max(0, seconds);
    setPlayheadTime(seekOffsetRef.current);

    if (wasPlaying) {
      const ctx = getOrCreateContext();
      if (ctx.state === 'suspended') ctx.resume();
      startedAtRef.current = ctx.currentTime;
      createAndStartSources(ctx, seekOffsetRef.current);
      startRafLoop(ctx);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Reactive gain updates when layers change while playing ───────────────
  // Runs after every render so volume/mute/solo changes are applied live.

  useEffect(() => {
    if (!isPlayingRef.current) return;

    const layers = layersRef.current;
    const anySolo = layers.some((l) => l.is_solo);

    for (const { gain, layerId } of activeSourcesRef.current) {
      const layer = layers.find((l) => l.id === layerId);
      if (!layer) {
        gain.gain.value = 0;
        continue;
      }
      const shouldPlay = anySolo ? layer.is_solo : !layer.is_muted;
      gain.gain.value = shouldPlay ? layer.volume : 0;
    }
  });

  // ── Cleanup ───────────────────────────────────────────────────────────────

  useEffect(() => {
    return () => {
      cancelRaf();
      stopAllSources();
      if (audioCtxRef.current && audioCtxRef.current.state !== 'closed') {
        audioCtxRef.current.close();
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return {
    isPlaying,
    playheadTime,
    totalDuration,
    play,
    pause,
    stop,
    seek,
    loadLayers,
  };
}
