import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  X, Music, ChevronDown, Upload, Loader2, Sparkles, Wand2, Shuffle,
  Brain, Mic, Info,
} from 'lucide-react';
import type { Track } from '../types';
import { generateApi, tracksApi } from '../services/api';

// ─── Types ────────────────────────────────────────────────────────────────────

type LyricsMode = 'custom' | 'prompt' | 'instrumental';
type TaskType = 'text2music' | 'audio2audio' | 'cover';

// ─── Caption Dimension Chips ──────────────────────────────────────────────────

const DIMENSIONS: { label: string; pool: string[] }[] = [
  {
    label: 'Style / Genre',
    pool: [
      'pop', 'rock', 'jazz', 'electronic', 'hip-hop', 'R&B', 'folk', 'classical',
      'lo-fi', 'synthwave', 'ambient', 'funk', 'reggae', 'metal', 'indie', 'country',
      'blues', 'soul', 'bossa nova', 'drum and bass', 'house', 'techno', 'dubstep',
      'trap', 'cinematic', 'new wave', 'post-punk', 'neo-soul', 'afrobeat', 'gospel',
    ],
  },
  {
    label: 'Emotion / Atmosphere',
    pool: [
      'melancholic', 'uplifting', 'energetic', 'dreamy', 'dark', 'nostalgic',
      'euphoric', 'intimate', 'haunting', 'peaceful', 'tense', 'playful', 'romantic',
      'aggressive', 'mysterious', 'hopeful', 'bittersweet', 'surreal', 'lonely',
      'triumphant', 'brooding', 'whimsical', 'hypnotic', 'ethereal', 'cinematic',
    ],
  },
  {
    label: 'Instruments',
    pool: [
      'acoustic guitar', 'piano', 'synth pads', '808 drums', 'strings', 'brass',
      'electric bass', 'drum kit', 'electric guitar', 'violin', 'cello', 'flute',
      'saxophone', 'trumpet', 'banjo', 'ukulele', 'Rhodes', 'Wurlitzer', 'organ',
      'marimba', 'harp', 'choir', 'synthesizer', 'upright bass', 'hand percussion',
      'tabla', 'xylophone', 'mandolin', 'pedal steel', 'theremin',
    ],
  },
  {
    label: 'Timbre / Texture',
    pool: [
      'warm', 'bright', 'crisp', 'muddy', 'airy', 'punchy', 'lush', 'raw',
      'polished', 'gritty', 'silky', 'thick', 'sparkly', 'heavy', 'delicate',
      'fuzzy', 'saturated', 'clean', 'vintage', 'glassy', 'cavernous',
      'resonant', 'hollow', 'metallic', 'velvety', 'tape-saturated',
    ],
  },
  {
    label: 'Era Reference',
    pool: [
      '80s synth-pop', '90s grunge', '2010s EDM', 'vintage soul', 'modern trap',
      '70s funk', '60s Motown', '50s rock and roll', '90s R&B', '2000s pop punk',
      'classic jazz era', 'baroque', 'future bass', '70s prog rock', '80s new wave',
      '90s trip-hop', 'late 2000s indie', 'golden age hip-hop', 'disco era',
    ],
  },
  {
    label: 'Production Style',
    pool: [
      'lo-fi', 'high-fidelity', 'live recording', 'studio-polished', 'bedroom pop',
      'analog warmth', 'heavily compressed', 'sparse arrangement', 'dense layering',
      'reverb-heavy', 'dry and close', 'cinematic mix', 'tape saturation',
      'minimalist', 'maximalist', 'organic', 'synthetic', 'sample-based', 'orchestral',
    ],
  },
  {
    label: 'Vocal Characteristics',
    pool: [
      'female vocal', 'male vocal', 'breathy', 'powerful', 'falsetto', 'raspy',
      'choir', 'harmonized', 'spoken word', 'whispery', 'soulful', 'operatic',
      'autotuned', 'no vocals', 'deep baritone', 'high tenor', 'conversational',
      'melodic rap', 'melismatic', 'vibrato-heavy', 'deadpan',
    ],
  },
  {
    label: 'Speed / Rhythm',
    pool: [
      'slow tempo', 'mid-tempo', 'fast-paced', 'groovy', 'driving', 'laid-back',
      'frenetic', 'hypnotic', 'syncopated', 'straight beat', 'swung', 'rubato',
      'waltz time', 'half-time feel', 'double-time feel', 'polyrhythmic', 'floating',
    ],
  },
  {
    label: 'Structure Hints',
    pool: [
      'building intro', 'catchy chorus', 'dramatic bridge', 'fade-out ending',
      'crescendo', 'outro breakdown', 'instrumental interlude', 'call and response',
      'looping motif', 'evolving texture', 'sudden drop', 'key change',
      'slow burn', 'explosive finish', 'stripped-down verse', 'layered outro',
    ],
  },
];

function sample<T>(arr: T[], n: number): T[] {
  return [...arr].sort(() => Math.random() - 0.5).slice(0, Math.min(n, arr.length));
}

// ─── Lyrics Structure Tags ────────────────────────────────────────────────────

const STRUCTURE_TAGS = [
  { label: 'Intro', tag: '[Intro]' },
  { label: 'Verse', tag: '[Verse]' },
  { label: 'Pre-Chorus', tag: '[Pre-Chorus]' },
  { label: 'Chorus', tag: '[Chorus]' },
  { label: 'Bridge', tag: '[Bridge]' },
  { label: 'Outro', tag: '[Outro]' },
  { label: 'Build', tag: '[Build]' },
  { label: 'Drop', tag: '[Drop]' },
  { label: 'Breakdown', tag: '[Breakdown]' },
  { label: 'Guitar Solo', tag: '[Guitar Solo]' },
  { label: 'Piano Interlude', tag: '[Piano Interlude]' },
  { label: 'Fade Out', tag: '[Fade Out]' },
];

const VOCAL_TAGS = [
  { label: 'raspy', tag: '[raspy vocal]' },
  { label: 'whispered', tag: '[whispered]' },
  { label: 'falsetto', tag: '[falsetto]' },
  { label: 'powerful', tag: '[powerful belting]' },
  { label: 'spoken', tag: '[spoken word]' },
  { label: 'harmonies', tag: '[harmonies]' },
  { label: 'ad-lib', tag: '[ad-lib]' },
];

