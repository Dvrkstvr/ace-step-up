import React, { useState, useRef, useCallback, useEffect } from 'react';
import {
  Plus, ChevronDown, Music, Upload, Loader2, Sparkles, Wand2, Shuffle,
  Brain, Mic, Info, X, Play, Clock, Check,
} from 'lucide-react';
import type { Track } from '../types';
import { generateApi, tracksApi } from '../services/api';

// ─── Shared constants (duplicated from NewTrackModal to keep file self-contained) ─

type LyricsMode = 'custom' | 'prompt' | 'instrumental';
type TaskType = 'text2music' | 'audio2audio' | 'cover';

const DIMENSIONS: { label: string; pool: string[] }[] = [
  { label: 'Style / Genre', pool: ['pop', 'rock', 'jazz', 'electronic', 'hip-hop', 'R&B', 'folk', 'classical', 'lo-fi', 'synthwave', 'ambient', 'funk', 'reggae', 'metal', 'indie', 'country', 'blues', 'soul', 'bossa nova', 'drum and bass', 'house', 'techno', 'dubstep', 'trap', 'cinematic', 'new wave', 'post-punk', 'neo-soul', 'afrobeat', 'gospel'] },
  { label: 'Emotion / Atmosphere', pool: ['melancholic', 'uplifting', 'energetic', 'dreamy', 'dark', 'nostalgic', 'euphoric', 'intimate', 'haunting', 'peaceful', 'tense', 'playful', 'romantic', 'aggressive', 'mysterious', 'hopeful', 'bittersweet', 'surreal', 'lonely', 'triumphant', 'brooding', 'whimsical', 'hypnotic', 'ethereal', 'cinematic'] },
  { label: 'Instruments', pool: ['acoustic guitar', 'piano', 'synth pads', '808 drums', 'strings', 'brass', 'electric bass', 'drum kit', 'electric guitar', 'violin', 'cello', 'flute', 'saxophone', 'trumpet', 'banjo', 'ukulele', 'Rhodes', 'Wurlitzer', 'organ', 'marimba', 'harp', 'choir', 'synthesizer', 'upright bass', 'hand percussion', 'tabla', 'xylophone', 'mandolin', 'pedal steel', 'theremin'] },
  { label: 'Timbre / Texture', pool: ['warm', 'bright', 'crisp', 'muddy', 'airy', 'punchy', 'lush', 'raw', 'polished', 'gritty', 'silky', 'thick', 'sparkly', 'heavy', 'delicate', 'fuzzy', 'saturated', 'clean', 'vintage', 'glassy', 'cavernous', 'resonant', 'hollow', 'metallic', 'velvety', 'tape-saturated'] },
  { label: 'Era Reference', pool: ['80s synth-pop', '90s grunge', '2010s EDM', 'vintage soul', 'modern trap', '70s funk', '60s Motown', '50s rock and roll', '90s R&B', '2000s pop punk', 'classic jazz era', 'baroque', 'future bass', '70s prog rock', '80s new wave', '90s trip-hop', 'late 2000s indie', 'golden age hip-hop', 'disco era'] },
  { label: 'Production Style', pool: ['lo-fi', 'high-fidelity', 'live recording', 'studio-polished', 'bedroom pop', 'analog warmth', 'heavily compressed', 'sparse arrangement', 'dense layering', 'reverb-heavy', 'dry and close', 'cinematic mix', 'tape saturation', 'minimalist', 'maximalist', 'organic', 'synthetic', 'sample-based', 'orchestral'] },
  { label: 'Vocal Characteristics', pool: ['female vocal', 'male vocal', 'breathy', 'powerful', 'falsetto', 'raspy', 'choir', 'harmonized', 'spoken word', 'whispery', 'soulful', 'operatic', 'autotuned', 'no vocals', 'deep baritone', 'high tenor', 'conversational', 'melodic rap', 'melismatic', 'vibrato-heavy', 'deadpan'] },
  { label: 'Speed / Rhythm', pool: ['slow tempo', 'mid-tempo', 'fast-paced', 'groovy', 'driving', 'laid-back', 'frenetic', 'hypnotic', 'syncopated', 'straight beat', 'swung', 'rubato', 'waltz time', 'half-time feel', 'double-time feel', 'polyrhythmic', 'floating'] },
  { label: 'Structure Hints', pool: ['building intro', 'catchy chorus', 'dramatic bridge', 'fade-out ending', 'crescendo', 'outro breakdown', 'instrumental interlude', 'call and response', 'looping motif', 'evolving texture', 'sudden drop', 'key change', 'slow burn', 'explosive finish', 'stripped-down verse', 'layered outro'] },
];

