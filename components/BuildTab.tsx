import React, { useState, useRef, useCallback, useEffect } from 'react';
import {
  Upload, Music, X, Loader2, Sparkles, RefreshCw, Check,
  Plus, ChevronDown, ChevronUp, Mic, Layers, Scissors,
} from 'lucide-react';
import type { Track } from '../types';
import { generateApi, tracksApi } from '../services/api';

// ─── Constants ───────────────────────────────────────────────────────────────

const BASE_MODEL = 'acestep-v15-base';   // required for lego + extract
const DEFAULT_MODEL = 'acestep-v15-turbo';

const DIT_MODELS = [
  { value: 'acestep-v15-turbo', label: 'Turbo', note: 'Fast, full arrangement' },
  { value: 'acestep-v15-base',  label: 'Base',  note: 'Slower, better isolation' },
  { value: 'acestep-v15-sft',   label: 'SFT',   note: 'Most controllable' },
];

const STEM_TYPES = [
  { value: 'vocals',  label: 'Vocals' },
  { value: 'drums',   label: 'Drums' },
  { value: 'bass',    label: 'Bass' },
  { value: 'guitar',  label: 'Guitar' },
  { value: 'piano',   label: 'Piano / Keys' },
  { value: 'strings', label: 'Strings' },
  { value: 'other',   label: 'Other...' },
];

// ─── Layer state ─────────────────────────────────────────────────────────────

type LayerMode = 'generate' | 'extract';
type LayerStatus = 'configuring' | 'generating' | 'done' | 'extracting-stems' | 'error';

interface ExtractedStem {
  stemType: string;
  label: string;
  jobId: string;
  status: 'running' | 'done' | 'error';
  audioUrl?: string;
}

interface LayerState {
  id: string;
  index: number;
  // config
  mode: LayerMode;
  prompt: string;
  ditModel: string;
  // extract (upload path)
  uploadedFile: File | null;
  uploadedAudioUrl: string;
  stemType: string;
  customStemType: string;
  // post-generation stem extraction
  extractEngine: 'acestep' | 'demucs';
  extractedStems: ExtractedStem[];
  // result
  status: LayerStatus;
  jobId: string | null;
  mixAudioUrl: string | null;
  error: string | null;
  // alternatives
  alternatives: string[];
  activeAlt: number;
  // ui
  collapsed: boolean;
}

