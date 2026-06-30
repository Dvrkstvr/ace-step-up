import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  Upload, Layers, X, Wand2, RefreshCw, Paintbrush, Music2, ChevronDown,
} from 'lucide-react';
import { useStudio } from '../../context/StudioContext';
import { studioApi, generateApi } from '../../services/api';
import { StudioLayer } from '../../types';
import StudioMixdownDialog from './StudioMixdownDialog';

type GenMode = 'generate' | 'compose' | 'repaint';
type Complexity = 'simple' | 'advanced';

interface PendingJob {
  jobId: string;
  rowId: string;          // selected region's anchor id (generate/repaint); '' for compose
  pendingLayerId: string;
  regionStart: number;
  regionEnd: number;
  rowName: string;
  mode: GenMode;
  usedParams: { style: string; lyrics: string; inferenceSteps: number; guidanceScale: number };
}

// ─── Small UI atoms ────────────────────────────────────────────────────────────

const inputCls =
  'w-full px-2.5 py-1.5 rounded bg-zinc-800 border border-zinc-700 text-white text-xs placeholder-zinc-500 outline-none focus:border-pink-500 transition-colors';

const Field: React.FC<{ label: string; children: React.ReactNode; className?: string }> = ({
  label, children, className = '',
}) => (
  <div className={className}>
    <label className="block mb-1 text-[10px] font-medium text-zinc-500 uppercase tracking-wide">
      {label}
    </label>
    {children}
  </div>
);

const NumInput: React.FC<{
  value: number; onChange: (v: number) => void;
} & React.InputHTMLAttributes<HTMLInputElement>> = ({ value, onChange, ...rest }) => (
  <input
    type="number"
    value={value}
    onChange={e => onChange(Number(e.target.value))}
    className={inputCls}
    {...rest}
  />
);

// ─── Mode accent colours ───────────────────────────────────────────────────────
const MODE_ACCENT: Record<GenMode, string> = {
  generate: 'bg-pink-600 hover:bg-pink-500',
  compose:  'bg-violet-600 hover:bg-violet-500',
  repaint:  'bg-orange-600 hover:bg-orange-500',
};