const STRUCTURE_TAGS = [
  { label: 'Intro', tag: '[Intro]' }, { label: 'Verse', tag: '[Verse]' },
  { label: 'Pre-Chorus', tag: '[Pre-Chorus]' }, { label: 'Chorus', tag: '[Chorus]' },
  { label: 'Bridge', tag: '[Bridge]' }, { label: 'Outro', tag: '[Outro]' },
  { label: 'Build', tag: '[Build]' }, { label: 'Drop', tag: '[Drop]' },
  { label: 'Breakdown', tag: '[Breakdown]' }, { label: 'Guitar Solo', tag: '[Guitar Solo]' },
  { label: 'Piano Interlude', tag: '[Piano Interlude]' }, { label: 'Fade Out', tag: '[Fade Out]' },
];
const VOCAL_TAGS = [
  { label: 'raspy', tag: '[raspy vocal]' }, { label: 'whispered', tag: '[whispered]' },
  { label: 'falsetto', tag: '[falsetto]' }, { label: 'powerful', tag: '[powerful belting]' },
  { label: 'spoken', tag: '[spoken word]' }, { label: 'harmonies', tag: '[harmonies]' },
  { label: 'ad-lib', tag: '[ad-lib]' },
];
const ENERGY_TAGS = [
  { label: 'high energy', tag: '[high energy]' }, { label: 'low energy', tag: '[low energy]' },
  { label: 'building', tag: '[building energy]' }, { label: 'explosive', tag: '[explosive]' },
  { label: 'melancholic', tag: '[melancholic]' }, { label: 'euphoric', tag: '[euphoric]' },
  { label: 'dreamy', tag: '[dreamy]' },
];
const DIT_MODELS = [
  { value: 'acestep-v15-turbo', label: 'Turbo', description: 'Fast, 8 steps. Recommended.' },
  { value: 'acestep-v15-turbo-shift1', label: 'Turbo Shift-1', description: 'Richer details, weaker semantics.' },
  { value: 'acestep-v15-turbo-shift3', label: 'Turbo Shift-3', description: 'Clearer timbre, minimal orchestration.' },
  { value: 'acestep-v15-sft', label: 'SFT', description: '50 steps, CFG support.' },
  { value: 'acestep-v15-base', label: 'Base', description: 'All tasks. Best for fine-tuning.' },
];
const KEY_SIGS = ['C major', 'C minor', 'C# major', 'C# minor', 'D major', 'D minor', 'D# major', 'D# minor', 'Eb major', 'Eb minor', 'E major', 'E minor', 'F major', 'F minor', 'F# major', 'F# minor', 'Gb major', 'Gb minor', 'G major', 'G minor', 'G# major', 'G# minor', 'Ab major', 'Ab minor', 'A major', 'A minor', 'A# major', 'A# minor', 'Bb major', 'Bb minor', 'B major', 'B minor'];
const VOCAL_LANGUAGES = [
  { value: 'en', label: 'English' }, { value: 'zh', label: 'Chinese' }, { value: 'ja', label: 'Japanese' },
  { value: 'ko', label: 'Korean' }, { value: 'fr', label: 'French' }, { value: 'de', label: 'German' },
  { value: 'es', label: 'Spanish' }, { value: 'pt', label: 'Portuguese' }, { value: 'it', label: 'Italian' },
  { value: 'unknown', label: 'Auto-detect' },
];
const VOCAL_GENDERS = [
  { value: '', label: 'Any' },
  { value: 'female', label: 'Female' },
  { value: 'male', label: 'Male' },
];

function sample<T>(arr: T[], n: number): T[] {
  return [...arr].sort(() => Math.random() - 0.5).slice(0, Math.min(n, arr.length));
}

const CHIPS_PER_ROW = 4;
function initVisibleChips(): string[][] {
  return DIMENSIONS.map(d => sample(d.pool, CHIPS_PER_ROW));
}