const ENERGY_TAGS = [
  { label: 'high energy', tag: '[high energy]' },
  { label: 'low energy', tag: '[low energy]' },
  { label: 'building', tag: '[building energy]' },
  { label: 'explosive', tag: '[explosive]' },
  { label: 'melancholic', tag: '[melancholic]' },
  { label: 'euphoric', tag: '[euphoric]' },
  { label: 'dreamy', tag: '[dreamy]' },
];

// ─── DiT Models ───────────────────────────────────────────────────────────────

const DIT_MODELS = [
  { value: 'acestep-v15-turbo', label: 'Turbo', description: 'Best balance — fast, 8 steps. Recommended.' },
  { value: 'acestep-v15-turbo-shift1', label: 'Turbo Shift-1', description: 'Richer details, weaker semantics.' },
  { value: 'acestep-v15-turbo-shift3', label: 'Turbo Shift-3', description: 'Clearer timbre, minimal orchestration.' },
  { value: 'acestep-v15-sft', label: 'SFT', description: '50 steps, CFG support, richer details.' },
  { value: 'acestep-v15-base', label: 'Base', description: 'All tasks (extract, lego, complete). Best for fine-tuning.' },
];

const KEY_SIGS = [
  'C major', 'C minor', 'C# major', 'C# minor', 'Db major', 'Db minor',
  'D major', 'D minor', 'D# major', 'D# minor', 'Eb major', 'Eb minor',
  'E major', 'E minor', 'F major', 'F minor', 'F# major', 'F# minor',
  'Gb major', 'Gb minor', 'G major', 'G minor', 'G# major', 'G# minor',
  'Ab major', 'Ab minor', 'A major', 'A minor', 'A# major', 'A# minor',
  'Bb major', 'Bb minor', 'B major', 'B minor',
];

const VOCAL_LANGUAGES = [
  { value: 'en', label: 'English' },
  { value: 'zh', label: 'Chinese' },
  { value: 'ja', label: 'Japanese' },
  { value: 'ko', label: 'Korean' },
  { value: 'fr', label: 'French' },
  { value: 'de', label: 'German' },
  { value: 'es', label: 'Spanish' },
  { value: 'pt', label: 'Portuguese' },
  { value: 'it', label: 'Italian' },
  { value: 'unknown', label: 'Auto-detect' },
];
const VOCAL_GENDERS = [
  { value: '', label: 'Any' },
  { value: 'female', label: 'Female' },
  { value: 'male', label: 'Male' },
];

// ─── Sub-components ───────────────────────────────────────────────────────────

interface DimensionRowProps {
  label: string;
  visible: string[];
  onShuffle: () => void;
  onChipClick: (chip: string) => void;
  disabled: boolean;
}

function DimensionRow({ label, visible, onShuffle, onChipClick, disabled }: DimensionRowProps) {
  return (
    <div className="p-2.5 bg-white dark:bg-white/5 rounded-xl border border-zinc-200 dark:border-white/10 space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-[9px] font-bold uppercase tracking-widest text-zinc-400 dark:text-zinc-500 leading-none">{label}</span>
        <button
          type="button"
          onClick={onShuffle}
          disabled={disabled}
          className="p-0.5 rounded text-zinc-300 dark:text-zinc-600 hover:text-zinc-600 dark:hover:text-zinc-300 transition-colors disabled:opacity-30"
        >
          <Shuffle size={10} />
        </button>
      </div>
      <div className="flex flex-wrap gap-1">
        {visible.map(chip => (
          <button
            key={chip}
            type="button"
            onClick={() => onChipClick(chip)}
            disabled={disabled}
            className="px-2 py-0.5 text-[11px] rounded-full border border-zinc-200 dark:border-white/10 text-zinc-600 dark:text-zinc-300 bg-zinc-50 dark:bg-black/20 hover:border-pink-400 dark:hover:border-pink-500 hover:text-pink-600 dark:hover:text-pink-400 hover:bg-pink-50 dark:hover:bg-pink-500/10 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {chip}
          </button>
        ))}
      </div>
    </div>
  );
}

interface TagButtonProps {
  label: string;
  onClick: () => void;
  disabled: boolean;
}

function TagButton({ label, onClick, disabled }: TagButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="px-2 py-0.5 text-[11px] font-mono rounded border border-zinc-200 dark:border-white/10 text-zinc-500 dark:text-zinc-400 bg-zinc-50 dark:bg-black/20 hover:border-purple-400 dark:hover:border-purple-500 hover:text-purple-600 dark:hover:text-purple-400 hover:bg-purple-50 dark:hover:bg-purple-500/10 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
    >
      {label}
    </button>
  );
}

// ─── Main Modal ───────────────────────────────────────────────────────────────

interface NewTrackModalProps {
  isOpen: boolean;
  onClose: () => void;
  workspaceId: string;
  projectId?: string;
  onTrackCreated?: (track: Track) => void;
}

const CHIPS_PER_ROW = 4;

function initVisibleChips(): string[][] {
  return DIMENSIONS.map(d => sample(d.pool, CHIPS_PER_ROW));
}