// ─── StudioBottomPanel ─────────────────────────────────────────────────────────
const StudioBottomPanel: React.FC = () => {
  const {
    session, layers, selectedRegion, setSelectedRegion,
    closeStudio, addLayer, addLocalLayer, removeLocalLayer, seekPlayhead,
    generatePrefill, setGeneratePrefill,
  } = useStudio();

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [showMixdown, setShowMixdown] = useState(false);

  // ── Mode & complexity ─────────────────────────────────────────────────────
  const [mode, setMode]           = useState<GenMode>('generate');
  const [complexity, setComplexity] = useState<Complexity>('simple');

  // ── Shared form state ─────────────────────────────────────────────────────
  const [prompt,         setPrompt]         = useState('');
  const [style,          setStyle]          = useState('');
  const [lyrics,         setLyrics]         = useState('');
  const [inferenceSteps, setInferenceSteps] = useState(8);
  const [guidanceScale,  setGuidanceScale]  = useState(7);
  const [audioCoverStrength, setAudioCoverStrength] = useState(1.0);
  const [useRandomSeed,  setUseRandomSeed]  = useState(true);
  const [seed,           setSeed]           = useState(42);
  const [inferMethod,    setInferMethod]    = useState<'ode' | 'sde'>('ode');

  // Generate: optional single reference clip
  const [referenceClipId,  setReferenceClipId]  = useState('');
  // Compose: multi-select context clips
  const [contextClipIds,   setContextClipIds]   = useState<Set<string>>(new Set());
  // Repaint: required source clip
  const [sourceClipId,     setSourceClipId]     = useState('');

  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState<string | null>(null);

  // ── Job tracking ──────────────────────────────────────────────────────────
  const [pendingJob,   setPendingJob]   = useState<PendingJob | null>(null);
  const [jobProgress,  setJobProgress]  = useState(0);
  const [jobStage,     setJobStage]     = useState('');
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => { setError(null); }, [selectedRegion, mode]);

  // When a clip's context menu sends a prefill (Use Prompt / Re-generate), populate the form.
  useEffect(() => {
    if (!generatePrefill) return;
    setMode('generate');
    setPrompt(generatePrefill.prompt);
    setStyle(generatePrefill.style);
    setLyrics(generatePrefill.lyrics);
    setInferenceSteps(generatePrefill.inferenceSteps);
    setGuidanceScale(generatePrefill.guidanceScale);
    setGeneratePrefill(null);
  }, [generatePrefill, setGeneratePrefill]);

  // ── Overlapping clips (repaint) ───────────────────────────────────────────
  const overlappingClips = useMemo(() => {
    if (!selectedRegion) return [];
    const { start, end } = selectedRegion;
    return layers.filter(l => {
      if (!l.audio_url || l.audio_url === '' || l.audio_url === 'pending') return false;
      const clipDur = l.clip_end != null ? l.clip_end - l.clip_start : Infinity;
      return l.start_offset < end && (l.start_offset + clipDur) > start;
    });
  }, [layers, selectedRegion]);

  useEffect(() => {
    if (mode !== 'repaint') return;
    if (overlappingClips.length > 0 && !overlappingClips.find(c => c.id === sourceClipId)) {
      setSourceClipId(overlappingClips[0].id);
    }
  }, [mode, overlappingClips, sourceClipId]);

  // Candidate clips for generate (single ref) and compose (multi context)
  const realClips = useMemo(
    () => layers.filter(l => l.audio_url && l.audio_url !== '' && l.audio_url !== 'pending'),
    [layers],
  );

  // ── Polling ───────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!pendingJob) {
      if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
      return;
    }
    const poll = async () => {
      try {
        const job = await generateApi.getStatus(pendingJob.jobId);
        setJobProgress(job.progress ?? 0);
        setJobStage(job.stage ?? '');

        if (job.status === 'succeeded') {
          clearInterval(pollRef.current!);
          pollRef.current = null;
          const audioUrl = job.result?.audioUrls?.[0];
          if (audioUrl) {
            if (pendingJob.mode === 'compose') {
              // Compose creates a brand-new row (anchor layer, no row_id)
              await addLayer({
                source_type: 'generated',
                name: `Composed — ${pendingJob.rowName}`,
                audio_url: audioUrl,
                start_offset: pendingJob.regionStart,
                clip_start: 0,
                clip_end: pendingJob.regionEnd - pendingJob.regionStart,
                volume: 1.0, is_muted: false, is_solo: false, is_locked: false,
                sort_order: layers.length + 1,
                generation_params: pendingJob.usedParams,
              });
            } else {
              // Generate / Repaint: clip goes on the selected row
              await addLayer({
                source_type: pendingJob.mode === 'repaint' ? 'repaint' : 'generated',
                name: pendingJob.mode === 'repaint'
                  ? `Repaint (${pendingJob.rowName})`
                  : `Generated (${pendingJob.rowName})`,
                audio_url: audioUrl,
                row_id: pendingJob.rowId,
                start_offset: pendingJob.regionStart,
                clip_start: 0,
                clip_end: pendingJob.regionEnd - pendingJob.regionStart,
                volume: 1.0, is_muted: false, is_solo: false, is_locked: false,
                sort_order: layers.length + 1,
                generation_params: pendingJob.usedParams,
              });
            }
          }
          removeLocalLayer(pendingJob.pendingLayerId);
          seekPlayhead?.(pendingJob.regionStart);
          setPendingJob(null);
          setJobProgress(0);
          setJobStage('');
        } else if (job.status === 'failed') {
          clearInterval(pollRef.current!);
          pollRef.current = null;
          removeLocalLayer(pendingJob.pendingLayerId);
          setPendingJob(null);
          setError(`${pendingJob.mode === 'repaint' ? 'Repaint' : 'Generation'} failed: ${job.error ?? 'unknown error'}`);
        }
      } catch (_) { /* transient error — keep polling */ }
    };
    pollRef.current = setInterval(poll, 2000);
    poll();
    return () => { if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; } };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingJob]);

  // ── Upload ────────────────────────────────────────────────────────────────
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const audioUrl = URL.createObjectURL(file);
    await addLayer({
      source_type: 'upload',
      name: file.name.replace(/\.[^.]+$/, ''),
      audio_url: audioUrl,
      volume: 1.0, is_muted: false, is_solo: false, is_locked: false,
      sort_order: layers.length,
    }).catch(console.error);
    e.target.value = '';
  };

  // ── Submit ────────────────────────────────────────────────────────────────
  const handleSubmit = async () => {
    if (!selectedRegion || !session) return;
    const rowLayer = layers.find(l => l.id === selectedRegion.rowId && !l.row_id);

    if (mode === 'repaint') {
      const sourceClip = layers.find(l => l.id === sourceClipId);
      if (!sourceClip) { setError('Select a clip to repaint.'); return; }
    }

    setError(null);
    setLoading(true);

    const duration  = selectedRegion.end - selectedRegion.start;
    const pendingId = `pending-${Date.now()}`;
    const modeLabel =
      mode === 'generate' ? `Generating… (${rowLayer?.name ?? ''})` :
      mode === 'compose'  ? `Composing…` :
                            `Repainting… (${rowLayer?.name ?? ''})`;

    // Compose creates a stand-alone shimmer row; others are child clips on the selected row
    addLocalLayer({
      id:          pendingId,
      session_id:  session.id,
      source_type: mode === 'repaint' ? 'repaint' : 'generated',
      name:        modeLabel,
      audio_url:   'pending',
      row_id:      mode === 'compose' ? undefined : selectedRegion.rowId,
      volume:      1.0, is_muted: false, is_solo: false, is_locked: true,
      sort_order:  layers.length + 1,
      start_offset: selectedRegion.start,
      clip_start:   0,
      clip_end:     duration,
      created_at:   new Date().toISOString(),
    });

    const refClip = referenceClipId ? layers.find(l => l.id === referenceClipId) : null;

    try {
      let jobId: string;

      if (mode === 'repaint') {
        const result = await studioApi.repaintRegion(sourceClipId, {
          region_start:         selectedRegion.start,
          region_end:           selectedRegion.end,
          prompt:               prompt || undefined,
          style:                style || undefined,
          lyrics:               lyrics || undefined,
          audio_cover_strength: audioCoverStrength,
          inference_steps:      inferenceSteps,
          guidance_scale:       guidanceScale,
          seed:                 useRandomSeed ? undefined : seed,
          use_random_seed:      useRandomSeed,
          infer_method:         inferMethod,
        });
        jobId = result.jobId;
      } else if (mode === 'compose') {
        const result = await studioApi.composeInRegion(session.id, {
          context_clip_ids: Array.from(contextClipIds),
          region_start:     selectedRegion.start,
          region_end:       selectedRegion.end,
          style:            `${prompt}${style ? ` — ${style}` : ''}` || undefined,
          lyrics:           lyrics || undefined,
          inference_steps:  inferenceSteps,
          guidance_scale:   guidanceScale,
          seed:             useRandomSeed ? undefined : seed,
          use_random_seed:  useRandomSeed,
          infer_method:     inferMethod,
        });
        jobId = result.jobId;
      } else {
        const result = await studioApi.generateInRegion(session.id, {
          row_id:              selectedRegion.rowId,
          region_start:        selectedRegion.start,
          region_end:          selectedRegion.end,
          audio_duration:      duration,
          prompt:              prompt || undefined,
          style:               style || undefined,
          lyrics:              lyrics || undefined,
          inference_steps:     inferenceSteps,
          guidance_scale:      guidanceScale,
          seed:                useRandomSeed ? undefined : seed,
          use_random_seed:     useRandomSeed,
          infer_method:        inferMethod,
          reference_audio_url: refClip?.audio_url || undefined,
        });
        jobId = result.jobId;
      }

      setPendingJob({
        jobId,
        rowId:          selectedRegion.rowId,
        pendingLayerId: pendingId,
        regionStart:    selectedRegion.start,
        regionEnd:      selectedRegion.end,
        rowName:        rowLayer?.name ?? 'New Layer',
        mode,
        usedParams: { style: `${prompt}${style ? ` — ${style}` : ''}`, lyrics, inferenceSteps, guidanceScale },
      });
      setSelectedRegion(null);
    } catch (err) {
      removeLocalLayer(pendingId);
      setError(err instanceof Error ? err.message : 'Request failed');
    } finally {
      setLoading(false);
    }
  };

  // ── Helpers ───────────────────────────────────────────────────────────────
  const rowLayer    = selectedRegion ? layers.find(l => l.id === selectedRegion.rowId && !l.row_id) : null;
  const canRepaint  = overlappingClips.length > 0;
  const showForm    = !!selectedRegion && !pendingJob;
  const showProgress = !!pendingJob;
  const fmt = (s: number) => s.toFixed(2);

  const toggleContext = (id: string) => {
    setContextClipIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="flex-shrink-0 border-t border-zinc-700 bg-zinc-900 flex flex-col">

      {/* ── Form ──────────────────────────────────────────────────────────── */}
      {showForm && (
        <div className="px-4 pt-3 pb-2 border-b border-zinc-700/60">

          {/* Header row: mode tabs + complexity toggle + region info + close */}
          <div className="flex items-center gap-2 mb-3 flex-wrap">

            {/* Mode tabs */}
            <div className="flex rounded overflow-hidden border border-zinc-700 text-[10px] font-semibold flex-shrink-0">
              {([
                { id: 'generate', icon: <Wand2 size={10} />,    label: 'Generate' },
                { id: 'compose',  icon: <Music2 size={10} />,   label: 'Compose'  },
                { id: 'repaint',  icon: <Paintbrush size={10}/>, label: 'Repaint'  },
              ] as { id: GenMode; icon: React.ReactNode; label: string }[]).map((tab, i) => {
                const disabled = tab.id === 'repaint' && !canRepaint;
                const active   = mode === tab.id;
                return (
                  <button
                    key={tab.id}
                    onClick={() => !disabled && setMode(tab.id)}
                    title={disabled ? 'No clips overlap this region' : undefined}
                    className={`flex items-center gap-1 px-2.5 py-1 transition-colors ${i > 0 ? 'border-l border-zinc-700' : ''} ${
                      active   ? tab.id === 'generate' ? 'bg-pink-600 text-white'
                               : tab.id === 'compose'  ? 'bg-violet-600 text-white'
                               :                          'bg-orange-600 text-white'
                      : disabled ? 'bg-zinc-800/40 text-zinc-600 cursor-not-allowed'
                      :            'bg-zinc-800 text-zinc-400 hover:text-zinc-200'
                    }`}
                  >
                    {tab.icon}{tab.label}
                  </button>
                );
              })}
            </div>

            {/* Simple / Advanced toggle — only for Generate and Compose */}
            {mode !== 'repaint' && (
              <div className="flex rounded overflow-hidden border border-zinc-700 text-[10px] font-semibold flex-shrink-0">
                <button
                  onClick={() => setComplexity('simple')}
                  className={`px-2.5 py-1 transition-colors ${
                    complexity === 'simple'
                      ? 'bg-zinc-600 text-white'
                      : 'bg-zinc-800 text-zinc-400 hover:text-zinc-200'
                  }`}
                >Simple</button>
                <button
                  onClick={() => setComplexity('advanced')}
                  className={`px-2.5 py-1 transition-colors border-l border-zinc-700 ${
                    complexity === 'advanced'
                      ? 'bg-zinc-600 text-white'
                      : 'bg-zinc-800 text-zinc-400 hover:text-zinc-200'
                  }`}
                >Advanced</button>
              </div>
            )}

            {/* Region info */}
            <span className="text-xs font-mono text-indigo-400 flex-shrink-0">
              {fmt(selectedRegion!.start)}s → {fmt(selectedRegion!.end)}s
              <span className="text-zinc-500 ml-1">({fmt(selectedRegion!.end - selectedRegion!.start)}s)</span>
            </span>
            {rowLayer && mode !== 'compose' && (
              <span className="text-xs text-zinc-500 truncate">— {rowLayer.name}</span>
            )}

            <button
              onClick={() => setSelectedRegion(null)}
              className="ml-auto p-1 rounded hover:bg-zinc-700 text-zinc-500 hover:text-zinc-300 transition-colors"
            >
              <X size={13} />
            </button>
          </div>

          {/* ── Repaint mode ─────────────────────────────────────────────── */}
          {mode === 'repaint' && (
            <div className="space-y-2 mb-2">
              <Field label="Clip to repaint">
                <select value={sourceClipId} onChange={e => setSourceClipId(e.target.value)} className={inputCls}>
                  <option value="">Select a clip…</option>
                  {overlappingClips.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </Field>
              <div className="grid grid-cols-[1fr_160px] gap-3">
                <Field label="Prompt">
                  <input type="text" value={prompt} onChange={e => setPrompt(e.target.value)}
                    placeholder="Describe the replacement sound…" className={inputCls} />
                </Field>
                <Field label="Style">
                  <input type="text" value={style} onChange={e => setStyle(e.target.value)}
                    placeholder="e.g. ambient…" className={inputCls} />
                </Field>
              </div>
              {/* Repaint always shows a compact advanced section */}
              <details className="group">
                <summary className="flex items-center gap-1 text-[10px] text-zinc-500 hover:text-zinc-300 uppercase tracking-wide cursor-pointer list-none transition-colors">
                  <ChevronDown size={10} className="group-open:rotate-180 transition-transform" />
                  Advanced
                </summary>
                <div className="grid gap-2 mt-2" style={{ gridTemplateColumns: 'repeat(7, 1fr)' }}>
                  <Field label="Steps"><NumInput value={inferenceSteps} onChange={setInferenceSteps} min={1} max={200} /></Field>
                  <Field label="Guidance"><NumInput value={guidanceScale} onChange={setGuidanceScale} min={0} max={30} step={0.5} /></Field>
                  <Field label="Cover Str."><NumInput value={audioCoverStrength} onChange={setAudioCoverStrength} min={0} max={1} step={0.05} /></Field>
                  <Field label="Method">
                    <select value={inferMethod} onChange={e => setInferMethod(e.target.value as 'ode' | 'sde')} className={inputCls}>
                      <option value="ode">ODE</option>
                      <option value="sde">SDE</option>
                    </select>
                  </Field>
                  <Field label="Seed"><NumInput value={seed} onChange={setSeed} disabled={useRandomSeed} /></Field>
                  <Field label=" ">
                    <div className="flex items-center gap-1.5 pt-1">
                      <input type="checkbox" id="rep-rand" checked={useRandomSeed}
                        onChange={e => setUseRandomSeed(e.target.checked)} className="accent-pink-500" />
                      <label htmlFor="rep-rand" className="text-xs text-zinc-400 cursor-pointer whitespace-nowrap">Random</label>
                    </div>
                  </Field>
                  <Field label="Lyrics">
                    <input type="text" value={lyrics} onChange={e => setLyrics(e.target.value)}
                      placeholder="[Verse]…" className={inputCls} />
                  </Field>
                </div>
              </details>
            </div>
          )}

          {/* ── Generate mode ─────────────────────────────────────────────── */}
          {mode === 'generate' && (
            <div className="space-y-2 mb-2">
              {/* Simple: one prompt field + optional reference */}
              <div className={`grid gap-3 ${complexity === 'simple' ? 'grid-cols-[1fr_200px]' : 'grid-cols-[1fr_160px_200px]'}`}>
                <Field label={complexity === 'simple' ? 'Describe the audio to generate' : 'Prompt'}>
                  <input type="text" value={prompt} onChange={e => setPrompt(e.target.value)}
                    placeholder="e.g. warm jazz piano, melodic synth lead…" className={inputCls} />
                </Field>
                {complexity === 'advanced' && (
                  <Field label="Style">
                    <input type="text" value={style} onChange={e => setStyle(e.target.value)}
                      placeholder="e.g. lo-fi, cinematic…" className={inputCls} />
                  </Field>
                )}
                <Field label="Style reference (optional)">
                  <select value={referenceClipId} onChange={e => setReferenceClipId(e.target.value)} className={inputCls}>
                    <option value="">None</option>
                    {realClips.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </Field>
              </div>
              {complexity === 'advanced' && (
                <>
                  <Field label="Lyrics (optional)">
                    <textarea value={lyrics} onChange={e => setLyrics(e.target.value)}
                      rows={2} placeholder="[Verse] lyrics here…" className={`${inputCls} resize-none`} />
                  </Field>
                  <div className="grid gap-2" style={{ gridTemplateColumns: 'repeat(6, 1fr)' }}>
                    <Field label="Steps"><NumInput value={inferenceSteps} onChange={setInferenceSteps} min={1} max={200} /></Field>
                    <Field label="Guidance"><NumInput value={guidanceScale} onChange={setGuidanceScale} min={0} max={30} step={0.5} /></Field>
                    <Field label="Method">
                      <select value={inferMethod} onChange={e => setInferMethod(e.target.value as 'ode' | 'sde')} className={inputCls}>
                        <option value="ode">ODE</option>
                        <option value="sde">SDE</option>
                      </select>
                    </Field>
                    <Field label="Seed"><NumInput value={seed} onChange={setSeed} disabled={useRandomSeed} /></Field>
                    <Field label=" ">
                      <div className="flex items-center gap-1.5 pt-1">
                        <input type="checkbox" id="gen-rand" checked={useRandomSeed}
                          onChange={e => setUseRandomSeed(e.target.checked)} className="accent-pink-500" />
                        <label htmlFor="gen-rand" className="text-xs text-zinc-400 cursor-pointer whitespace-nowrap">Random</label>
                      </div>
                    </Field>
                  </div>
                </>
              )}
            </div>
          )}

          {/* ── Compose mode ──────────────────────────────────────────────── */}
          {mode === 'compose' && (
            <div className="space-y-2 mb-2">
              <div className={`grid gap-3 ${complexity === 'simple' ? 'grid-cols-1' : 'grid-cols-[1fr_160px]'}`}>
                <Field label={complexity === 'simple' ? 'Describe the new instrument / layer' : 'New instrument / description'}>
                  <input type="text" value={prompt} onChange={e => setPrompt(e.target.value)}
                    placeholder="e.g. warm fingerpicked acoustic guitar, punchy funk bass…" className={inputCls} />
                </Field>
                {complexity === 'advanced' && (
                  <Field label="Style">
                    <input type="text" value={style} onChange={e => setStyle(e.target.value)}
                      placeholder="e.g. lo-fi, cinematic…" className={inputCls} />
                  </Field>
                )}
              </div>

              {/* Context clip multi-select */}
              <Field label={`Context clips — ACE-Step will match their harmonic/stylistic feel (${contextClipIds.size} selected)`}>
                <div className="flex flex-wrap gap-1.5 mt-1">
                  {realClips.length === 0 && (
                    <span className="text-[10px] text-zinc-500 italic">No audio clips yet — generating without context.</span>
                  )}
                  {realClips.map(clip => {
                    const checked = contextClipIds.has(clip.id);
                    return (
                      <button
                        key={clip.id}
                        onClick={() => toggleContext(clip.id)}
                        className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium border transition-colors ${
                          checked
                            ? 'bg-violet-600/30 border-violet-500 text-violet-200'
                            : 'bg-zinc-800 border-zinc-700 text-zinc-400 hover:border-zinc-500 hover:text-zinc-200'
                        }`}
                      >
                        <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${checked ? 'bg-violet-400' : 'bg-zinc-600'}`} />
                        {clip.name}
                      </button>
                    );
                  })}
                </div>
              </Field>

              {complexity === 'advanced' && (
                <>
                  <Field label="Lyrics (optional)">
                    <textarea value={lyrics} onChange={e => setLyrics(e.target.value)}
                      rows={2} placeholder="[Verse] lyrics here…" className={`${inputCls} resize-none`} />
                  </Field>
                  <div className="grid gap-2" style={{ gridTemplateColumns: 'repeat(5, 1fr)' }}>
                    <Field label="Steps"><NumInput value={inferenceSteps} onChange={setInferenceSteps} min={1} max={200} /></Field>
                    <Field label="Guidance"><NumInput value={guidanceScale} onChange={setGuidanceScale} min={0} max={30} step={0.5} /></Field>
                    <Field label="Method">
                      <select value={inferMethod} onChange={e => setInferMethod(e.target.value as 'ode' | 'sde')} className={inputCls}>
                        <option value="ode">ODE</option>
                        <option value="sde">SDE</option>
                      </select>
                    </Field>
                    <Field label="Seed"><NumInput value={seed} onChange={setSeed} disabled={useRandomSeed} /></Field>
                    <Field label=" ">
                      <div className="flex items-center gap-1.5 pt-1">
                        <input type="checkbox" id="com-rand" checked={useRandomSeed}
                          onChange={e => setUseRandomSeed(e.target.checked)} className="accent-pink-500" />
                        <label htmlFor="com-rand" className="text-xs text-zinc-400 cursor-pointer whitespace-nowrap">Random</label>
                      </div>
                    </Field>
                  </div>
                </>
              )}
            </div>
          )}

          {/* Submit row */}
          <div className="flex items-center gap-3">
            <button
              onClick={handleSubmit}
              disabled={loading || (mode === 'repaint' && !sourceClipId)}
              className={`flex items-center gap-1.5 px-4 py-1.5 rounded text-white text-xs font-semibold disabled:opacity-40 transition-colors ${MODE_ACCENT[mode]}`}
            >
              {loading
                ? <RefreshCw size={11} className="animate-spin" />
                : mode === 'repaint' ? <Paintbrush size={11} />
                : mode === 'compose' ? <Music2 size={11} />
                :                      <Wand2 size={11} />}
              {mode === 'repaint' ? 'Start Repaint' : mode === 'compose' ? 'Compose' : 'Generate'}
            </button>
            {error && <span className="text-xs text-red-400">{error}</span>}
          </div>
        </div>
      )}

      {/* ── Progress ────────────────────────────────────────────────────────── */}
      {showProgress && (
        <div className="px-4 py-2.5 border-b border-zinc-700/60 flex items-center gap-3">
          <RefreshCw size={13} className="animate-spin text-pink-400 flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <div className="flex justify-between text-[10px] mb-1">
              <span className="text-zinc-400 truncate">
                {jobStage || (
                  pendingJob?.mode === 'repaint' ? 'Repainting…' :
                  pendingJob?.mode === 'compose' ? 'Composing…' : 'Generating…'
                )}
              </span>
              <span className="text-pink-400 font-mono ml-2 flex-shrink-0">{Math.round(jobProgress * 100)}%</span>
            </div>
            <div className="h-1 bg-zinc-700 rounded-full overflow-hidden">
              <div className="h-full bg-pink-500 rounded-full transition-[width]"
                style={{ width: `${Math.max(5, jobProgress * 100)}%` }} />
            </div>
          </div>
          <span className="text-[10px] text-zinc-500 flex-shrink-0">{pendingJob?.rowName}</span>
        </div>
      )}

      {/* ── Toolbar ───────────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-1.5 px-3 py-1.5">
        <button onClick={() => fileInputRef.current?.click()}
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded text-xs font-medium text-zinc-300 hover:bg-zinc-800 hover:text-white transition-colors">
          <Upload size={13} /> Upload Audio
        </button>
        <button onClick={() => setShowMixdown(true)}
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded text-xs font-medium text-zinc-300 hover:bg-zinc-800 hover:text-white transition-colors">
          <Layers size={13} /> Mixdown
        </button>
        <div className="flex-1" />
        <button onClick={closeStudio}
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded text-xs font-medium text-zinc-500 hover:bg-zinc-800 hover:text-red-400 transition-colors">
          <X size={13} /> Close Session
        </button>
      </div>

      <input ref={fileInputRef} type="file" accept="audio/*" className="hidden" onChange={handleFileChange} />
      {showMixdown && <StudioMixdownDialog onClose={() => setShowMixdown(false)} />}
    </div>
  );
};

export default StudioBottomPanel;