function formatDuration(s?: number) {
  if (!s) return '--:--';
  return `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function DimensionBlock({ label, visible, onShuffle, onChipClick, disabled }: {
  label: string; visible: string[]; onShuffle: () => void; onChipClick: (c: string) => void; disabled: boolean;
}) {
  return (
    <div className="p-2.5 bg-white dark:bg-white/5 rounded-xl border border-zinc-200 dark:border-white/10 space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-[9px] font-bold uppercase tracking-widest text-zinc-400 dark:text-zinc-500 leading-none">{label}</span>
        <button type="button" onClick={onShuffle} disabled={disabled} className="p-0.5 rounded text-zinc-300 dark:text-zinc-600 hover:text-zinc-600 dark:hover:text-zinc-300 transition-colors disabled:opacity-30">
          <Shuffle size={10} />
        </button>
      </div>
      <div className="flex flex-wrap gap-1">
        {visible.map(chip => (
          <button key={chip} type="button" onClick={() => onChipClick(chip)} disabled={disabled}
            className="px-2 py-0.5 text-[11px] rounded-full border border-zinc-200 dark:border-white/10 text-zinc-600 dark:text-zinc-300 bg-zinc-50 dark:bg-black/20 hover:border-pink-400 dark:hover:border-pink-500 hover:text-pink-600 dark:hover:text-pink-400 hover:bg-pink-50 dark:hover:bg-pink-500/10 transition-all disabled:opacity-40 disabled:cursor-not-allowed">
            {chip}
          </button>
        ))}
      </div>
    </div>
  );
}

function TagButton({ label, onClick, disabled }: { label: string; onClick: () => void; disabled: boolean }) {
  return (
    <button type="button" onClick={onClick} disabled={disabled}
      className="px-2 py-0.5 text-[11px] font-mono rounded border border-zinc-200 dark:border-white/10 text-zinc-500 dark:text-zinc-400 bg-zinc-50 dark:bg-black/20 hover:border-purple-400 dark:hover:border-purple-500 hover:text-purple-600 dark:hover:text-purple-400 hover:bg-purple-50 dark:hover:bg-purple-500/10 transition-all disabled:opacity-40 disabled:cursor-not-allowed">
      {label}
    </button>
  );
}

// ─── InlineNewTrack ───────────────────────────────────────────────────────────

type Phase = 'closed' | 'open' | 'generating' | 'done';

export interface InlineNewTrackPrefill {
  caption?: string;
  lyrics?: string;
  duration?: number;
  bpm?: number;
  keyScale?: string;
  timeSignature?: string;
  taskType?: TaskType;
  ditModel?: string;
  inferenceSteps?: number;
  guidanceScale?: number;
  shift?: number;
  vocalLanguage?: string;
  sourceTrackId?: string;
}

interface InlineNewTrackProps {
  workspaceId: string;
  projectId?: string;
  onTrackCreated: (track: Track) => void;
  onSelect?: (track: Track) => void;
  prefill?: InlineNewTrackPrefill;
  autoOpen?: boolean;
}

export default function InlineNewTrack({ workspaceId, projectId, onTrackCreated, onSelect, prefill, autoOpen }: InlineNewTrackProps) {
  const [phase, setPhase] = useState<Phase>('closed');
  const [createdTrack, setCreatedTrack] = useState<Track | null>(null);

  // ── Form state ──
  const [taskType, setTaskType] = useState<TaskType>(prefill?.taskType ?? 'text2music');
  const [caption, setCaption] = useState(prefill?.caption ?? '');
  const [visibleChips, setVisibleChips] = useState<string[][]>(initVisibleChips);
  const [showChips, setShowChips] = useState(false);
  const [lyricsMode, setLyricsMode] = useState<LyricsMode>('custom');
  const [lyrics, setLyrics] = useState(prefill?.lyrics ?? '');
  const [trackTitle, setTrackTitle] = useState('');
  const [isGeneratingTitle, setIsGeneratingTitle] = useState(false);
  const [lyricsPrompt, setLyricsPrompt] = useState('');
  const [refinedPromptLyrics, setRefinedPromptLyrics] = useState('');
  const [isRefiningPrompt, setIsRefiningPrompt] = useState(false);
  const [isRefining, setIsRefining] = useState(false);
  const lyricsRef = useRef<HTMLTextAreaElement>(null);

  const [duration, setDuration] = useState(prefill?.duration ?? 30);
  const [durationLocked, setDurationLocked] = useState(false);
  const [bpm, setBpm] = useState(prefill?.bpm ?? 0);
  const [keyScale, setKeyScale] = useState(prefill?.keyScale ?? '');
  const [timeSignature, setTimeSignature] = useState(prefill?.timeSignature ?? '4/4');
  const [vocalLanguage, setVocalLanguage] = useState(prefill?.vocalLanguage ?? 'en');
  const [vocalGender, setVocalGender] = useState<'' | 'female' | 'male'>('');

  // Auto-open when prefill is supplied
  useEffect(() => {
    if (autoOpen || prefill) setPhase('open');
  }, []);

  const [sourceAudioFile, setSourceAudioFile] = useState<File | null>(null);
  const [sourceAudioUrl, setSourceAudioUrl] = useState('');
  const [isUploadingAudio, setIsUploadingAudio] = useState(false);

  const [thinking, setThinking] = useState(true);
  const [ditModel, setDitModel] = useState(prefill?.ditModel ?? 'acestep-v15-turbo');

  const [showAdvanced, setShowAdvanced] = useState(false);
  const [inferenceSteps, setInferenceSteps] = useState(prefill?.inferenceSteps ?? 8);
  const [guidanceScale, setGuidanceScale] = useState(prefill?.guidanceScale ?? 7.0);
  const [lmTemperature, setLmTemperature] = useState(0.85);
  const [shift, setShift] = useState(prefill?.shift ?? 3.0);
  const [batchSize, setBatchSize] = useState(1);

  // ── Generation state ──
  const [stage, setStage] = useState('');
  const [error, setError] = useState<string | null>(null);
  // Estimated fill: animates 0→88% over ~90s, jumps to 100 on done
  const [estimatedProgress, setEstimatedProgress] = useState(0);
  const progressIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const stopPolling = () => {
    if (pollIntervalRef.current) { clearInterval(pollIntervalRef.current); pollIntervalRef.current = null; }
  };
  const stopProgress = () => {
    if (progressIntervalRef.current) { clearInterval(progressIntervalRef.current); progressIntervalRef.current = null; }
  };

  const startEstimatedProgress = () => {
    setEstimatedProgress(0);
    // Tick every 500ms — asymptotically approaches 88% over ~90s
    progressIntervalRef.current = setInterval(() => {
      setEstimatedProgress(p => p + (88 - p) * 0.008);
    }, 500);
  };

  const resetForm = () => {
    setTaskType('text2music');
    setCaption(''); setVisibleChips(initVisibleChips()); setShowChips(false);
    setLyricsMode('custom'); setLyrics(''); setTrackTitle('');
    setLyricsPrompt(''); setRefinedPromptLyrics(''); setIsRefining(false);
    setDuration(30); setBpm(0); setKeyScale(''); setTimeSignature('4/4'); setVocalLanguage('en');
    setSourceAudioFile(null); setSourceAudioUrl(''); setIsUploadingAudio(false);
    setThinking(true); setDitModel('acestep-v15-turbo');
    setShowAdvanced(false); setInferenceSteps(8); setGuidanceScale(7.0); setLmTemperature(0.85); setShift(3.0); setBatchSize(1);
    setStage(''); setError(null); setEstimatedProgress(0);
  };

  // Clean up on unmount
  useEffect(() => () => { stopPolling(); stopProgress(); }, []);

  const handleChipClick = useCallback((chip: string) => {
    setCaption(prev => {
      const t = prev.trim();
      if (!t) return chip;
      return t.endsWith(',') ? t + ' ' + chip : t + ', ' + chip;
    });
  }, []);

  const handleShuffle = useCallback((i: number) => {
    setVisibleChips(prev => { const n = [...prev]; n[i] = sample(DIMENSIONS[i].pool, CHIPS_PER_ROW); return n; });
  }, []);

  const insertLyricsTag = useCallback((tag: string) => {
    const el = lyricsRef.current;
    if (!el) { setLyrics(prev => prev + (prev.endsWith('\n') || !prev ? '' : '\n') + tag + '\n'); return; }
    const start = el.selectionStart;
    const before = lyrics.substring(0, start);
    const after = lyrics.substring(el.selectionEnd);
    const prefix = before.length > 0 && !before.endsWith('\n') ? '\n' : '';
    const insertion = prefix + tag + '\n';
    setLyrics(before + insertion + after);
    const pos = start + insertion.length;
    requestAnimationFrame(() => { el.focus(); el.setSelectionRange(pos, pos); });
  }, [lyrics]);

  // Inject vocal gender into caption before sending to ACE-Step / format calls
  const captionWithGender = (base: string) => {
    if (!vocalGender) return base;
    const tag = vocalGender === 'female' ? 'female vocals' : 'male vocals';
    if (base.toLowerCase().includes('female vocal') || base.toLowerCase().includes('male vocal')) return base;
    return base ? `${base}, ${tag}` : tag;
  };

  const applyFormatResponse = (r: Awaited<ReturnType<typeof generateApi.formatInput>>, opts?: { setLyricsTo?: (v: string) => void }) => {
    if (r.caption) setCaption(r.caption);
    if (r.bpm) setBpm(r.bpm);
    if (r.duration && !durationLocked) setDuration(r.duration);
    if (r.key_scale) setKeyScale(r.key_scale);
    if (r.time_signature) setTimeSignature(r.time_signature);
    if (r.vocal_language) setVocalLanguage(r.vocal_language);
    if (r.lyrics && opts?.setLyricsTo) opts.setLyricsTo(r.lyrics);
  };

  const handleRefineLyrics = async () => {
    if (isRefining || !lyrics.trim()) return;
    setIsRefining(true); setError(null);
    try {
      // If the lyrics have no section tags yet, wrap them so the LM knows this
      // is real content to preserve — not a skeleton to replace with new text.
      const hasStructure = /\[[\w\s]+\]/.test(lyrics);
      const lyricsToSend = hasStructure ? lyrics : `[Verse]\n${lyrics.trim()}`;
      const refineCaption = captionWithGender(
        `Preserve the original lyrics exactly, only add or fix section structure tags. Style: ${caption || 'music'}`
      );
      const r = await generateApi.formatInput({ caption: refineCaption, lyrics: lyricsToSend, bpm: bpm || undefined, duration, keyScale: keyScale || undefined, timeSignature: timeSignature || undefined, vocalLanguage: lyricsMode !== 'instrumental' ? vocalLanguage || undefined : undefined });
      applyFormatResponse(r, { setLyricsTo: setLyrics });
    } catch (err) { setError(err instanceof Error ? err.message : 'Failed to refine lyrics'); }
    finally { setIsRefining(false); }
  };

  const handleRefinePrompt = async () => {
    if (isRefiningPrompt || !lyricsPrompt.trim()) return;
    setIsRefiningPrompt(true); setError(null);
    try {
      // Merge prose concept into the caption so the LM uses it as context.
      // Pass a structural skeleton as `lyrics` — this tells the LM to fill in
      // real lyrics rather than defaulting to [Instrumental].
      const enrichedCaption = captionWithGender([caption, lyricsPrompt].filter(Boolean).join('. '));
      const lyricsSkeleton = '[Verse]\n\n[Chorus]\n\n[Verse]\n\n[Chorus]\n\n[Bridge]\n\n[Chorus]';
      const r = await generateApi.formatInput({ caption: enrichedCaption, lyrics: lyricsSkeleton, bpm: bpm || undefined, duration, keyScale: keyScale || undefined, timeSignature: timeSignature || undefined, vocalLanguage: vocalLanguage || undefined, temperature: 0.9 });
      applyFormatResponse(r, { setLyricsTo: setRefinedPromptLyrics });
    } catch (err) { setError(err instanceof Error ? err.message : 'Failed to refine prompt'); }
    finally { setIsRefiningPrompt(false); }
  };

  const handleGenerateTitle = async () => {
    if (isGeneratingTitle) return;
    const srcLyrics = lyricsMode === 'custom' ? lyrics : (refinedPromptLyrics || lyricsPrompt);
    if (!caption.trim() && !srcLyrics.trim()) return;
    setIsGeneratingTitle(true); setError(null);
    try {
      const r = await generateApi.generateTitle({ caption: caption || undefined, lyrics: srcLyrics || undefined });
      if (r.title) setTrackTitle(r.title);
    } catch (err) { setError(err instanceof Error ? err.message : 'Failed to generate title'); }
    finally { setIsGeneratingTitle(false); }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setSourceAudioFile(file); setIsUploadingAudio(true); setError(null);
    try { const r = await generateApi.uploadAudio(file); setSourceAudioUrl(r.url); }
    catch { setError('Failed to upload audio file.'); setSourceAudioFile(null); }
    finally { setIsUploadingAudio(false); }
    e.target.value = '';
  };

  const handleGenerate = async () => {
    setError(null);
    const isInstrumental = lyricsMode === 'instrumental';
    let finalLyrics = lyricsMode === 'custom' ? lyrics : '';

    // Collapse form immediately, show generating state
    setPhase('generating');
    startEstimatedProgress();
    setStage('Starting...');

    try {
      if (lyricsMode === 'prompt' && lyricsPrompt.trim()) {
        if (refinedPromptLyrics) {
          finalLyrics = refinedPromptLyrics;
        } else {
          setStage('Generating lyrics from prompt...');
          try {
            const enrichedCaption = captionWithGender([caption, lyricsPrompt].filter(Boolean).join('. '));
            const lyricsSkeleton = '[Verse]\n\n[Chorus]\n\n[Verse]\n\n[Chorus]\n\n[Bridge]\n\n[Chorus]';
            const f = await generateApi.formatInput({ caption: enrichedCaption, lyrics: lyricsSkeleton, bpm: bpm || undefined, duration, keyScale: keyScale || undefined, timeSignature: timeSignature || undefined, vocalLanguage: vocalLanguage || undefined, temperature: 0.9 });
            finalLyrics = f.lyrics || '';
          } catch { finalLyrics = lyricsPrompt; }
        }
      }

      const effectiveCaption = captionWithGender(caption);
      const effectiveVocalLanguage = vocalLanguage === 'unknown' ? undefined : vocalLanguage;
      const job = await generateApi.startGeneration({
        customMode: true, prompt: effectiveCaption, lyrics: finalLyrics, style: effectiveCaption, title: '',
        instrumental: isInstrumental, vocalLanguage: effectiveVocalLanguage, bpm, keyScale, timeSignature, duration,
        inferenceSteps, guidanceScale, batchSize, randomSeed: true, seed: -1,
        thinking: thinking || lyricsMode === 'prompt', audioFormat: 'mp3', inferMethod: 'ode',
        shift, lmTemperature, lmCfgScale: 2.0, lmTopK: 0, lmTopP: 0.9, lmNegativePrompt: '',
        ditModel, taskType,
        ...(sourceAudioUrl && taskType !== 'text2music' ? { sourceAudioUrl } : {}),
      });

      const jobId = job.jobId || job.id;
      if (!jobId) throw new Error('No job ID returned');

      pollIntervalRef.current = setInterval(async () => {
        try {
          const status = await generateApi.getStatus(jobId);
          if (status.stage) setStage(status.stage);

          if (status.status === 'succeeded') {
            stopPolling();
            stopProgress();
            setEstimatedProgress(100);

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

            setCreatedTrack(track);
            // Brief pause so 100% progress registers visually, then fade to done
            setTimeout(() => {
              setPhase('done');
              onTrackCreated(track);
              // After showing done state, reset after a moment
              setTimeout(() => { setPhase('closed'); setCreatedTrack(null); resetForm(); }, 3000);
            }, 400);

          } else if (status.status === 'failed') {
            stopPolling(); stopProgress();
            setError(status.error ?? 'Generation failed');
            setPhase('open');
          }
        } catch (err) {
          stopPolling(); stopProgress();
          setError(err instanceof Error ? err.message : 'Failed to check status');
          setPhase('open');
        }
      }, 2000);
    } catch (err) {
      stopPolling(); stopProgress();
      setError(err instanceof Error ? err.message : 'Failed to start generation');
      setPhase('open');
    }
  };

  const isOpen = phase === 'open';
  const isGenerating = phase === 'generating';
  const isDone = phase === 'done';
  const isSFTOrBase = ditModel === 'acestep-v15-sft' || ditModel === 'acestep-v15-base';
  const needsAudio = taskType !== 'text2music';

  // ─── Collapsed row (closed / generating / done) ───────────────────────────

  const handleRowClick = () => {
    if (phase === 'closed') setPhase('open');
    else if (phase === 'done' && createdTrack && onSelect) onSelect(createdTrack);
  };

  const rowContent = (
    <div
      className={`flex items-center gap-3 px-3 py-2 transition-colors ${
        phase === 'closed'
          ? 'cursor-pointer hover:bg-zinc-50 dark:hover:bg-white/5'
          : phase === 'done'
          ? 'cursor-pointer hover:bg-zinc-50 dark:hover:bg-white/5'
          : ''
      }`}
      onClick={handleRowClick}
    >
      {/* Left icon */}
      <div className={`w-8 h-8 rounded-full flex-shrink-0 flex items-center justify-center transition-colors ${
        isDone
          ? 'bg-green-100 dark:bg-green-500/20 text-green-600 dark:text-green-400'
          : isGenerating
          ? 'bg-pink-100 dark:bg-pink-500/20 text-pink-500'
          : 'bg-zinc-100 dark:bg-white/10 text-zinc-400 dark:text-zinc-500 group-hover:bg-pink-50 dark:group-hover:bg-pink-500/10 group-hover:text-pink-500'
      }`}>
        {isDone
          ? <Check size={14} />
          : isGenerating
          ? <Loader2 size={14} className="animate-spin" />
          : <Plus size={14} />}
      </div>

      {/* Info area */}
      <div className="flex-1 min-w-0">
        {isDone && createdTrack ? (
          <div className="transition-opacity duration-500 opacity-100">
            <p className="text-sm font-medium text-zinc-900 dark:text-white truncate leading-tight">{createdTrack.title}</p>
            {createdTrack.style && <p className="text-xs text-zinc-400 dark:text-zinc-500 truncate mt-0.5">{createdTrack.style}</p>}
          </div>
        ) : isGenerating ? (
          <div>
            <p className="text-sm font-medium text-zinc-600 dark:text-zinc-400 truncate">{stage || 'Generating...'}</p>
            {caption && <p className="text-xs text-zinc-400 dark:text-zinc-500 truncate mt-0.5">{caption}</p>}
          </div>
        ) : (
          <p className="text-sm text-zinc-400 dark:text-zinc-500 select-none">New Track</p>
        )}
      </div>

      {/* Right side */}
      {isDone && createdTrack && (
        <span className="text-xs text-zinc-400 dark:text-zinc-600 font-mono flex-shrink-0 flex items-center gap-1">
          <Clock size={11} />
          {formatDuration(createdTrack.duration)}
        </span>
      )}
      {isDone && createdTrack && (
        <button
          onClick={e => { e.stopPropagation(); if (onSelect) onSelect(createdTrack); window.dispatchEvent(new CustomEvent('ace:play-track', { detail: createdTrack })); }}
          className="w-8 h-8 rounded-full flex-shrink-0 flex items-center justify-center bg-zinc-200 dark:bg-white/10 text-zinc-500 dark:text-zinc-400 hover:bg-pink-500/20 hover:text-pink-500 transition-colors"
        >
          <Play size={13} className="ml-0.5" fill="currentColor" />
        </button>
      )}
      {phase === 'closed' && (
        <span className="text-xs text-zinc-400 dark:text-zinc-500 font-medium flex-shrink-0">+ New Track</span>
      )}
    </div>
  );

  // ─── Progress bar (generating state) ────────────────────────────────────────

  const progressBar = isGenerating && (
    <div className="h-0.5 bg-zinc-100 dark:bg-white/5">
      <div
        className="h-full bg-gradient-to-r from-pink-500 to-purple-500 transition-all duration-700 ease-out"
        style={{ width: `${estimatedProgress}%` }}
      />
    </div>
  );

  // ─── Expanded form ────────────────────────────────────────────────────────

  const expandedForm = (
    <div className={`overflow-hidden transition-all duration-300 ease-in-out ${isOpen ? 'max-h-[1200px] opacity-100' : 'max-h-0 opacity-0'}`}>
      <div className="overflow-y-auto max-h-[1160px] px-4 pb-5 pt-1 space-y-4">

        {/* Header row: thinking toggle + close */}
        <div className="flex items-center justify-between pt-2 pb-2 border-b border-zinc-100 dark:border-white/5">
          <button
            onClick={() => setThinking(t => !t)}
            title={thinking ? 'LM thinking enabled — auto-infers metadata and enriches caption' : 'LM thinking disabled'}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all ${
              thinking
                ? 'bg-purple-50 dark:bg-purple-500/15 border-purple-300 dark:border-purple-500/40 text-purple-700 dark:text-purple-300'
                : 'bg-zinc-100 dark:bg-black/30 border-zinc-200 dark:border-white/10 text-zinc-500 dark:text-zinc-400'
            }`}
          >
            <Brain size={13} />
            {thinking ? 'Thinking ON' : 'Thinking OFF'}
          </button>
          <button
            onClick={() => { setPhase('closed'); setError(null); }}
            className="p-1.5 hover:bg-zinc-100 dark:hover:bg-white/5 rounded-full transition-colors text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200"
          >
            <X size={16} />
          </button>
        </div>

        {/* ── Two-column layout ── */}
        <div className="grid grid-cols-2 gap-5 items-start">

          {/* LEFT — Creative content: Style + Lyrics */}
          <div className="space-y-4">

            {/* Style */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-wide">Style</label>
                <button type="button" onClick={() => setShowChips(s => !s)} className="text-[11px] text-pink-500 dark:text-pink-400 font-semibold hover:text-pink-600 transition-colors">
                  {showChips ? 'Hide suggestions' : 'Suggestions'}
                </button>
              </div>
              <p className="text-[11px] text-zinc-400 dark:text-zinc-500 mb-1.5">Style, instruments, emotion, timbre, vocal character. Most important input.</p>
              <textarea
                value={caption} onChange={e => setCaption(e.target.value)}
                placeholder="e.g. dreamy lo-fi hip hop, soft female vocals, melancholic piano, vinyl crackle..."
                className="w-full h-24 bg-zinc-50 dark:bg-black/20 border border-zinc-200 dark:border-white/10 rounded-xl px-3 py-2.5 text-sm text-zinc-900 dark:text-white placeholder-zinc-400 dark:placeholder-zinc-600 focus:outline-none focus:border-pink-500 dark:focus:border-pink-500 resize-none transition-colors"
              />
              {showChips && (
                <div className="mt-2 grid grid-cols-2 gap-1.5">
                  {DIMENSIONS.map((dim, i) => (
                    <DimensionBlock key={dim.label} label={dim.label} visible={visibleChips[i]}
                      onShuffle={() => handleShuffle(i)} onChipClick={handleChipClick} disabled={false} />
                  ))}
                </div>
              )}
            </div>

            {/* Lyrics */}
            <div>
              <label className="text-xs font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-wide mb-2 block">Lyrics</label>
              <div className="flex items-center bg-zinc-100 dark:bg-black/40 rounded-xl p-1 gap-1 mb-3">
                {([
                  { value: 'custom', label: 'Custom', icon: <Mic size={11} /> },
                  { value: 'prompt', label: 'Prompt', icon: <Sparkles size={11} /> },
                  { value: 'instrumental', label: 'Instrumental', icon: <Music size={11} /> },
                ] as const).map(({ value, label, icon }) => (
                  <button key={value} onClick={() => { setLyricsMode(value); if (value === 'instrumental') setLyrics(''); }}
                    className={`flex-1 flex items-center justify-center gap-1.5 py-2 px-2 rounded-lg text-xs font-semibold transition-all ${lyricsMode === value ? 'bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white shadow-sm' : 'text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200'}`}>
                    {icon}{label}
                  </button>
                ))}
              </div>

              {lyricsMode === 'custom' && (
                <div className="space-y-2">
                  <div className="space-y-1.5">
                    <p className="text-[11px] text-zinc-400 dark:text-zinc-500 font-medium">Structure</p>
                    <div className="flex flex-wrap gap-1">{STRUCTURE_TAGS.map(t => <TagButton key={t.tag} label={t.label} onClick={() => insertLyricsTag(t.tag)} disabled={false} />)}</div>
                    <p className="text-[11px] text-zinc-400 dark:text-zinc-500 font-medium mt-1">Vocal</p>
                    <div className="flex flex-wrap gap-1">{VOCAL_TAGS.map(t => <TagButton key={t.tag} label={t.label} onClick={() => insertLyricsTag(t.tag)} disabled={false} />)}</div>
                    <p className="text-[11px] text-zinc-400 dark:text-zinc-500 font-medium mt-1">Energy</p>
                    <div className="flex flex-wrap gap-1">{ENERGY_TAGS.map(t => <TagButton key={t.tag} label={t.label} onClick={() => insertLyricsTag(t.tag)} disabled={false} />)}</div>
                  </div>
                  <textarea ref={lyricsRef} value={lyrics} onChange={e => setLyrics(e.target.value)}
                    placeholder={"[Verse]\nYour lyrics here...\n\n[Chorus]\n..."}
                    className="w-full h-40 bg-zinc-50 dark:bg-black/20 border border-zinc-200 dark:border-white/10 rounded-xl px-3 py-2.5 text-sm text-zinc-900 dark:text-white placeholder-zinc-400 dark:placeholder-zinc-600 focus:outline-none focus:border-pink-500 dark:focus:border-pink-500 resize-none transition-colors font-mono" />
                  <div className="flex items-center justify-between">
                    <p className="text-[11px] text-zinc-400 dark:text-zinc-500">6–10 syllables per line works best</p>
                    <button onClick={handleRefineLyrics} disabled={isRefining || !lyrics.trim()}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-purple-600 dark:text-purple-400 hover:bg-purple-50 dark:hover:bg-purple-500/10 border border-purple-200 dark:border-purple-500/30 rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed">
                      {isRefining ? <Loader2 size={12} className="animate-spin" /> : <Wand2 size={12} />}
                      {isRefining ? 'Refining...' : 'Refine'}
                    </button>
                  </div>
                </div>
              )}

              {lyricsMode === 'prompt' && (
                <div className="space-y-2">
                  <p className="text-[11px] text-zinc-400 dark:text-zinc-500">Describe what the song should be about. ACE-Step generates lyrics from this.</p>
                  <textarea value={lyricsPrompt} onChange={e => { setLyricsPrompt(e.target.value); setRefinedPromptLyrics(''); }}
                    placeholder="e.g. a song about late night drives and missing someone, nostalgic and bittersweet..."
                    className="w-full h-28 bg-zinc-50 dark:bg-black/20 border border-zinc-200 dark:border-white/10 rounded-xl px-3 py-2.5 text-sm text-zinc-900 dark:text-white placeholder-zinc-400 dark:placeholder-zinc-600 focus:outline-none focus:border-pink-500 dark:focus:border-pink-500 resize-none transition-colors" />
                  <div className="flex items-center justify-end">
                    <button onClick={handleRefinePrompt} disabled={isRefiningPrompt || !lyricsPrompt.trim()}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-purple-600 dark:text-purple-400 hover:bg-purple-50 dark:hover:bg-purple-500/10 border border-purple-200 dark:border-purple-500/30 rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed">
                      {isRefiningPrompt ? <Loader2 size={12} className="animate-spin" /> : <Wand2 size={12} />}
                      {isRefiningPrompt ? 'Generating...' : 'Refine Prompt'}
                    </button>
                  </div>
                  {refinedPromptLyrics && (
                    <div className="space-y-1">
                      <p className="text-[10px] font-bold text-zinc-400 dark:text-zinc-500 uppercase tracking-wide">Generated lyrics preview</p>
                      <pre className="w-full bg-zinc-50 dark:bg-black/30 border border-zinc-200 dark:border-white/10 rounded-xl px-3 py-2.5 text-xs text-zinc-700 dark:text-zinc-300 whitespace-pre-wrap font-mono leading-relaxed max-h-40 overflow-y-auto">{refinedPromptLyrics}</pre>
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
          </div>

          {/* RIGHT — Parameters: Title, Task Type, Metadata, DiT Model */}
          <div className="space-y-4">

            {/* Track Title */}
            <div>
              <label className="text-xs font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-wide mb-2 block">Track Title</label>
              <div className="flex items-center gap-2">
                <input
                  type="text" value={trackTitle} onChange={e => setTrackTitle(e.target.value)}
                  placeholder="Auto-named if blank..."
                  className="flex-1 bg-zinc-50 dark:bg-black/20 border border-zinc-200 dark:border-white/10 rounded-xl px-3 py-2 text-sm text-zinc-900 dark:text-white placeholder-zinc-400 dark:placeholder-zinc-600 focus:outline-none focus:border-pink-500 dark:focus:border-pink-500 transition-colors min-w-0"
                />
                <button
                  onClick={handleGenerateTitle}
                  disabled={isGeneratingTitle || (!caption.trim() && !lyrics.trim() && !lyricsPrompt.trim())}
                  title="Generate title from caption and lyrics"
                  className="p-2 text-pink-600 dark:text-pink-400 hover:bg-pink-50 dark:hover:bg-pink-500/10 border border-pink-200 dark:border-pink-500/30 rounded-xl transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex-shrink-0"
                >
                  {isGeneratingTitle ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
                </button>
              </div>
            </div>

            {/* Task Type */}
            <div>
              <label className="text-xs font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-wide mb-2 block">Task Type</label>
              <div className="flex items-center bg-zinc-100 dark:bg-black/40 rounded-xl p-1 gap-1">
                {([
                  { value: 'text2music', label: 'Text → Music' },
                  { value: 'audio2audio', label: 'Audio → Audio' },
                  { value: 'cover', label: 'Cover' },
                ] as const).map(({ value, label }) => (
                  <button key={value} onClick={() => setTaskType(value)}
                    className={`flex-1 py-1.5 px-1 rounded-lg text-xs font-semibold transition-all ${taskType === value ? 'bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white shadow-sm' : 'text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200'}`}>
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {/* Metadata */}
            <div className="grid grid-cols-2 gap-2">
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
                  className="w-full accent-pink-500"
                />
                <div className="flex justify-between text-[10px] text-zinc-400 dark:text-zinc-600 mt-0.5">
                  <span>5s</span><span>2m</span><span>5m</span><span>10m</span>
                </div>
              </div>
              <div>
                <label className="text-xs font-medium text-zinc-500 dark:text-zinc-400 mb-1.5 block">BPM <span className="font-normal opacity-60">(0 = auto)</span></label>
                <input type="number" value={bpm} onChange={e => setBpm(Math.max(0, Math.min(300, Number(e.target.value) || 0)))} min={0} max={300}
                  className="w-full bg-zinc-50 dark:bg-black/20 border border-zinc-200 dark:border-white/10 rounded-lg px-3 py-2 text-sm text-zinc-900 dark:text-white focus:outline-none focus:border-pink-500 dark:focus:border-pink-500 transition-colors" />
              </div>
              <div>
                <label className="text-xs font-medium text-zinc-500 dark:text-zinc-400 mb-1.5 block">Key / Scale</label>
                <select value={keyScale} onChange={e => setKeyScale(e.target.value)}
                  className="w-full bg-zinc-50 dark:bg-black/20 border border-zinc-200 dark:border-white/10 rounded-lg px-2 py-2 text-sm text-zinc-900 dark:text-white focus:outline-none focus:border-pink-500 dark:focus:border-pink-500 transition-colors [&>option]:bg-white [&>option]:dark:bg-zinc-800">
                  <option value="">Auto</option>
                  {KEY_SIGS.map(k => <option key={k} value={k}>{k}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs font-medium text-zinc-500 dark:text-zinc-400 mb-1.5 block">Time Sig.</label>
                <select value={timeSignature} onChange={e => setTimeSignature(e.target.value)}
                  className="w-full bg-zinc-50 dark:bg-black/20 border border-zinc-200 dark:border-white/10 rounded-lg px-2 py-2 text-sm text-zinc-900 dark:text-white focus:outline-none focus:border-pink-500 dark:focus:border-pink-500 transition-colors [&>option]:bg-white [&>option]:dark:bg-zinc-800">
                  {['4/4', '3/4', '6/8', '2/4', '5/4', '7/8'].map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs font-medium text-zinc-500 dark:text-zinc-400 mb-1.5 block">Vocal Language</label>
                <select value={vocalLanguage} onChange={e => setVocalLanguage(e.target.value)} disabled={lyricsMode === 'instrumental'}
                  className="w-full bg-zinc-50 dark:bg-black/20 border border-zinc-200 dark:border-white/10 rounded-lg px-2 py-2 text-sm text-zinc-900 dark:text-white focus:outline-none focus:border-pink-500 dark:focus:border-pink-500 transition-colors disabled:opacity-50 [&>option]:bg-white [&>option]:dark:bg-zinc-800">
                  {VOCAL_LANGUAGES.map(l => <option key={l.value} value={l.value}>{l.label}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs font-medium text-zinc-500 dark:text-zinc-400 mb-1.5 block">Vocal Gender</label>
                <div className="flex items-center bg-zinc-100 dark:bg-black/40 rounded-lg p-0.5 gap-0.5">
                  {VOCAL_GENDERS.map(g => (
                    <button key={g.value} type="button"
                      onClick={() => setVocalGender(g.value as '' | 'female' | 'male')}
                      disabled={lyricsMode === 'instrumental'}
                      className={`flex-1 py-1.5 text-xs font-semibold rounded-md transition-all disabled:opacity-40 ${vocalGender === g.value ? 'bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white shadow-sm' : 'text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200'}`}>
                      {g.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* DiT Model */}
            <div>
              <label className="text-xs font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-wide mb-2 block">DiT Model</label>
              <div className="space-y-1">
                {DIT_MODELS.map(m => (
                  <button key={m.value} onClick={() => { setDitModel(m.value); setInferenceSteps(m.value.includes('sft') || m.value.includes('base') ? 50 : 8); }}
                    className={`w-full flex items-center gap-2.5 p-2 rounded-lg border text-left transition-all ${ditModel === m.value ? 'border-pink-400 dark:border-pink-500 bg-pink-50 dark:bg-pink-500/10' : 'border-zinc-200 dark:border-white/10 hover:border-zinc-300 dark:hover:border-white/20 bg-zinc-50 dark:bg-black/20'}`}>
                    <div className={`w-2.5 h-2.5 rounded-full border-2 flex-shrink-0 ${ditModel === m.value ? 'border-pink-500 bg-pink-500' : 'border-zinc-300 dark:border-zinc-600'}`} />
                    <div className="min-w-0">
                      <span className="text-xs font-semibold text-zinc-900 dark:text-white">{m.label}</span>
                      <span className="text-[11px] text-zinc-400 dark:text-zinc-500 ml-1.5 truncate">{m.description}</span>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* ── Full-width below the columns ── */}

        {/* Source audio (cover / audio2audio) */}
        {needsAudio && (
          <div>
            <label className="text-xs font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-wide mb-2 block">
              {taskType === 'cover' ? 'Cover Source Audio' : 'Source Audio'}
            </label>
            <p className="text-[11px] text-zinc-400 dark:text-zinc-500 mb-2">
              {taskType === 'cover' ? 'Melody, rhythm, and chords are extracted and reinterpreted with your caption.' : 'Source audio for style transfer. Caption controls the target style.'}
            </p>
            <input ref={fileInputRef} type="file" accept="audio/*" onChange={handleFileChange} className="hidden" />
            {sourceAudioFile ? (
              <div className="flex items-center gap-3 p-3 bg-zinc-50 dark:bg-black/20 border border-zinc-200 dark:border-white/10 rounded-xl">
                {isUploadingAudio ? <Loader2 size={16} className="text-pink-500 animate-spin flex-shrink-0" /> : <Music size={16} className="text-pink-500 flex-shrink-0" />}
                <span className="text-sm text-zinc-700 dark:text-zinc-300 truncate flex-1">{sourceAudioFile.name}</span>
                <button onClick={() => { setSourceAudioFile(null); setSourceAudioUrl(''); }} disabled={isUploadingAudio} className="text-zinc-400 hover:text-zinc-900 dark:hover:text-white transition-colors disabled:opacity-40"><X size={16} /></button>
              </div>
            ) : (
              <button onClick={() => fileInputRef.current?.click()}
                className="w-full flex items-center justify-center gap-2 p-3 border-2 border-dashed border-zinc-300 dark:border-white/10 rounded-xl text-zinc-500 dark:text-zinc-400 hover:border-pink-500 dark:hover:border-pink-500 hover:text-pink-500 transition-colors">
                <Upload size={15} /><span className="text-sm font-medium">Upload audio file</span>
              </button>
            )}
          </div>
        )}

        {/* Creativity + Style Influence sliders */}
        <div className="grid grid-cols-2 gap-x-6 gap-y-3">
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-medium text-zinc-500 dark:text-zinc-400">Creativity</label>
              <span className="text-xs font-semibold text-zinc-900 dark:text-white">{Math.round(lmTemperature * 100)}%</span>
            </div>
            <input type="range" min={0.1} max={1.5} step={0.05} value={lmTemperature}
              onChange={e => setLmTemperature(Number(e.target.value))}
              className="w-full accent-pink-500" />
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
              disabled={!isSFTOrBase}
              className="w-full accent-pink-500 disabled:opacity-50" />
            <p className="text-[11px] text-zinc-400 mt-0.5">How closely to follow the style prompt.</p>
          </div>
        </div>

        {/* Advanced */}
        <div>
          <button type="button" onClick={() => setShowAdvanced(!showAdvanced)}
            className="flex items-center gap-2 text-xs font-semibold text-zinc-500 dark:text-zinc-400 hover:text-zinc-800 dark:hover:text-zinc-200 transition-colors">
            <ChevronDown size={14} className={`transition-transform duration-200 ${showAdvanced ? 'rotate-180' : ''}`} />
            Advanced
          </button>
          {showAdvanced && (
            <div className="mt-3 grid grid-cols-2 gap-x-6 gap-y-4 pl-5 border-l-2 border-zinc-200 dark:border-white/10">
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-medium text-zinc-500 dark:text-zinc-400">Inference Steps</label>
                  <span className="text-xs font-semibold text-zinc-900 dark:text-white">{inferenceSteps}</span>
                </div>
                <input type="range" min={1} max={isSFTOrBase ? 100 : 20} step={1} value={inferenceSteps} onChange={e => setInferenceSteps(Number(e.target.value))} className="w-full accent-pink-500" />
                <p className="text-[11px] text-zinc-400 mt-0.5">{isSFTOrBase ? 'SFT/Base: 32–100 recommended' : 'Turbo: 8 is optimal'}</p>
              </div>
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-medium text-zinc-500 dark:text-zinc-400">Shift</label>
                  <span className="text-xs font-semibold text-zinc-900 dark:text-white">{shift.toFixed(1)}</span>
                </div>
                <input type="range" min={1} max={5} step={0.5} value={shift} onChange={e => setShift(Number(e.target.value))} className="w-full accent-pink-500" />
                <p className="text-[11px] text-zinc-400 mt-0.5">Higher = stronger semantics. Lower = richer details.</p>
              </div>
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-medium text-zinc-500 dark:text-zinc-400">Batch Size</label>
                  <span className="text-xs font-semibold text-zinc-900 dark:text-white">{batchSize}</span>
                </div>
                <input type="range" min={1} max={8} step={1} value={batchSize} onChange={e => setBatchSize(Number(e.target.value))} className="w-full accent-pink-500" />
                <p className="text-[11px] text-zinc-400 mt-0.5">Generate multiple variants at once.</p>
              </div>
            </div>
          )}
        </div>

        {/* Error */}
        {error && (
          <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-500/30 rounded-xl text-sm text-red-600 dark:text-red-400">{error}</div>
        )}

        {/* Generate */}
        <button
          onClick={handleGenerate}
          disabled={needsAudio && (!sourceAudioUrl || isUploadingAudio)}
          className="w-full flex items-center justify-center gap-2 px-6 py-3 bg-gradient-to-r from-pink-500 to-purple-600 text-white text-sm font-semibold rounded-xl hover:from-pink-600 hover:to-purple-700 transition-all shadow-lg shadow-pink-500/20 disabled:opacity-60 disabled:cursor-not-allowed"
        >
          <Sparkles size={16} />
          Generate{batchSize > 1 ? ` ×${batchSize}` : ''}
        </button>
      </div>
    </div>
  );

  return (
    <div className={`group transition-all ${isOpen ? 'bg-zinc-50 dark:bg-black/20' : ''}`}>
      {rowContent}
      {progressBar}
      {expandedForm}
    </div>
  );
}
