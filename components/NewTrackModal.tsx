import React, { useState, useRef, useEffect } from 'react';
import { X, Music, ChevronDown, Upload, Loader2, Sparkles } from 'lucide-react';
import type { Track } from '../types';
import { generateApi, tracksApi } from '../services/api';

interface NewTrackModalProps {
  isOpen: boolean;
  onClose: () => void;
  workspaceId: string;
  projectId?: string;
  onTrackCreated?: (track: Track) => void;
}

const KEY_SIGS = [
  'C major', 'C minor', 'C# major', 'C# minor', 'Db major', 'Db minor',
  'D major', 'D minor', 'D# major', 'D# minor', 'Eb major', 'Eb minor',
  'E major', 'E minor', 'F major', 'F minor', 'F# major', 'F# minor',
  'Gb major', 'Gb minor', 'G major', 'G minor', 'G# major', 'G# minor',
  'Ab major', 'Ab minor', 'A major', 'A minor', 'A# major', 'A# minor',
  'Bb major', 'Bb minor', 'B major', 'B minor',
];

export default function NewTrackModal({
  isOpen,
  onClose,
  workspaceId,
  projectId,
  onTrackCreated,
}: NewTrackModalProps) {
  const [taskType, setTaskType] = useState<'text2music' | 'audio2audio' | 'cover'>('text2music');
  const [prompt, setPrompt] = useState('');
  const [style, setStyle] = useState('');
  const [duration, setDuration] = useState(30);
  const [sourceAudioFile, setSourceAudioFile] = useState<File | null>(null);
  const [sourceAudioUrl, setSourceAudioUrl] = useState('');
  const [isUploadingAudio, setIsUploadingAudio] = useState(false);

  // Advanced
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [bpm, setBpm] = useState(0);
  const [keyScale, setKeyScale] = useState('');
  const [timeSignature, setTimeSignature] = useState('');
  const [inferenceSteps, setInferenceSteps] = useState(12);
  const [guidanceScale, setGuidanceScale] = useState(9.0);

  // Generation state
  const [isGenerating, setIsGenerating] = useState(false);
  const [progress, setProgress] = useState(0);
  const [stage, setStage] = useState('');
  const [error, setError] = useState<string | null>(null);

  const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!isOpen) {
      stopPolling();
      resetForm();
    }
  }, [isOpen]);

  const stopPolling = () => {
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = null;
    }
  };

  const resetForm = () => {
    setTaskType('text2music');
    setPrompt('');
    setStyle('');
    setDuration(30);
    setSourceAudioFile(null);
    setSourceAudioUrl('');
    setIsUploadingAudio(false);
    setShowAdvanced(false);
    setBpm(0);
    setKeyScale('');
    setTimeSignature('');
    setInferenceSteps(12);
    setGuidanceScale(9.0);
    setIsGenerating(false);
    setProgress(0);
    setStage('');
    setError(null);
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
    } catch (err) {
      setError('Failed to upload audio file. Please try again.');
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

    try {
      const job = await generateApi.startGeneration({
        customMode: true,
        prompt,
        lyrics: prompt,
        style,
        title: '',
        instrumental: !prompt.trim(),
        vocalLanguage: 'en',
        bpm,
        keyScale,
        timeSignature,
        duration,
        inferenceSteps,
        guidanceScale,
        batchSize: 1,
        randomSeed: true,
        seed: -1,
        thinking: false,
        audioFormat: 'mp3',
        inferMethod: 'ode',
        shift: 3.0,
        lmTemperature: 0.8,
        lmCfgScale: 2.2,
        lmTopK: 0,
        lmTopP: 0.92,
        lmNegativePrompt: '',
        taskType,
        ...(sourceAudioUrl && taskType !== 'text2music'
          ? { sourceAudioUrl }
          : {}),
      });

      const jobId = job.jobId || job.id;
      if (!jobId) {
        throw new Error('No job ID returned from generation start');
      }

      pollIntervalRef.current = setInterval(async () => {
        try {
          const status = await generateApi.getStatus(jobId);
          setProgress(status.progress ?? 0);
          setStage(status.stage ?? 'Processing...');

          if (status.status === 'succeeded') {
            stopPolling();
            const audioUrl = status.result?.audioUrls?.[0];

            const track = await tracksApi.create({
              title: prompt
                ? prompt.split('\n')[0].slice(0, 80) || 'Generated Track'
                : 'Generated Track',
              workspace_id: workspaceId,
              ...(projectId ? { project_id: projectId } : {}),
              audio_url: audioUrl,
              task_type: taskType,
              ...(prompt ? { prompt, lyrics: prompt } : {}),
              ...(style ? { style } : {}),
              duration: status.result?.duration ?? duration,
              ...(status.result?.bpm
                ? { bpm: status.result.bpm }
                : bpm > 0
                ? { bpm }
                : {}),
              ...(status.result?.keyScale
                ? { key_scale: status.result.keyScale }
                : keyScale
                ? { key_scale: keyScale }
                : {}),
              ...(status.result?.timeSignature
                ? { time_signature: status.result.timeSignature }
                : timeSignature
                ? { time_signature: timeSignature }
                : {}),
              tags: style
                ? style
                    .split(',')
                    .map((s) => s.trim())
                    .filter(Boolean)
                : [],
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
          setError(err instanceof Error ? err.message : 'Failed to check generation status');
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

  return (
    <div
      className="fixed inset-0 bg-black/50 z-[70] flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-white dark:bg-zinc-900 rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto custom-scrollbar"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-zinc-200 dark:border-white/5">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-pink-500 to-purple-600 flex items-center justify-center flex-shrink-0">
              <Sparkles size={18} className="text-white" />
            </div>
            <h2 className="text-xl font-bold text-zinc-900 dark:text-white">New Track</h2>
          </div>
          <button
            onClick={onClose}
            disabled={isGenerating}
            className="p-2 hover:bg-zinc-100 dark:hover:bg-white/5 rounded-full transition-colors disabled:opacity-40"
          >
            <X size={20} className="text-zinc-500" />
          </button>
        </div>

        <div className="p-6 space-y-6">
          {/* Task Type Tabs */}
          <div>
            <label className="text-xs font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-wide mb-2 block">
              Task Type
            </label>
            <div className="flex items-center bg-zinc-100 dark:bg-black/40 rounded-xl p-1 gap-1">
              {(
                [
                  { value: 'text2music', label: 'Text to Music' },
                  { value: 'audio2audio', label: 'Audio to Audio' },
                  { value: 'cover', label: 'Cover / Reference' },
                ] as const
              ).map(({ value, label }) => (
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

          {/* Prompt / Lyrics */}
          <div>
            <label className="text-xs font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-wide mb-2 block">
              Prompt / Lyrics
            </label>
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              disabled={isGenerating}
              placeholder="Describe your track or add lyrics..."
              className="w-full h-28 bg-zinc-50 dark:bg-black/20 border border-zinc-200 dark:border-white/10 rounded-xl px-4 py-3 text-sm text-zinc-900 dark:text-white placeholder-zinc-400 dark:placeholder-zinc-600 focus:outline-none focus:border-pink-500 dark:focus:border-pink-500 resize-none transition-colors disabled:opacity-50"
            />
          </div>

          {/* Style */}
          <div>
            <label className="text-xs font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-wide mb-2 block">
              Style
            </label>
            <input
              type="text"
              value={style}
              onChange={(e) => setStyle(e.target.value)}
              disabled={isGenerating}
              placeholder="lo-fi, chill, 90s hip hop..."
              className="w-full bg-zinc-50 dark:bg-black/20 border border-zinc-200 dark:border-white/10 rounded-xl px-4 py-3 text-sm text-zinc-900 dark:text-white placeholder-zinc-400 dark:placeholder-zinc-600 focus:outline-none focus:border-pink-500 dark:focus:border-pink-500 transition-colors disabled:opacity-50"
            />
          </div>

          {/* Duration */}
          <div>
            <label className="text-xs font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-wide mb-2 block">
              Duration (seconds)
            </label>
            <input
              type="number"
              value={duration}
              onChange={(e) =>
                setDuration(Math.max(5, Math.min(240, Number(e.target.value) || 30)))
              }
              disabled={isGenerating}
              min={5}
              max={240}
              step={5}
              className="w-full bg-zinc-50 dark:bg-black/20 border border-zinc-200 dark:border-white/10 rounded-xl px-4 py-3 text-sm text-zinc-900 dark:text-white focus:outline-none focus:border-pink-500 dark:focus:border-pink-500 transition-colors disabled:opacity-50"
            />
          </div>

          {/* Source Audio Upload (audio2audio / cover) */}
          {needsAudio && (
            <div>
              <label className="text-xs font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-wide mb-2 block">
                {taskType === 'cover' ? 'Cover Reference Audio' : 'Source Audio'}
              </label>
              <input
                ref={fileInputRef}
                type="file"
                accept="audio/*"
                onChange={handleFileChange}
                className="hidden"
              />
              {sourceAudioFile ? (
                <div className="flex items-center gap-3 p-3 bg-zinc-50 dark:bg-black/20 border border-zinc-200 dark:border-white/10 rounded-xl">
                  {isUploadingAudio ? (
                    <Loader2 size={16} className="text-pink-500 animate-spin flex-shrink-0" />
                  ) : (
                    <Music size={16} className="text-pink-500 flex-shrink-0" />
                  )}
                  <span className="text-sm text-zinc-700 dark:text-zinc-300 truncate flex-1">
                    {sourceAudioFile.name}
                  </span>
                  <button
                    onClick={() => {
                      setSourceAudioFile(null);
                      setSourceAudioUrl('');
                    }}
                    disabled={isGenerating || isUploadingAudio}
                    className="text-zinc-400 hover:text-zinc-900 dark:hover:text-white transition-colors disabled:opacity-40"
                  >
                    <X size={16} />
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isGenerating}
                  className="w-full flex items-center justify-center gap-2 p-4 border-2 border-dashed border-zinc-300 dark:border-white/10 rounded-xl text-zinc-500 dark:text-zinc-400 hover:border-pink-500 dark:hover:border-pink-500 hover:text-pink-500 dark:hover:text-pink-400 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Upload size={16} />
                  <span className="text-sm font-medium">Upload audio file</span>
                </button>
              )}
            </div>
          )}

          {/* Advanced Parameters Accordion */}
          <div>
            <button
              type="button"
              onClick={() => setShowAdvanced(!showAdvanced)}
              disabled={isGenerating}
              className="flex items-center gap-2 text-sm font-semibold text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white transition-colors disabled:opacity-50"
            >
              <ChevronDown
                size={16}
                className={`transition-transform duration-200 ${showAdvanced ? 'rotate-180' : ''}`}
              />
              Advanced Parameters
            </button>

            {showAdvanced && (
              <div className="mt-4 space-y-5 pl-6 border-l-2 border-zinc-200 dark:border-white/10">
                {/* BPM */}
                <div>
                  <label className="text-xs font-medium text-zinc-500 dark:text-zinc-400 mb-1.5 block">
                    BPM <span className="text-zinc-400 dark:text-zinc-500">(0 = auto)</span>
                  </label>
                  <input
                    type="number"
                    value={bpm}
                    onChange={(e) =>
                      setBpm(Math.max(0, Math.min(300, Number(e.target.value) || 0)))
                    }
                    disabled={isGenerating}
                    min={0}
                    max={300}
                    className="w-full bg-zinc-50 dark:bg-black/20 border border-zinc-200 dark:border-white/10 rounded-lg px-3 py-2 text-sm text-zinc-900 dark:text-white focus:outline-none focus:border-pink-500 dark:focus:border-pink-500 transition-colors disabled:opacity-50"
                  />
                </div>

                {/* Key / Scale */}
                <div>
                  <label className="text-xs font-medium text-zinc-500 dark:text-zinc-400 mb-1.5 block">
                    Key / Scale
                  </label>
                  <select
                    value={keyScale}
                    onChange={(e) => setKeyScale(e.target.value)}
                    disabled={isGenerating}
                    className="w-full bg-zinc-50 dark:bg-black/20 border border-zinc-200 dark:border-white/10 rounded-lg px-3 py-2 text-sm text-zinc-900 dark:text-white focus:outline-none focus:border-pink-500 dark:focus:border-pink-500 transition-colors disabled:opacity-50 [&>option]:bg-white [&>option]:dark:bg-zinc-800"
                  >
                    <option value="">Auto</option>
                    {KEY_SIGS.map((k) => (
                      <option key={k} value={k}>
                        {k}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Time Signature */}
                <div>
                  <label className="text-xs font-medium text-zinc-500 dark:text-zinc-400 mb-1.5 block">
                    Time Signature
                  </label>
                  <select
                    value={timeSignature}
                    onChange={(e) => setTimeSignature(e.target.value)}
                    disabled={isGenerating}
                    className="w-full bg-zinc-50 dark:bg-black/20 border border-zinc-200 dark:border-white/10 rounded-lg px-3 py-2 text-sm text-zinc-900 dark:text-white focus:outline-none focus:border-pink-500 dark:focus:border-pink-500 transition-colors disabled:opacity-50 [&>option]:bg-white [&>option]:dark:bg-zinc-800"
                  >
                    <option value="">Auto</option>
                    {['2', '3', '4', '6'].map((t) => (
                      <option key={t} value={t}>
                        {t}/4
                      </option>
                    ))}
                  </select>
                </div>

                {/* Inference Steps */}
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
                      Inference Steps
                    </label>
                    <span className="text-xs font-semibold text-zinc-900 dark:text-white">
                      {inferenceSteps}
                    </span>
                  </div>
                  <input
                    type="range"
                    min={1}
                    max={50}
                    step={1}
                    value={inferenceSteps}
                    onChange={(e) => setInferenceSteps(Number(e.target.value))}
                    disabled={isGenerating}
                    className="w-full accent-pink-500 disabled:opacity-50"
                  />
                </div>

                {/* CFG Strength */}
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
                      CFG Strength
                    </label>
                    <span className="text-xs font-semibold text-zinc-900 dark:text-white">
                      {guidanceScale.toFixed(1)}
                    </span>
                  </div>
                  <input
                    type="range"
                    min={1}
                    max={20}
                    step={0.5}
                    value={guidanceScale}
                    onChange={(e) => setGuidanceScale(Number(e.target.value))}
                    disabled={isGenerating}
                    className="w-full accent-pink-500 disabled:opacity-50"
                  />
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

        {/* Footer */}
        <div className="border-t border-zinc-200 dark:border-white/5 p-6 flex justify-end gap-3">
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
            {isGenerating ? (
              <>
                <Loader2 size={16} className="animate-spin" />
                Generating...
              </>
            ) : (
              <>
                <Sparkles size={16} />
                Generate
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