function makeLayer(index: number): LayerState {
  return {
    id: `layer-${Date.now()}-${index}`,
    index,
    mode: 'generate',
    prompt: '',
    ditModel: DEFAULT_MODEL,
    uploadedFile: null,
    uploadedAudioUrl: '',
    stemType: 'vocals',
    customStemType: '',
    extractEngine: 'demucs',
    extractedStems: [],
    status: 'configuring',
    jobId: null,
    mixAudioUrl: null,
    error: null,
    alternatives: [],
    activeAlt: 0,
    collapsed: false,
  };
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function AudioPreview({ url, label }: { url: string; label?: string }) {
  return (
    <div className="space-y-1">
      {label && <p className="text-[11px] text-zinc-400 dark:text-zinc-500 uppercase tracking-wide font-medium">{label}</p>}
      <audio
        src={url}
        controls
        className="w-full h-9 [&::-webkit-media-controls-panel]:bg-zinc-100 dark:[&::-webkit-media-controls-panel]:bg-zinc-800 rounded-lg"
      />
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

interface BuildTabProps {
  workspaceId: string;
  projectId?: string;
  onTrackCreated?: (track: Track) => void;
  onClose: () => void;
}

export default function BuildTab({ workspaceId, projectId, onTrackCreated, onClose }: BuildTabProps) {
  const [layers, setLayers] = useState<LayerState[]>([makeLayer(0)]);
  const [isFinishing, setIsFinishing] = useState(false);
  const [globalError, setGlobalError] = useState<string | null>(null);
  const [trackTitle, setTrackTitle] = useState('');
  const pollRefs = useRef<Map<string, ReturnType<typeof setInterval>>>(new Map());
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadingLayerId, setUploadingLayerId] = useState<string | null>(null);

  useEffect(() => {
    return () => { pollRefs.current.forEach(id => clearInterval(id)); };
  }, []);

  const stopPoll = (layerId: string) => {
    const ref = pollRefs.current.get(layerId);
    if (ref) { clearInterval(ref); pollRefs.current.delete(layerId); }
  };

  const updateLayer = useCallback((id: string, patch: Partial<LayerState>) => {
    setLayers(prev => prev.map(l => l.id === id ? { ...l, ...patch } : l));
  }, []);

  // ── File upload ────────────────────────────────────────────────────────────

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>, layerId: string) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';
    setUploadingLayerId(layerId);
    updateLayer(layerId, { uploadedFile: file, error: null });
    try {
      const result = await generateApi.uploadAudio(file);
      updateLayer(layerId, { uploadedAudioUrl: result.url });
    } catch {
      updateLayer(layerId, { error: 'Failed to upload audio.', uploadedFile: null });
    } finally {
      setUploadingLayerId(null);
    }
  };

  // ── Poll helper ────────────────────────────────────────────────────────────

  const pollJob = (
    layerId: string,
    jobId: string,
    onResult: (audioUrl: string) => void,
    onFail: (err: string) => void,
  ) => {
    const interval = setInterval(async () => {
      try {
        const status = await generateApi.getStatus(jobId);
        if (status.status === 'succeeded') {
          stopPoll(layerId);
          const audioUrl = status.result?.audioUrls?.[0];
          if (!audioUrl) { onFail('No audio returned from generation'); return; }
          onResult(audioUrl);
        } else if (status.status === 'failed') {
          stopPoll(layerId);
          onFail(status.error || 'Generation failed');
        }
      } catch {
        stopPoll(layerId);
        onFail('Lost connection while polling status');
      }
    }, 2000);
    pollRefs.current.set(layerId, interval);
  };

  // ── Generate layer ─────────────────────────────────────────────────────────

  const handleGenerate = async (layerId: string) => {
    const currentLayers = layers;
    const layerIdx = currentLayers.findIndex(l => l.id === layerId);
    const layer = currentLayers[layerIdx];
    const prevMixUrl = layerIdx > 0 ? currentLayers[layerIdx - 1].mixAudioUrl : null;
    if (!layer) return;

    updateLayer(layerId, { status: 'generating', error: null, showStemExtract: false });

    try {
      const common = {
        customMode: true as const,
        lyrics: '',
        title: '',
        instrumental: true,
        randomSeed: true,
        audioFormat: 'flac' as const,
        skipTrackCreate: true,
        workspace_id: workspaceId,
        ...(projectId ? { project_id: projectId } : {}),
      };

      let job: { jobId?: string; id?: string };

      if (layerIdx === 0 && layer.mode === 'extract') {
        const stemName = layer.stemType === 'other'
          ? (layer.customStemType.trim() || 'stem')
          : layer.stemType;
        job = await generateApi.startGeneration({
          ...common,
          ditModel: BASE_MODEL,
          style: stemName,
          taskType: 'extract',
          sourceAudioUrl: layer.uploadedAudioUrl,
          trackName: stemName,
        } as any);
      } else if (layerIdx === 0) {
        job = await generateApi.startGeneration({
          ...common,
          ditModel: layer.ditModel,
          style: layer.prompt,
          taskType: 'text2music',
        } as any);
      } else {
        const trackHint = layer.prompt.split(',')[0].trim();
        job = await generateApi.startGeneration({
          ...common,
          ditModel: BASE_MODEL,
          style: layer.prompt,
          taskType: 'lego',
          sourceAudioUrl: prevMixUrl!,
          trackName: trackHint,
        } as any);
      }

      const jobId = (job.jobId || (job as any).id) as string;
      if (!jobId) throw new Error('No job ID returned');
      updateLayer(layerId, { jobId });

      pollJob(
        layerId,
        jobId,
        (audioUrl) => {
          setLayers(prev => prev.map(l => {
            if (l.id !== layerId) return l;
            const newAlts = l.mixAudioUrl ? [...l.alternatives, l.mixAudioUrl] : l.alternatives;
            return { ...l, status: 'done', mixAudioUrl: audioUrl, alternatives: newAlts, activeAlt: newAlts.length };
          }));
        },
        (err) => updateLayer(layerId, { status: 'error', error: err }),
      );
    } catch (err) {
      updateLayer(layerId, {
        status: 'error',
        error: err instanceof Error ? err.message : 'Generation failed',
      });
    }
  };

  // ── Extract all stems in parallel, let user pick one ─────────────────────

  const handleExtractStems = async (layerId: string) => {
    const layer = layers.find(l => l.id === layerId);
    if (!layer?.mixAudioUrl) return;

    const stemsToExtract = STEM_TYPES.filter(s => s.value !== 'other');

    // Initialise all stems as 'running' immediately so the UI shows the grid
    const initialStems: ExtractedStem[] = stemsToExtract.map(s => ({
      stemType: s.value,
      label: s.label,
      jobId: '',
      status: 'running',
    }));
    updateLayer(layerId, { status: 'extracting-stems', extractedStems: initialStems, error: null });

    const sourceUrl = layer.mixAudioUrl;
    const commonParams = {
      customMode: true as const,
      lyrics: '',
      title: '',
      instrumental: true,
      randomSeed: true,
      audioFormat: 'flac' as const,
      skipTrackCreate: true,
      ditModel: BASE_MODEL,
      taskType: 'extract',
      sourceAudioUrl: sourceUrl,
      workspace_id: workspaceId,
      ...(projectId ? { project_id: projectId } : {}),
    };

    // Fire all jobs, update each stem's jobId as they're queued
    await Promise.allSettled(
      stemsToExtract.map(async (s) => {
        try {
          const job = await generateApi.startGeneration({
            ...commonParams,
            style: s.value,
            trackName: s.value,
          } as any);
          const jobId = (job.jobId || (job as any).id) as string;
          if (!jobId) throw new Error('No job ID');

          // Store the jobId
          setLayers(prev => prev.map(l => {
            if (l.id !== layerId) return l;
            return {
              ...l,
              extractedStems: l.extractedStems.map(es =>
                es.stemType === s.value ? { ...es, jobId } : es
              ),
            };
          }));

          // Poll this specific stem — use a unique poll key per stem
          const pollKey = `${layerId}-${s.value}`;
          const interval = setInterval(async () => {
            try {
              const status = await generateApi.getStatus(jobId);
              if (status.status === 'succeeded') {
                clearInterval(interval);
                pollRefs.current.delete(pollKey);
                const audioUrl = status.result?.audioUrls?.[0];
                setLayers(prev => prev.map(l => {
                  if (l.id !== layerId) return l;
                  const updatedStems = l.extractedStems.map(es =>
                    es.stemType === s.value
                      ? { ...es, status: 'done' as const, audioUrl }
                      : es
                  );
                  return {
                    ...l,
                    extractedStems: updatedStems,
                  };
                }));
              } else if (status.status === 'failed') {
                clearInterval(interval);
                pollRefs.current.delete(pollKey);
                setLayers(prev => prev.map(l => {
                  if (l.id !== layerId) return l;
                  return {
                    ...l,
                    extractedStems: l.extractedStems.map(es =>
                      es.stemType === s.value ? { ...es, status: 'error' as const } : es
                    ),
                  };
                }));
              }
            } catch {
              clearInterval(interval);
              pollRefs.current.delete(pollKey);
            }
          }, 2000);
          pollRefs.current.set(pollKey, interval);
        } catch {
          setLayers(prev => prev.map(l => {
            if (l.id !== layerId) return l;
            return {
              ...l,
              extractedStems: l.extractedStems.map(es =>
                es.stemType === s.value ? { ...es, status: 'error' as const } : es
              ),
            };
          }));
        }
      })
    );
  };

  // ── Extract all stems via Demucs ──────────────────────────────────────────

  const handleExtractStemsDemucs = async (layerId: string) => {
    const layer = layers.find(l => l.id === layerId);
    if (!layer?.mixAudioUrl) return;

    // Demucs htdemucs_6s gives us the most stems (vocals, drums, bass, guitar, piano, other)
    const DEMUCS_STEMS = ['vocals', 'drums', 'bass', 'guitar', 'piano', 'other'];
    const initialStems: ExtractedStem[] = DEMUCS_STEMS.map(s => ({
      stemType: s,
      label: STEM_TYPES.find(st => st.value === s)?.label ?? s,
      jobId: '',
      status: 'running',
    }));
    updateLayer(layerId, { status: 'extracting-stems', extractedStems: initialStems, error: null });

    try {
      const { jobId } = await tracksApi.demucs({ audioUrl: layer.mixAudioUrl, model: 'htdemucs_6s' });

      const interval = setInterval(async () => {
        try {
          const result = await tracksApi.getDemucsJob(jobId);
          if (result.status === 'succeeded' && result.stems) {
            clearInterval(interval);
            pollRefs.current.delete(`demucs-${layerId}`);
            const updatedStems: ExtractedStem[] = result.stems.map(s => ({
              stemType: s.instrument_class,
              label: STEM_TYPES.find(st => st.value === s.instrument_class)?.label ?? s.instrument_class,
              jobId,
              status: 'done' as const,
              audioUrl: s.audio_url,
            }));
            setLayers(prev => prev.map(l =>
              l.id === layerId
                ? { ...l, extractedStems: updatedStems }
                : l
            ));
          } else if (result.status === 'failed') {
            clearInterval(interval);
            pollRefs.current.delete(`demucs-${layerId}`);
            updateLayer(layerId, { status: 'error', error: result.error || 'Demucs failed', extractedStems: [] });
          }
        } catch {
          clearInterval(interval);
          pollRefs.current.delete(`demucs-${layerId}`);
          updateLayer(layerId, { status: 'error', error: 'Lost connection while polling', extractedStems: [] });
        }
      }, 3000);
      pollRefs.current.set(`demucs-${layerId}`, interval);
    } catch (err) {
      updateLayer(layerId, {
        status: 'error',
        error: err instanceof Error ? err.message : 'Demucs failed',
        extractedStems: [],
      });
    }
  };

  // User selects one extracted stem to use as this layer's audio
  const handleSelectStem = (layerId: string, audioUrl: string) => {
    setLayers(prev => prev.map(l => {
      if (l.id !== layerId) return l;
      const newAlts = l.mixAudioUrl ? [...l.alternatives, l.mixAudioUrl] : l.alternatives;
      return {
        ...l,
        mixAudioUrl: audioUrl,
        alternatives: newAlts,
        extractedStems: [], // clear the picker
        status: 'done',
      };
    }));
  };

  const handleRegenerate = (layerId: string) => {
    setLayers(prev => {
      const idx = prev.findIndex(l => l.id === layerId);
      return prev.slice(0, idx + 1);
    });
    handleGenerate(layerId);
  };

  const handleSelectAlt = (layerId: string, altIndex: number) => {
    setLayers(prev => prev.map(l => {
      if (l.id !== layerId) return l;
      const allResults = [...l.alternatives, l.mixAudioUrl!];
      const picked = allResults[altIndex];
      const remaining = allResults.filter((_, i) => i !== altIndex);
      return { ...l, alternatives: remaining, mixAudioUrl: picked, activeAlt: altIndex };
    }));
  };

  const handleAcceptLayer = (layerId: string) => {
    updateLayer(layerId, { collapsed: true });
    setLayers(prev => {
      const idx = prev.findIndex(l => l.id === layerId);
      if (idx < prev.length - 1) return prev;
      return [...prev, makeLayer(prev.length)];
    });
  };

  const handleRemoveLayer = (layerId: string) => {
    setLayers(prev => {
      const idx = prev.findIndex(l => l.id === layerId);
      return prev.slice(0, idx);
    });
  };

  // ── Finish ─────────────────────────────────────────────────────────────────

  const doneLayers = layers.filter(l => l.status === 'done');
  const canFinish = doneLayers.length >= 1;

  const handleFinish = async () => {
    const lastDone = doneLayers[doneLayers.length - 1];
    if (!lastDone?.mixAudioUrl) return;
    setIsFinishing(true);
    setGlobalError(null);
    try {
      const title = trackTitle.trim() || `Built Track (${doneLayers.length} layer${doneLayers.length > 1 ? 's' : ''})`;
      const track = await tracksApi.create({
        title,
        workspace_id: workspaceId,
        ...(projectId ? { project_id: projectId } : {}),
        audio_url: lastDone.mixAudioUrl,
        task_type: 'lego',
        tags: [],
      });
      onTrackCreated?.(track);
      onClose();
    } catch (err) {
      setGlobalError(err instanceof Error ? err.message : 'Failed to create track');
      setIsFinishing(false);
    }
  };

  // ── Render layer card ──────────────────────────────────────────────────────

  const renderLayerCard = (layer: LayerState) => {
    const isFirst = layer.index === 0;
    const isLast = layer.id === layers[layers.length - 1].id;
    const prevMixUrl = layer.index > 0 ? layers[layer.index - 1]?.mixAudioUrl : null;
    const allResults = layer.mixAudioUrl
      ? [...layer.alternatives, layer.mixAudioUrl]
      : layer.alternatives;

    const canGenerate = layer.mode === 'extract'
      ? !!layer.uploadedAudioUrl && (layer.stemType !== 'other' || !!layer.customStemType.trim())
      : !!layer.prompt.trim();

    const isWorking = layer.status === 'generating' || layer.status === 'extracting-stems';

    const statusIcon = layer.status === 'done'
      ? <Check size={12} />
      : isWorking
      ? <Loader2 size={12} className="animate-spin" />
      : layer.status === 'error' ? '!' : layer.index + 1;

    const statusColor = layer.status === 'done'
      ? 'bg-green-100 dark:bg-green-500/20 text-green-600 dark:text-green-400'
      : isWorking
      ? 'bg-pink-100 dark:bg-pink-500/20 text-pink-500'
      : layer.status === 'error'
      ? 'bg-red-100 dark:bg-red-500/20 text-red-500'
      : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-400 dark:text-zinc-500';

    return (
      <div key={layer.id} className="rounded-xl border border-zinc-200 dark:border-white/10 overflow-hidden">

        {/* Card header */}
        <div className={`flex items-center gap-3 px-4 py-3 ${layer.status === 'done' ? 'bg-zinc-50 dark:bg-white/[0.03]' : 'bg-white dark:bg-zinc-900'}`}>
          <div className={`w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 text-xs font-bold ${statusColor}`}>
            {statusIcon}
          </div>
          <span className="text-sm font-semibold text-zinc-700 dark:text-zinc-200 flex-1">
            {layer.status === 'generating'
              ? `Layer ${layer.index + 1} — Generating...`
              : layer.status === 'extracting-stems'
              ? `Layer ${layer.index + 1} — Extracting stems...`
              : layer.status === 'error' ? `Layer ${layer.index + 1} — Error`
              : `Layer ${layer.index + 1}`}
          </span>
          <div className="flex items-center gap-1">
            {(layer.status === 'done' || layer.status === 'extracting-stems') && !isFirst && (
              <button onClick={() => handleRemoveLayer(layer.id)} title="Remove this and all subsequent layers"
                className="p-1 text-zinc-400 hover:text-red-500 transition-colors">
                <X size={14} />
              </button>
            )}
            {(layer.status === 'done' || layer.status === 'extracting-stems') && (
              <button onClick={() => updateLayer(layer.id, { collapsed: !layer.collapsed })}
                className="p-1 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 transition-colors">
                {layer.collapsed ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
              </button>
            )}
          </div>
        </div>

        {/* Card body */}
        {!layer.collapsed && (
          <div className="px-4 pb-4 pt-3 space-y-4 bg-white dark:bg-zinc-900 border-t border-zinc-100 dark:border-white/5">

            {/* ── Configuring ── */}
            {layer.status === 'configuring' && (
              <>
                {/* Mode picker — first layer only */}
                {isFirst && (
                  <div className="flex items-center bg-zinc-100 dark:bg-black/40 rounded-xl p-1 gap-1">
                    {([
                      { value: 'generate', label: 'Generate', icon: <Sparkles size={11} /> },
                      { value: 'extract',  label: 'Extract from audio', icon: <Mic size={11} /> },
                    ] as const).map(({ value, label, icon }) => (
                      <button key={value} onClick={() => updateLayer(layer.id, { mode: value })}
                        className={`flex-1 flex items-center justify-center gap-1.5 py-2 px-2 rounded-lg text-xs font-semibold transition-all ${
                          layer.mode === value
                            ? 'bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white shadow-sm'
                            : 'text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200'
                        }`}
                      >
                        {icon}{label}
                      </button>
                    ))}
                  </div>
                )}

                {/* Generate mode */}
                {layer.mode === 'generate' && (
                  <div className="space-y-3">
                    <div>
                      <label className="text-xs font-medium text-zinc-500 dark:text-zinc-400 mb-1.5 block">
                        {isFirst ? 'Describe this layer' : 'Describe the layer to add on top'}
                      </label>
                      {!isFirst && prevMixUrl && (
                        <p className="text-[11px] text-zinc-400 dark:text-zinc-500 mb-2">
                          ACE-Step (Base model) will generate a complementary layer on top of your existing mix.
                        </p>
                      )}
                      <textarea
                        value={layer.prompt}
                        onChange={e => updateLayer(layer.id, { prompt: e.target.value })}
                        placeholder={isFirst ? 'e.g. fingerpicked acoustic guitar, warm folk feel...' : 'e.g. brushed drums, subtle groove, stays in background...'}
                        rows={3}
                        className="w-full bg-zinc-50 dark:bg-black/20 border border-zinc-200 dark:border-white/10 rounded-xl px-4 py-3 text-sm text-zinc-900 dark:text-white placeholder-zinc-400 dark:placeholder-zinc-600 focus:outline-none focus:border-pink-500 dark:focus:border-pink-500 resize-none transition-colors"
                      />
                    </div>

                    {/* Model selector — first layer only (lego always uses Base) */}
                    {isFirst && (
                      <div>
                        <label className="text-xs font-medium text-zinc-500 dark:text-zinc-400 mb-1.5 block">Model</label>
                        <div className="flex gap-2">
                          {DIT_MODELS.map(m => (
                            <button key={m.value} onClick={() => updateLayer(layer.id, { ditModel: m.value })}
                              className={`flex-1 flex flex-col items-start px-3 py-2 rounded-lg border text-left transition-all ${
                                layer.ditModel === m.value
                                  ? 'border-pink-400 dark:border-pink-500 bg-pink-50 dark:bg-pink-500/10'
                                  : 'border-zinc-200 dark:border-white/10 bg-zinc-50 dark:bg-black/20 hover:border-zinc-300 dark:hover:border-white/20'
                              }`}
                            >
                              <span className={`text-xs font-semibold ${layer.ditModel === m.value ? 'text-pink-700 dark:text-pink-300' : 'text-zinc-700 dark:text-zinc-200'}`}>{m.label}</span>
                              <span className="text-[10px] text-zinc-400 dark:text-zinc-500 mt-0.5">{m.note}</span>
                            </button>
                          ))}
                        </div>
                        {layer.ditModel === DEFAULT_MODEL && (
                          <p className="text-[11px] text-zinc-400 dark:text-zinc-500 mt-1.5">
                            Tip: Turbo generates a full arrangement. Use "Extract stem" after to isolate a specific instrument.
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {/* Extract mode */}
                {layer.mode === 'extract' && (
                  <div className="space-y-3">
                    <div>
                      <label className="text-xs font-medium text-zinc-500 dark:text-zinc-400 mb-1.5 block">
                        Upload audio to extract from
                      </label>
                      <input ref={fileInputRef} type="file" accept="audio/*"
                        onChange={e => handleFileChange(e, layer.id)} className="hidden" />
                      {layer.uploadedFile ? (
                        <div className="flex items-center gap-3 p-3 bg-zinc-50 dark:bg-black/20 border border-zinc-200 dark:border-white/10 rounded-xl">
                          {uploadingLayerId === layer.id
                            ? <Loader2 size={16} className="text-pink-500 animate-spin flex-shrink-0" />
                            : <Music size={16} className="text-pink-500 flex-shrink-0" />}
                          <span className="text-sm text-zinc-700 dark:text-zinc-300 truncate flex-1">{layer.uploadedFile.name}</span>
                          <button onClick={() => updateLayer(layer.id, { uploadedFile: null, uploadedAudioUrl: '' })}
                            className="text-zinc-400 hover:text-zinc-900 dark:hover:text-white transition-colors">
                            <X size={16} />
                          </button>
                        </div>
                      ) : (
                        <button onClick={() => fileInputRef.current?.click()}
                          className="w-full flex items-center justify-center gap-2 p-4 border-2 border-dashed border-zinc-300 dark:border-white/10 rounded-xl text-zinc-500 dark:text-zinc-400 hover:border-pink-500 dark:hover:border-pink-500 hover:text-pink-500 transition-colors">
                          <Upload size={16} />
                          <span className="text-sm font-medium">Upload audio file</span>
                        </button>
                      )}
                    </div>
                    <StemPicker
                      stemType={layer.stemType}
                      customStemType={layer.customStemType}
                      onChange={(stemType, customStemType) => updateLayer(layer.id, { stemType, customStemType })}
                    />
                  </div>
                )}

                {layer.error && <p className="text-xs text-red-500 dark:text-red-400">{layer.error}</p>}

                <button
                  onClick={() => handleGenerate(layer.id)}
                  disabled={!canGenerate || uploadingLayerId === layer.id}
                  className="w-full flex items-center justify-center gap-2 py-2.5 bg-gradient-to-r from-pink-500 to-purple-600 text-white text-sm font-semibold rounded-xl hover:from-pink-600 hover:to-purple-700 transition-all shadow-lg shadow-pink-500/20 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Sparkles size={15} />
                  {layer.mode === 'extract' ? 'Extract stem' : isFirst ? 'Generate layer' : 'Add layer'}
                </button>
              </>
            )}

            {/* ── Generating ── */}
            {layer.status === 'generating' && (
              <div className="flex items-center gap-3 py-3 text-sm text-zinc-500 dark:text-zinc-400">
                <Loader2 size={16} className="animate-spin text-pink-500 flex-shrink-0" />
                <span>
                  {layer.mode === 'extract' ? 'Extracting stem...'
                    : layer.index === 0 ? 'Generating first layer...'
                    : 'Adding layer to mix...'}
                </span>
              </div>
            )}

            {/* ── Extracting all stems ── */}
            {layer.status === 'extracting-stems' && (
              <div className="space-y-3">
                <div className="flex items-center gap-2 text-xs text-zinc-500 dark:text-zinc-400">
                  <Loader2 size={13} className="animate-spin text-pink-500 flex-shrink-0" />
                  {layer.extractEngine === 'demucs'
                    ? 'Demucs is separating stems — this may take a minute...'
                    : 'ACE-Step — extracting all stems, results appear as they finish'}
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {layer.extractedStems.map(stem => (
                    <div key={stem.stemType} className="p-3 rounded-xl border border-zinc-200 dark:border-white/10 bg-zinc-50 dark:bg-black/20 space-y-2">
                      <div className="flex items-center gap-2">
                        {stem.status === 'running'
                          ? <Loader2 size={11} className="animate-spin text-pink-400 flex-shrink-0" />
                          : stem.status === 'done'
                          ? <Check size={11} className="text-green-500 flex-shrink-0" />
                          : <X size={11} className="text-red-400 flex-shrink-0" />}
                        <span className="text-xs font-semibold text-zinc-700 dark:text-zinc-200">{stem.label}</span>
                      </div>
                      {stem.status === 'done' && stem.audioUrl && (
                        <>
                          <audio src={stem.audioUrl} controls
                            className="w-full h-8 [&::-webkit-media-controls-panel]:bg-zinc-100 dark:[&::-webkit-media-controls-panel]:bg-zinc-800 rounded-lg" />
                          <button
                            onClick={() => handleSelectStem(layer.id, stem.audioUrl!)}
                            className="w-full py-1.5 text-xs font-semibold bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 rounded-lg hover:bg-zinc-700 dark:hover:bg-zinc-100 transition-colors"
                          >
                            Use this
                          </button>
                        </>
                      )}
                      {stem.status === 'error' && (
                        <p className="text-[10px] text-red-400">Failed</p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* ── Error ── */}
            {layer.status === 'error' && (
              <div className="space-y-3">
                <p className="text-sm text-red-500 dark:text-red-400">{layer.error}</p>
                <button onClick={() => updateLayer(layer.id, { status: 'configuring', error: null })}
                  className="text-xs font-semibold text-zinc-500 hover:text-zinc-900 dark:hover:text-white transition-colors">
                  ← Back to settings
                </button>
              </div>
            )}

            {/* ── Done ── */}
            {layer.status === 'done' && layer.mixAudioUrl && (
              <div className="space-y-3">
                <AudioPreview
                  url={layer.mixAudioUrl}
                  label={layer.index > 0 ? `Cumulative mix — layers 1–${layer.index + 1}` : 'Result'}
                />

                {/* Alternatives / takes */}
                {allResults.length > 1 && (
                  <div className="space-y-1.5">
                    <p className="text-[11px] text-zinc-400 dark:text-zinc-500 font-medium">Takes</p>
                    <div className="flex gap-2 flex-wrap">
                      {allResults.map((url, i) => (
                        <button key={i} onClick={() => handleSelectAlt(layer.id, i)}
                          className={`px-3 py-1.5 text-xs font-semibold rounded-lg border transition-all ${
                            url === layer.mixAudioUrl
                              ? 'border-pink-400 dark:border-pink-500 bg-pink-50 dark:bg-pink-500/10 text-pink-700 dark:text-pink-300'
                              : 'border-zinc-200 dark:border-white/10 text-zinc-500 dark:text-zinc-400 hover:border-zinc-300 dark:hover:border-white/20'
                          }`}
                        >
                          {url === layer.mixAudioUrl ? `✓ Take ${i + 1}` : `Take ${i + 1}`}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Action buttons */}
                <div className="flex items-center gap-2 flex-wrap">
                  <button onClick={() => handleRegenerate(layer.id)}
                    className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold border border-zinc-200 dark:border-white/10 rounded-lg text-zinc-600 dark:text-zinc-300 hover:border-zinc-300 dark:hover:border-white/20 transition-colors">
                    <RefreshCw size={12} />
                    Regenerate
                  </button>
                  {layer.extractedStems.length === 0 && (
                    <div className="flex items-center gap-1 rounded-lg border border-zinc-200 dark:border-white/10 overflow-hidden">
                      {/* Engine selector */}
                      <div className="flex border-r border-zinc-200 dark:border-white/10">
                        {(['demucs', 'acestep'] as const).map(eng => (
                          <button key={eng} onClick={() => updateLayer(layer.id, { extractEngine: eng })}
                            title={eng === 'demucs' ? 'Demucs — high quality offline separation' : 'ACE-Step — AI-driven stem extraction'}
                            className={`px-2 py-2 text-[10px] font-bold uppercase tracking-wide transition-colors ${
                              layer.extractEngine === eng
                                ? 'bg-purple-100 dark:bg-purple-500/20 text-purple-700 dark:text-purple-300'
                                : 'text-zinc-400 dark:text-zinc-500 hover:text-zinc-600 dark:hover:text-zinc-300'
                            }`}
                          >
                            {eng === 'demucs' ? 'Demucs' : 'ACE'}
                          </button>
                        ))}
                      </div>
                      <button
                        onClick={() => layer.extractEngine === 'demucs'
                          ? handleExtractStemsDemucs(layer.id)
                          : handleExtractStems(layer.id)
                        }
                        className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-zinc-600 dark:text-zinc-300 hover:text-purple-600 dark:hover:text-purple-400 transition-colors">
                        <Scissors size={12} />
                        Extract stem
                      </button>
                    </div>
                  )}
                  {isLast && (
                    <button onClick={() => handleAcceptLayer(layer.id)}
                      className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 rounded-lg hover:bg-zinc-700 dark:hover:bg-zinc-100 transition-colors">
                      <Plus size={12} />
                      Add next layer
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-y-auto p-6 space-y-3">
        <div className="flex items-start gap-2 p-3 bg-zinc-50 dark:bg-black/20 rounded-xl border border-zinc-100 dark:border-white/5">
          <Layers size={14} className="text-zinc-400 flex-shrink-0 mt-0.5" />
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            Build a track layer by layer. Generate or extract a first stem, then keep stacking.
            Use <strong className="text-zinc-600 dark:text-zinc-300">Extract stem</strong> after any generation to isolate a specific instrument before continuing.
          </p>
        </div>

        {layers.map(layer => renderLayerCard(layer))}

        {globalError && (
          <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-500/30 rounded-xl text-sm text-red-600 dark:text-red-400">
            {globalError}
          </div>
        )}
      </div>

      {canFinish && (
        <div className="border-t border-zinc-200 dark:border-white/5 px-6 py-4 flex items-center gap-3 flex-shrink-0 bg-white dark:bg-zinc-900">
          <input
            type="text"
            value={trackTitle}
            onChange={e => setTrackTitle(e.target.value)}
            placeholder={`Built Track (${doneLayers.length} layer${doneLayers.length > 1 ? 's' : ''})`}
            className="flex-1 bg-zinc-50 dark:bg-black/20 border border-zinc-200 dark:border-white/10 rounded-xl px-4 py-2.5 text-sm text-zinc-900 dark:text-white placeholder-zinc-400 dark:placeholder-zinc-600 focus:outline-none focus:border-pink-500 dark:focus:border-pink-500 transition-colors"
          />
          <button
            onClick={handleFinish}
            disabled={isFinishing}
            className="flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-pink-500 to-purple-600 text-white text-sm font-semibold rounded-xl hover:from-pink-600 hover:to-purple-700 transition-all shadow-lg shadow-pink-500/20 disabled:opacity-60 disabled:cursor-not-allowed flex-shrink-0"
          >
            {isFinishing ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} />}
            {isFinishing ? 'Saving...' : 'Save as new track'}
          </button>
        </div>
      )}
    </div>
  );
}

// ─── StemPicker sub-component ─────────────────────────────────────────────────

function StemPicker({ stemType, customStemType, onChange }: {
  stemType: string;
  customStemType: string;
  onChange: (stemType: string, customStemType: string) => void;
}) {
  return (
    <div className="space-y-2">
      <label className="text-xs font-medium text-zinc-500 dark:text-zinc-400 block">Which stem?</label>
      <div className="flex flex-wrap gap-2">
        {STEM_TYPES.map(s => (
          <button key={s.value} onClick={() => onChange(s.value, customStemType)}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all ${
              stemType === s.value
                ? 'border-pink-400 dark:border-pink-500 bg-pink-50 dark:bg-pink-500/10 text-pink-700 dark:text-pink-300'
                : 'border-zinc-200 dark:border-white/10 text-zinc-600 dark:text-zinc-300 bg-zinc-50 dark:bg-black/20 hover:border-zinc-300 dark:hover:border-white/20'
            }`}
          >
            {s.label}
          </button>
        ))}
      </div>
      {stemType === 'other' && (
        <input type="text" value={customStemType}
          onChange={e => onChange(stemType, e.target.value)}
          placeholder="e.g. saxophone, synth pad..."
          className="w-full bg-zinc-50 dark:bg-black/20 border border-zinc-200 dark:border-white/10 rounded-xl px-4 py-2.5 text-sm text-zinc-900 dark:text-white placeholder-zinc-400 dark:placeholder-zinc-600 focus:outline-none focus:border-pink-500 dark:focus:border-pink-500 transition-colors"
        />
      )}
    </div>
  );
}