export default function NewTrackModal({
  isOpen,
  onClose,
  workspaceId,
  projectId,
  onTrackCreated,
}: NewTrackModalProps) {
  // ── Task ──
  const [taskType, setTaskType] = useState<TaskType>('text2music');

  // ── Caption ──
  const [caption, setCaption] = useState('');
  const [visibleChips, setVisibleChips] = useState<string[][]>(initVisibleChips);
  const [showChips, setShowChips] = useState(false);

  // ── Lyrics ──
  const [lyricsMode, setLyricsMode] = useState<LyricsMode>('custom');
  const [lyrics, setLyrics] = useState('');
  const [trackTitle, setTrackTitle] = useState('');
  const [isGeneratingTitle, setIsGeneratingTitle] = useState(false);
  const [lyricsPrompt, setLyricsPrompt] = useState('');
  const [refinedPromptLyrics, setRefinedPromptLyrics] = useState('');
  const [isRefiningPrompt, setIsRefiningPrompt] = useState(false);
  const [isRefining, setIsRefining] = useState(false);
  const lyricsRef = useRef<HTMLTextAreaElement>(null);

  // ── Metadata ──
  const [duration, setDuration] = useState(30);
  const [durationLocked, setDurationLocked] = useState(false);
  const [bpm, setBpm] = useState(0);
  const [keyScale, setKeyScale] = useState('');
  const [timeSignature, setTimeSignature] = useState('4/4');
  const [vocalLanguage, setVocalLanguage] = useState('en');
  const [vocalGender, setVocalGender] = useState<'' | 'female' | 'male'>('');

  // ── Audio ──
  const [sourceAudioFile, setSourceAudioFile] = useState<File | null>(null);
  const [sourceAudioUrl, setSourceAudioUrl] = useState('');
  const [isUploadingAudio, setIsUploadingAudio] = useState(false);

  // ── Model ──
  const [thinking, setThinking] = useState(true);
  const [ditModel, setDitModel] = useState('acestep-v15-turbo');

  // ── Advanced ──
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [inferenceSteps, setInferenceSteps] = useState(8);
  const [guidanceScale, setGuidanceScale] = useState(7.0);
  const [lmTemperature, setLmTemperature] = useState(0.85);
  const [shift, setShift] = useState(3.0);
  const [batchSize, setBatchSize] = useState(1);

  // ── Generation state ──
  const [isGenerating, setIsGenerating] = useState(false);
  const [progress, setProgress] = useState(0);
  const [stage, setStage] = useState('');
  const [error, setError] = useState<string | null>(null);

  const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!isOpen) { stopPolling(); resetForm(); }
  }, [isOpen]);

  const stopPolling = () => {
    if (pollIntervalRef.current) { clearInterval(pollIntervalRef.current); pollIntervalRef.current = null; }
  };

  const resetForm = () => {
    setTaskType('text2music');
    setCaption('');
    setVisibleChips(initVisibleChips());
    setShowChips(false);
    setLyricsMode('custom');
    setLyrics('');
    setLyricsPrompt('');
    setIsRefining(false);
    setDuration(30);
    setBpm(0);
    setKeyScale('');
    setTimeSignature('4/4');
    setVocalLanguage('en');
    setSourceAudioFile(null);
    setSourceAudioUrl('');
    setIsUploadingAudio(false);
    setThinking(true);
    setDitModel('acestep-v15-turbo');
    setShowAdvanced(false);
    setInferenceSteps(8);
    setGuidanceScale(7.0);
    setLmTemperature(0.85);
    setShift(3.0);
    setBatchSize(1);
    setIsGenerating(false);
    setProgress(0);
    setStage('');
    setError(null);
  };

  // Caption chip insertion
  const handleChipClick = useCallback((chip: string) => {
    setCaption(prev => {
      const t = prev.trim();
      if (!t) return chip;
      if (t.endsWith(',')) return t + ' ' + chip;
      return t + ', ' + chip;
    });
  }, []);

  const handleShuffle = useCallback((i: number) => {
    setVisibleChips(prev => {
      const next = [...prev];
      next[i] = sample(DIMENSIONS[i].pool, CHIPS_PER_ROW);
      return next;
    });
  }, []);

  // Lyrics tag insertion at cursor
  const insertLyricsTag = useCallback((tag: string) => {
    const el = lyricsRef.current;
    if (!el) { setLyrics(prev => prev + (prev.endsWith('\n') || !prev ? '' : '\n') + tag + '\n'); return; }
    const start = el.selectionStart;
    const before = lyrics.substring(0, start);
    const after = lyrics.substring(el.selectionEnd);
    const prefix = before.length > 0 && !before.endsWith('\n') ? '\n' : '';
    const insertion = prefix + tag + '\n';
    const next = before + insertion + after;
    setLyrics(next);
    const pos = start + insertion.length;
    requestAnimationFrame(() => { el.focus(); el.setSelectionRange(pos, pos); });
  }, [lyrics]);

  const handleLyricsModeChange = (mode: LyricsMode) => {
    setLyricsMode(mode);
    if (mode === 'instrumental') setLyrics('');
  };

  const captionWithGender = (base: string) => {
    if (!vocalGender) return base;
    const tag = vocalGender === 'female' ? 'female vocals' : 'male vocals';
    if (base.toLowerCase().includes('female vocal') || base.toLowerCase().includes('male vocal')) return base;
    return base ? `${base}, ${tag}` : tag;
  };

  const applyFormatResponse = (result: Awaited<ReturnType<typeof generateApi.formatInput>>, opts?: { setLyricsTo?: (v: string) => void }) => {
    if (result.caption) setCaption(result.caption);
    if (result.bpm) setBpm(result.bpm);
    if (result.duration && !durationLocked) setDuration(result.duration);
    if (result.key_scale) setKeyScale(result.key_scale);
    if (result.time_signature) setTimeSignature(result.time_signature);
    if (result.vocal_language) setVocalLanguage(result.vocal_language);
    if (result.lyrics && opts?.setLyricsTo) opts.setLyricsTo(result.lyrics);
  };

  const handleRefineLyrics = async () => {
    if (isRefining || !lyrics.trim()) return;
    setIsRefining(true);
    setError(null);
    try {
      const hasStructure = /\[[\w\s]+\]/.test(lyrics);
      const lyricsToSend = hasStructure ? lyrics : `[Verse]\n${lyrics.trim()}`;
      const refineCaption = captionWithGender(
        `Preserve the original lyrics exactly, only add or fix section structure tags. Style: ${caption || 'music'}`
      );
      const result = await generateApi.formatInput({
        caption: refineCaption,
        lyrics: lyricsToSend,
        bpm: bpm || undefined,
        duration,
        keyScale: keyScale || undefined,
        timeSignature: timeSignature || undefined,
        vocalLanguage: lyricsMode !== 'instrumental' ? vocalLanguage || undefined : undefined,
      });
      applyFormatResponse(result, { setLyricsTo: setLyrics });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to refine lyrics');
    } finally {
      setIsRefining(false);
    }
  };

  const handleRefinePrompt = async () => {
    if (isRefiningPrompt || !lyricsPrompt.trim()) return;
    setIsRefiningPrompt(true);
    setError(null);
    try {
      const enrichedCaption = captionWithGender([caption, lyricsPrompt].filter(Boolean).join('. '));
      const lyricsSkeleton = '[Verse]\n\n[Chorus]\n\n[Verse]\n\n[Chorus]\n\n[Bridge]\n\n[Chorus]';
      const result = await generateApi.formatInput({
        caption: enrichedCaption,
        lyrics: lyricsSkeleton,
        bpm: bpm || undefined,
        duration,
        keyScale: keyScale || undefined,
        timeSignature: timeSignature || undefined,
        vocalLanguage: vocalLanguage || undefined,
        temperature: 0.9,
      });
      applyFormatResponse(result, { setLyricsTo: setRefinedPromptLyrics });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to refine prompt');
    } finally {
      setIsRefiningPrompt(false);
    }
  };

  const handleGenerateTitle = async () => {
    if (isGeneratingTitle) return;
    const srcLyrics = lyricsMode === 'custom' ? lyrics : (refinedPromptLyrics || lyricsPrompt);
    if (!caption.trim() && !srcLyrics.trim()) return;
    setIsGeneratingTitle(true);
    setError(null);
    try {
      const result = await generateApi.generateTitle({
        caption: caption || undefined,
        lyrics: srcLyrics || undefined,
      });
      if (result.title) setTrackTitle(result.title);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate title');
    } finally {
      setIsGeneratingTitle(false);
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setSourceAudioFile(file);
    setIsUploadingAudio(true);
    setError(null);
    try {
      const result = await generateApi.uploadAudio(file);
      setSourceAudioUrl(result.url);
    } catch {
      setError('Failed to upload audio file.');
      setSourceAudioFile(null);
    } finally {
      setIsUploadingAudio(false);
    }
    e.target.value = '';
  };

  const handleGenerate = async () => {
    if (isGenerating) return;
    setError(null);
    setIsGenerating(true);
    setProgress(0);
    setStage('Starting...');

    const isInstrumental = lyricsMode === 'instrumental';
    let finalLyrics = lyricsMode === 'custom' ? lyrics : '';

    try {
      // Prompt mode: use already-refined lyrics if available, otherwise call format_input
      if (lyricsMode === 'prompt' && lyricsPrompt.trim()) {
        if (refinedPromptLyrics) {
          finalLyrics = refinedPromptLyrics;
        } else {
          setStage('Generating lyrics from prompt...');
          try {
            const enrichedCaption = captionWithGender([caption, lyricsPrompt].filter(Boolean).join('. '));
            const lyricsSkeleton = '[Verse]\n\n[Chorus]\n\n[Verse]\n\n[Chorus]\n\n[Bridge]\n\n[Chorus]';
            const formatted = await generateApi.formatInput({
              caption: enrichedCaption,
              lyrics: lyricsSkeleton,
              bpm: bpm || undefined,
              duration,
              keyScale: keyScale || undefined,
              timeSignature: timeSignature || undefined,
              vocalLanguage: vocalLanguage || undefined,
              temperature: 0.9,
            });
            finalLyrics = formatted.lyrics || '';
          } catch {
            finalLyrics = lyricsPrompt;
          }
        }
      }

      const effectiveCaption = captionWithGender(caption);
      const effectiveVocalLanguage = vocalLanguage === 'unknown' ? undefined : vocalLanguage;
      const job = await generateApi.startGeneration({
        customMode: true,
        prompt: effectiveCaption,
        lyrics: finalLyrics,
        style: effectiveCaption,
        title: '',
        instrumental: isInstrumental,
        vocalLanguage: effectiveVocalLanguage,
        bpm,
        keyScale,
        timeSignature,
        duration,
        inferenceSteps,
        guidanceScale,
        batchSize,
        randomSeed: true,
        seed: -1,
        thinking: thinking || lyricsMode === 'prompt',
        audioFormat: 'mp3',
        inferMethod: 'ode',
        shift,
        lmTemperature,
        lmCfgScale: 2.0,
        lmTopK: 0,
        lmTopP: 0.9,
        lmNegativePrompt: '',
        ditModel,
        taskType,
        ...(sourceAudioUrl && taskType !== 'text2music' ? { sourceAudioUrl } : {}),
      });

      const jobId = job.jobId || job.id;
      if (!jobId) throw new Error('No job ID returned');

      pollIntervalRef.current = setInterval(async () => {
        try {
          const status = await generateApi.getStatus(jobId);
          setProgress(status.progress ?? 0);
          setStage(status.stage ?? 'Processing...');

          if (status.status === 'succeeded') {
            stopPolling();
            const audioUrl = status.result?.audioUrls?.[0];
            const titleSource = trackTitle.trim()
              || (lyricsMode === 'custom' && lyrics
                ? lyrics.split('\n').find(l => l.trim() && !/^\[.*\]$/.test(l.trim())) || caption
                : caption);

            const track = await tracksApi.create({
              title: (titleSource || 'Generated Track').slice(0, 80),
              workspace_id: workspaceId,
              ...(projectId ? { project_id: projectId } : {}),
              audio_url: audioUrl,
              task_type: taskType,
              prompt: caption || undefined,
              lyrics: finalLyrics || undefined,
              style: caption || undefined,
              duration: status.result?.duration ?? duration,
              ...(status.result?.bpm ? { bpm: status.result.bpm } : bpm > 0 ? { bpm } : {}),
              ...(status.result?.keyScale ? { key_scale: status.result.keyScale } : keyScale ? { key_scale: keyScale } : {}),
              ...(status.result?.timeSignature ? { time_signature: status.result.timeSignature } : timeSignature ? { time_signature: timeSignature } : {}),
              tags: caption ? caption.split(',').map(s => s.trim()).filter(Boolean).slice(0, 5) : [],
            });

            onTrackCreated?.(track);
            onClose();
          } else if (status.status === 'failed') {
            stopPolling();
            setError(status.error ?? 'Generation failed');
            setIsGenerating(false);
          }
        } catch (err) {
          stopPolling();
          setError(err instanceof Error ? err.message : 'Failed to check status');
          setIsGenerating(false);
        }
      }, 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start generation');
      setIsGenerating(false);
    }
  };

  if (!isOpen) return null;

  const needsAudio = taskType !== 'text2music';
  const isSFTOrBase = ditModel === 'acestep-v15-sft' || ditModel === 'acestep-v15-base';

  return (
    <div className="fixed inset-0 bg-black/50 z-[70] flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-white dark:bg-zinc-900 rounded-2xl shadow-2xl w-full max-w-xl max-h-[92vh] flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        {/* ── Header ── */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-200 dark:border-white/5 flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-pink-500 to-purple-600 flex items-center justify-center flex-shrink-0">
              <Sparkles size={18} className="text-white" />
            </div>
            <h2 className="text-xl font-bold text-zinc-900 dark:text-white">New Track</h2>
          </div>
          <div className="flex items-center gap-3">
            {/* Thinking toggle */}
            <button
              onClick={() => setThinking(t => !t)}
              disabled={isGenerating}
              title={thinking ? 'LM thinking enabled — auto-infers metadata and enriches caption' : 'LM thinking disabled — DiT generates directly'}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all disabled:opacity-50 ${
                thinking
                  ? 'bg-purple-50 dark:bg-purple-500/15 border-purple-300 dark:border-purple-500/40 text-purple-700 dark:text-purple-300'
                  : 'bg-zinc-100 dark:bg-black/30 border-zinc-200 dark:border-white/10 text-zinc-500 dark:text-zinc-400'
              }`}
            >
              <Brain size={13} />
              {thinking ? 'Thinking ON' : 'Thinking OFF'}
            </button>
            <button
              onClick={onClose}
              disabled={isGenerating}
              className="p-2 hover:bg-zinc-100 dark:hover:bg-white/5 rounded-full transition-colors disabled:opacity-40"
            >
              <X size={20} className="text-zinc-500" />
            </button>
          </div>
        </div>

        {/* ── Scrollable body ── */}
        <div className="overflow-y-auto flex-1 p-6 space-y-5">

          {/* Track Title */}
          <div>
            <label className="text-xs font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-wide mb-2 block">
              Track Title
            </label>
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={trackTitle}
                onChange={e => setTrackTitle(e.target.value)}
                disabled={isGenerating}
                placeholder="Leave blank to auto-name, or type a title..."
                className="flex-1 bg-zinc-50 dark:bg-black/20 border border-zinc-200 dark:border-white/10 rounded-xl px-4 py-2.5 text-sm text-zinc-900 dark:text-white placeholder-zinc-400 dark:placeholder-zinc-600 focus:outline-none focus:border-pink-500 dark:focus:border-pink-500 transition-colors disabled:opacity-50"
              />
              <button
                onClick={handleGenerateTitle}
                disabled={isGenerating || isGeneratingTitle || (!caption.trim() && !lyrics.trim() && !lyricsPrompt.trim())}
                title="Generate title from caption and lyrics"
                className="flex items-center gap-1.5 px-3 py-2.5 text-xs font-semibold text-pink-600 dark:text-pink-400 hover:bg-pink-50 dark:hover:bg-pink-500/10 border border-pink-200 dark:border-pink-500/30 rounded-xl transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex-shrink-0"
              >
                {isGeneratingTitle ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
              </button>
            </div>
          </div>

          {/* Task Type */}
          <div>
            <label className="text-xs font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-wide mb-2 block">
              Task Type
            </label>
            <div className="flex items-center bg-zinc-100 dark:bg-black/40 rounded-xl p-1 gap-1">
              {([
                { value: 'text2music', label: 'Text to Music' },
                { value: 'audio2audio', label: 'Audio to Audio' },
                { value: 'cover', label: 'Cover / Reference' },
              ] as const).map(({ value, label }) => (
                <button
                  key={value}
                  onClick={() => setTaskType(value)}
                  disabled={isGenerating}
                  className={`flex-1 py-2 px-2 rounded-lg text-xs font-semibold transition-all disabled:opacity-50 ${
                    taskType === value
                      ? 'bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white shadow-sm'
                      : 'text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* Style */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-wide">
                Style
              </label>
              <button
                type="button"
                onClick={() => setShowChips(s => !s)}
                className="text-[11px] text-pink-500 dark:text-pink-400 font-semibold hover:text-pink-600 dark:hover:text-pink-300 transition-colors"
              >
                {showChips ? 'Hide suggestions' : 'Show suggestions'}
              </button>
            </div>
            <p className="text-xs text-zinc-400 dark:text-zinc-500 mb-2">
              Overall music description — style, instruments, emotion, timbre, vocal character, progression, etc. This is the most important input.
            </p>
            <textarea
              value={caption}
              onChange={e => setCaption(e.target.value)}
              disabled={isGenerating}
              placeholder="e.g. dreamy lo-fi hip hop, soft female vocals, melancholic piano, vinyl crackle, slow tempo, warm and intimate..."
              className="w-full h-20 bg-zinc-50 dark:bg-black/20 border border-zinc-200 dark:border-white/10 rounded-xl px-4 py-3 text-sm text-zinc-900 dark:text-white placeholder-zinc-400 dark:placeholder-zinc-600 focus:outline-none focus:border-pink-500 dark:focus:border-pink-500 resize-none transition-colors disabled:opacity-50"
            />
            {showChips && (
              <div className="mt-2 grid grid-cols-2 gap-2">
                {DIMENSIONS.map((dim, i) => (
                  <DimensionRow
                    key={dim.label}
                    label={dim.label}
                    visible={visibleChips[i]}
                    onShuffle={() => handleShuffle(i)}
                    onChipClick={handleChipClick}
                    disabled={isGenerating}
                  />
                ))}
              </div>
            )}
          </div>

          {/* Lyrics */}
          <div>
            <label className="text-xs font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-wide mb-2 block">
              Lyrics
            </label>
            <div className="flex items-center bg-zinc-100 dark:bg-black/40 rounded-xl p-1 gap-1 mb-3">
              {([
                { value: 'custom', label: 'Custom', icon: <Mic size={11} /> },
                { value: 'prompt', label: 'Prompt', icon: <Sparkles size={11} /> },
                { value: 'instrumental', label: 'Instrumental', icon: <Music size={11} /> },
              ] as const).map(({ value, label, icon }) => (
                <button
                  key={value}
                  onClick={() => handleLyricsModeChange(value)}
                  disabled={isGenerating}
                  className={`flex-1 flex items-center justify-center gap-1.5 py-2 px-2 rounded-lg text-xs font-semibold transition-all disabled:opacity-50 ${
                    lyricsMode === value
                      ? 'bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white shadow-sm'
                      : 'text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200'
                  }`}
                >
                  {icon}{label}
                </button>
              ))}
            </div>

            {lyricsMode === 'custom' && (
              <div className="space-y-2">
                {/* Structure tag toolbar */}
                <div className="space-y-1.5">
                  <p className="text-[11px] text-zinc-400 dark:text-zinc-500 font-medium">Structure tags</p>
                  <div className="flex flex-wrap gap-1">
                    {STRUCTURE_TAGS.map(t => (
                      <TagButton key={t.tag} label={t.label} onClick={() => insertLyricsTag(t.tag)} disabled={isGenerating} />
                    ))}
                  </div>
                  <p className="text-[11px] text-zinc-400 dark:text-zinc-500 font-medium mt-1">Vocal</p>
                  <div className="flex flex-wrap gap-1">
                    {VOCAL_TAGS.map(t => (
                      <TagButton key={t.tag} label={t.label} onClick={() => insertLyricsTag(t.tag)} disabled={isGenerating} />
                    ))}
                  </div>
                  <p className="text-[11px] text-zinc-400 dark:text-zinc-500 font-medium mt-1">Energy</p>
                  <div className="flex flex-wrap gap-1">
                    {ENERGY_TAGS.map(t => (
                      <TagButton key={t.tag} label={t.label} onClick={() => insertLyricsTag(t.tag)} disabled={isGenerating} />
                    ))}
                  </div>
                </div>
                <textarea
                  ref={lyricsRef}
                  value={lyrics}
                  onChange={e => setLyrics(e.target.value)}
                  disabled={isGenerating}
                  placeholder={"[Verse]\nYour lyrics here...\n\n[Chorus]\n..."}
                  className="w-full h-36 bg-zinc-50 dark:bg-black/20 border border-zinc-200 dark:border-white/10 rounded-xl px-4 py-3 text-sm text-zinc-900 dark:text-white placeholder-zinc-400 dark:placeholder-zinc-600 focus:outline-none focus:border-pink-500 dark:focus:border-pink-500 resize-none transition-colors disabled:opacity-50 font-mono"
                />
                <div className="flex items-center justify-between">
                  <p className="text-[11px] text-zinc-400 dark:text-zinc-500">Tip: aim for 6–10 syllables per line for best rhythm</p>
                  <button
                    onClick={handleRefineLyrics}
                    disabled={isGenerating || isRefining || !lyrics.trim()}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-purple-600 dark:text-purple-400 hover:bg-purple-50 dark:hover:bg-purple-500/10 border border-purple-200 dark:border-purple-500/30 rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    {isRefining ? <Loader2 size={12} className="animate-spin" /> : <Wand2 size={12} />}
                    {isRefining ? 'Refining...' : 'Refine Lyrics'}
                  </button>
                </div>
              </div>
            )}

            {lyricsMode === 'prompt' && (
              <div className="space-y-2">
                <p className="text-xs text-zinc-400 dark:text-zinc-500">
                  Describe what the song should be about. ACE-Step generates lyrics from this.
                </p>
                <textarea
                  value={lyricsPrompt}
                  onChange={e => { setLyricsPrompt(e.target.value); setRefinedPromptLyrics(''); }}
                  disabled={isGenerating}
                  placeholder="e.g. a song about late night drives and missing someone, nostalgic and bittersweet..."
                  className="w-full h-24 bg-zinc-50 dark:bg-black/20 border border-zinc-200 dark:border-white/10 rounded-xl px-4 py-3 text-sm text-zinc-900 dark:text-white placeholder-zinc-400 dark:placeholder-zinc-600 focus:outline-none focus:border-pink-500 dark:focus:border-pink-500 resize-none transition-colors disabled:opacity-50"
                />
                <div className="flex items-center justify-between">
                  <p className="text-[11px] text-zinc-400 dark:text-zinc-500">ACE-Step will generate structured lyrics from this description</p>
                  <button
                    onClick={handleRefinePrompt}
                    disabled={isGenerating || isRefiningPrompt || !lyricsPrompt.trim()}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-purple-600 dark:text-purple-400 hover:bg-purple-50 dark:hover:bg-purple-500/10 border border-purple-200 dark:border-purple-500/30 rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    {isRefiningPrompt ? <Loader2 size={12} className="animate-spin" /> : <Wand2 size={12} />}
                    {isRefiningPrompt ? 'Generating...' : 'Refine Prompt'}
                  </button>
                </div>
                {refinedPromptLyrics && (
                  <div className="space-y-1.5">
                    <p className="text-[11px] font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wide">Generated lyrics preview</p>
                    <pre className="w-full bg-zinc-50 dark:bg-black/30 border border-zinc-200 dark:border-white/10 rounded-xl px-4 py-3 text-xs text-zinc-700 dark:text-zinc-300 whitespace-pre-wrap font-mono leading-relaxed max-h-48 overflow-y-auto">{refinedPromptLyrics}</pre>
                  </div>
                )}
              </div>
            )}

            {lyricsMode === 'instrumental' && (
              <div className="flex items-start gap-2 p-3 bg-zinc-50 dark:bg-black/20 rounded-xl border border-zinc-200 dark:border-white/5">
                <Info size={14} className="text-zinc-400 flex-shrink-0 mt-0.5" />
                <p className="text-xs text-zinc-500 dark:text-zinc-400">
                  <span className="font-mono text-zinc-600 dark:text-zinc-300">[Instrumental]</span> will be passed as the lyrics input. No vocals will be generated.
                </p>
              </div>
            )}
          </div>

          {/* Metadata row */}
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs font-medium text-zinc-500 dark:text-zinc-400 flex items-center gap-1.5">
                  Duration
                  {durationLocked && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-pink-100 dark:bg-pink-500/15 text-pink-600 dark:text-pink-400 font-semibold">locked</span>
                  )}
                </label>
                <span className="text-xs font-semibold text-zinc-900 dark:text-white tabular-nums">
                  {duration >= 60 ? `${Math.floor(duration / 60)}m ${duration % 60 > 0 ? `${duration % 60}s` : ''}`.trim() : `${duration}s`}
                </span>
              </div>
              <input
                type="range" min={5} max={600} step={5} value={duration}
                onChange={e => { setDuration(Number(e.target.value)); setDurationLocked(true); }}
                disabled={isGenerating}
                className="w-full accent-pink-500 disabled:opacity-50"
              />
              <div className="flex justify-between text-[10px] text-zinc-400 dark:text-zinc-600 mt-0.5">
                <span>5s</span><span>2m</span><span>5m</span><span>10m</span>
              </div>
            </div>
            <div>
              <label className="text-xs font-medium text-zinc-500 dark:text-zinc-400 mb-1.5 block">
                BPM <span className="text-zinc-400 dark:text-zinc-500 font-normal">(0 = auto)</span>
              </label>
              <input
                type="number"
                value={bpm}
                onChange={e => setBpm(Math.max(0, Math.min(300, Number(e.target.value) || 0)))}
                disabled={isGenerating}
                min={0} max={300}
                className="w-full bg-zinc-50 dark:bg-black/20 border border-zinc-200 dark:border-white/10 rounded-lg px-3 py-2 text-sm text-zinc-900 dark:text-white focus:outline-none focus:border-pink-500 dark:focus:border-pink-500 transition-colors disabled:opacity-50"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-zinc-500 dark:text-zinc-400 mb-1.5 block">
                Key / Scale
              </label>
              <select
                value={keyScale}
                onChange={e => setKeyScale(e.target.value)}
                disabled={isGenerating}
                className="w-full bg-zinc-50 dark:bg-black/20 border border-zinc-200 dark:border-white/10 rounded-lg px-3 py-2 text-sm text-zinc-900 dark:text-white focus:outline-none focus:border-pink-500 dark:focus:border-pink-500 transition-colors disabled:opacity-50 [&>option]:bg-white [&>option]:dark:bg-zinc-800"
              >
                <option value="">Auto</option>
                {KEY_SIGS.map(k => <option key={k} value={k}>{k}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-zinc-500 dark:text-zinc-400 mb-1.5 block">
                Time Signature
              </label>
              <select
                value={timeSignature}
                onChange={e => setTimeSignature(e.target.value)}
                disabled={isGenerating}
                className="w-full bg-zinc-50 dark:bg-black/20 border border-zinc-200 dark:border-white/10 rounded-lg px-3 py-2 text-sm text-zinc-900 dark:text-white focus:outline-none focus:border-pink-500 dark:focus:border-pink-500 transition-colors disabled:opacity-50 [&>option]:bg-white [&>option]:dark:bg-zinc-800"
              >
                {['4/4', '3/4', '6/8', '2/4', '5/4', '7/8'].map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-zinc-500 dark:text-zinc-400 mb-1.5 block">
                Vocal Language
              </label>
              <select
                value={vocalLanguage}
                onChange={e => setVocalLanguage(e.target.value)}
                disabled={isGenerating || lyricsMode === 'instrumental'}
                className="w-full bg-zinc-50 dark:bg-black/20 border border-zinc-200 dark:border-white/10 rounded-lg px-3 py-2 text-sm text-zinc-900 dark:text-white focus:outline-none focus:border-pink-500 dark:focus:border-pink-500 transition-colors disabled:opacity-50 [&>option]:bg-white [&>option]:dark:bg-zinc-800"
              >
                {VOCAL_LANGUAGES.map(l => <option key={l.value} value={l.value}>{l.label}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-zinc-500 dark:text-zinc-400 mb-1.5 block">Vocal Gender</label>
              <div className="flex items-center bg-zinc-100 dark:bg-black/40 rounded-lg p-0.5 gap-0.5">
                {VOCAL_GENDERS.map(g => (
                  <button key={g.value} type="button"
                    onClick={() => setVocalGender(g.value as '' | 'female' | 'male')}
                    disabled={isGenerating || lyricsMode === 'instrumental'}
                    className={`flex-1 py-1.5 text-xs font-semibold rounded-md transition-all disabled:opacity-40 ${vocalGender === g.value ? 'bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white shadow-sm' : 'text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200'}`}>
                    {g.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Source audio (cover / audio2audio) */}
          {needsAudio && (
            <div>
              <label className="text-xs font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-wide mb-2 block">
                {taskType === 'cover' ? 'Cover Source Audio' : 'Source Audio'}
              </label>
              <p className="text-xs text-zinc-400 dark:text-zinc-500 mb-2">
                {taskType === 'cover'
                  ? 'Melody, rhythm, chords, and arrangement are extracted and reinterpreted with your caption.'
                  : 'Source audio for style transfer. Caption controls the target style.'}
              </p>
              <input ref={fileInputRef} type="file" accept="audio/*" onChange={handleFileChange} className="hidden" />
              {sourceAudioFile ? (
                <div className="flex items-center gap-3 p-3 bg-zinc-50 dark:bg-black/20 border border-zinc-200 dark:border-white/10 rounded-xl">
                  {isUploadingAudio
                    ? <Loader2 size={16} className="text-pink-500 animate-spin flex-shrink-0" />
                    : <Music size={16} className="text-pink-500 flex-shrink-0" />}
                  <span className="text-sm text-zinc-700 dark:text-zinc-300 truncate flex-1">{sourceAudioFile.name}</span>
                  <button
                    onClick={() => { setSourceAudioFile(null); setSourceAudioUrl(''); }}
                    disabled={isGenerating || isUploadingAudio}
                    className="text-zinc-400 hover:text-zinc-900 dark:hover:text-white transition-colors disabled:opacity-40"
                  ><X size={16} /></button>
                </div>
              ) : (
                <button
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isGenerating}
                  className="w-full flex items-center justify-center gap-2 p-4 border-2 border-dashed border-zinc-300 dark:border-white/10 rounded-xl text-zinc-500 dark:text-zinc-400 hover:border-pink-500 dark:hover:border-pink-500 hover:text-pink-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Upload size={16} />
                  <span className="text-sm font-medium">Upload audio file</span>
                </button>
              )}
            </div>
          )}

          {/* DiT Model */}
          <div>
            <label className="text-xs font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-wide mb-2 block">
              DiT Model
            </label>
            <div className="space-y-1.5">
              {DIT_MODELS.map(m => (
                <button
                  key={m.value}
                  onClick={() => {
                    setDitModel(m.value);
                    // SFT/Base default to 50 steps, Turbo to 8
                    const isSFT = m.value.includes('sft') || m.value.includes('base');
                    setInferenceSteps(isSFT ? 50 : 8);
                    setGuidanceScale(isSFT ? 7.0 : 7.0);
                  }}
                  disabled={isGenerating}
                  className={`w-full flex items-center gap-3 p-2.5 rounded-lg border text-left transition-all disabled:opacity-50 ${
                    ditModel === m.value
                      ? 'border-pink-400 dark:border-pink-500 bg-pink-50 dark:bg-pink-500/10'
                      : 'border-zinc-200 dark:border-white/10 hover:border-zinc-300 dark:hover:border-white/20 bg-zinc-50 dark:bg-black/20'
                  }`}
                >
                  <div className={`w-3 h-3 rounded-full border-2 flex-shrink-0 ${
                    ditModel === m.value ? 'border-pink-500 bg-pink-500' : 'border-zinc-300 dark:border-zinc-600'
                  }`} />
                  <div>
                    <span className="text-sm font-semibold text-zinc-900 dark:text-white">{m.label}</span>
                    <span className="text-xs text-zinc-500 dark:text-zinc-400 ml-2">{m.description}</span>
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Creativity + Style Influence sliders */}
          <div className="grid grid-cols-2 gap-x-6 gap-y-3">
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs font-medium text-zinc-500 dark:text-zinc-400">Creativity</label>
                <span className="text-xs font-semibold text-zinc-900 dark:text-white">{Math.round(lmTemperature * 100)}%</span>
              </div>
              <input type="range" min={0.1} max={1.5} step={0.05} value={lmTemperature}
                onChange={e => setLmTemperature(Number(e.target.value))}
                disabled={isGenerating}
                className="w-full accent-pink-500 disabled:opacity-50" />
              <p className="text-[11px] text-zinc-400 mt-0.5">Low = predictable. High = experimental.</p>
            </div>
            <div className={isSFTOrBase ? '' : 'opacity-40'}>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
                  Style Influence{!isSFTOrBase && <span className="opacity-60 ml-1">(SFT/Base only)</span>}
                </label>
                <span className="text-xs font-semibold text-zinc-900 dark:text-white">{guidanceScale.toFixed(1)}</span>
              </div>
              <input type="range" min={1} max={20} step={0.5} value={guidanceScale}
                onChange={e => setGuidanceScale(Number(e.target.value))}
                disabled={!isSFTOrBase || isGenerating}
                className="w-full accent-pink-500 disabled:opacity-50" />
              <p className="text-[11px] text-zinc-400 mt-0.5">How closely to follow the style prompt.</p>
            </div>
          </div>

          {/* Advanced */}
          <div>
            <button
              type="button"
              onClick={() => setShowAdvanced(!showAdvanced)}
              disabled={isGenerating}
              className="flex items-center gap-2 text-sm font-semibold text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white transition-colors disabled:opacity-50"
            >
              <ChevronDown size={16} className={`transition-transform duration-200 ${showAdvanced ? 'rotate-180' : ''}`} />
              Advanced
            </button>

            {showAdvanced && (
              <div className="mt-4 space-y-5 pl-6 border-l-2 border-zinc-200 dark:border-white/10">
                {/* Inference Steps */}
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="text-xs font-medium text-zinc-500 dark:text-zinc-400">Inference Steps</label>
                    <span className="text-xs font-semibold text-zinc-900 dark:text-white">{inferenceSteps}</span>
                  </div>
                  <input
                    type="range" min={1} max={isSFTOrBase ? 100 : 20} step={1} value={inferenceSteps}
                    onChange={e => setInferenceSteps(Number(e.target.value))}
                    disabled={isGenerating}
                    className="w-full accent-pink-500 disabled:opacity-50"
                  />
                  <p className="text-[11px] text-zinc-400 dark:text-zinc-500 mt-1">
                    {isSFTOrBase ? 'SFT/Base: 32–100 recommended' : 'Turbo: 8 is optimal, more steps add marginal quality'}
                  </p>
                </div>


                {/* Shift */}
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="text-xs font-medium text-zinc-500 dark:text-zinc-400">Shift</label>
                    <span className="text-xs font-semibold text-zinc-900 dark:text-white">{shift.toFixed(1)}</span>
                  </div>
                  <input
                    type="range" min={1} max={5} step={0.5} value={shift}
                    onChange={e => setShift(Number(e.target.value))}
                    disabled={isGenerating}
                    className="w-full accent-pink-500 disabled:opacity-50"
                  />
                  <p className="text-[11px] text-zinc-400 dark:text-zinc-500 mt-1">
                    Higher = stronger semantics/structure. Lower = richer details.
                  </p>
                </div>

                {/* Batch Size */}
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="text-xs font-medium text-zinc-500 dark:text-zinc-400">Batch Size</label>
                    <span className="text-xs font-semibold text-zinc-900 dark:text-white">{batchSize}</span>
                  </div>
                  <input
                    type="range" min={1} max={8} step={1} value={batchSize}
                    onChange={e => setBatchSize(Number(e.target.value))}
                    disabled={isGenerating}
                    className="w-full accent-pink-500 disabled:opacity-50"
                  />
                  <p className="text-[11px] text-zinc-400 dark:text-zinc-500 mt-1">
                    Generate multiple variants at once to explore the creative space.
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* Error */}
          {error && (
            <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-500/30 rounded-xl text-sm text-red-600 dark:text-red-400">
              {error}
            </div>
          )}

          {/* Progress */}
          {isGenerating && (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs text-zinc-600 dark:text-zinc-400">
                <span className="flex items-center gap-2">
                  <Loader2 size={12} className="animate-spin" />
                  {stage || 'Generating...'}
                </span>
                <span>{Math.round(progress * 100)}%</span>
              </div>
              <div className="w-full h-1.5 bg-zinc-200 dark:bg-zinc-700 rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-pink-500 to-purple-500 rounded-full transition-all duration-500"
                  style={{ width: `${Math.round(progress * 100)}%` }}
                />
              </div>
            </div>
          )}
        </div>

        {/* ── Footer ── */}
        <div className="border-t border-zinc-200 dark:border-white/5 px-6 py-4 flex justify-end gap-3 flex-shrink-0">
          <button
            onClick={onClose}
            disabled={isGenerating}
            className="px-5 py-2.5 text-sm font-semibold text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-white/5 rounded-xl transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={handleGenerate}
            disabled={isGenerating || (needsAudio && !sourceAudioUrl) || isUploadingAudio}
            className="flex items-center gap-2 px-6 py-2.5 bg-gradient-to-r from-pink-500 to-purple-600 text-white text-sm font-semibold rounded-xl hover:from-pink-600 hover:to-purple-700 transition-all shadow-lg shadow-pink-500/20 disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {isGenerating
              ? <><Loader2 size={16} className="animate-spin" />Generating...</>
              : <><Sparkles size={16} />Generate{batchSize > 1 ? ` ×${batchSize}` : ''}</>}
          </button>
        </div>
      </div>
    </div>
  );
}
