import React, { useState, useRef } from 'react';
import { ChevronLeft, ChevronRight, Music, Copy, Check, Zap, Loader2 } from 'lucide-react';
import type { Track } from '../types';
import { useWorkspace } from '../context/WorkspaceContext';
import { generateApi } from '../services/api';
import { AlbumCover } from './AlbumCover';

interface ContextSidebarProps {
  selectedTrack: Track | null;
  onTrackCreated?: () => void;
}

export default function ContextSidebar({ selectedTrack, onTrackCreated }: ContextSidebarProps) {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [activeTab, setActiveTab] = useState<'info' | 'quickgen'>('info');
  const [copiedUrl, setCopiedUrl] = useState(false);

  // Quick Gen state
  const [qPrompt, setQPrompt] = useState('');
  const [qStyle, setQStyle] = useState('');
  const [qGenerating, setQGenerating] = useState(false);
  const [qProgress, setQProgress] = useState('');
  const [qError, setQError] = useState('');
  const pollRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { activeWorkspace } = useWorkspace();

  const copyAudioUrl = async () => {
    if (!selectedTrack?.audio_url) return;
    try {
      await navigator.clipboard.writeText(selectedTrack.audio_url);
      setCopiedUrl(true);
      setTimeout(() => setCopiedUrl(false), 2000);
    } catch {
      // clipboard not available
    }
  };

  const handleQuickGen = async () => {
    if (!activeWorkspace || !qPrompt.trim() || qGenerating) return;
    setQGenerating(true);
    setQError('');
    setQProgress('Starting…');
    try {
      const job = await generateApi.startGeneration({
        customMode: true,
        songDescription: qPrompt.trim(),
        lyrics: '',
        style: qStyle.trim() || qPrompt.trim(),
        title: '',
        instrumental: true,
        vocalLanguage: 'English',
        bpm: 120,
        keyScale: 'C major',
        timeSignature: '4/4',
        duration: 30,
        inferenceSteps: 60,
        guidanceScale: 15,
        batchSize: 1,
        randomSeed: true,
        seed: -1,
        thinking: false,
        audioFormat: 'mp3',
        inferMethod: 'ode',
        shift: 3,
        lmTemperature: 1.0,
        lmCfgScale: 3.0,
        lmTopK: 3000,
        lmTopP: 0.98,
        lmNegativePrompt: '',
        workspace_id: activeWorkspace.id,
      });

      const jobId = job.jobId || job.id;
      if (!jobId) throw new Error('No job ID returned from server');

      const poll = async () => {
        try {
          const status = await generateApi.getStatus(jobId);
          if (status.status === 'succeeded') {
            setQProgress('');
            setQGenerating(false);
            setQPrompt('');
            setQStyle('');
            onTrackCreated?.();
          } else if (status.status === 'failed') {
            setQError(status.error || 'Generation failed');
            setQGenerating(false);
            setQProgress('');
          } else {
            setQProgress(status.stage || 'Generating…');
            pollRef.current = setTimeout(poll, 2000);
          }
        } catch {
          setQError('Lost connection to server');
          setQGenerating(false);
          setQProgress('');
        }
      };
      poll();
    } catch (err) {
      setQError(err instanceof Error ? err.message : 'Failed to start generation');
      setQGenerating(false);
      setQProgress('');
    }
  };

  const formatDuration = (secs?: number) => {
    if (!secs || secs <= 0) return '—';
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  // Collapsed state — slim rail with expand button
  if (isCollapsed) {
    return (
      <div className="flex-shrink-0 w-10 flex flex-col items-center pt-4 bg-zinc-50 dark:bg-suno-panel border-l border-zinc-200 dark:border-white/5 transition-colors duration-300">
        <button
          onClick={() => setIsCollapsed(false)}
          className="p-1.5 hover:bg-zinc-200 dark:hover:bg-white/10 rounded-lg text-zinc-500 dark:text-zinc-400 transition-colors"
          title="Expand sidebar"
        >
          <ChevronLeft size={16} />
        </button>
      </div>
    );
  }

  return (
    <div className="flex-shrink-0 w-72 flex flex-col bg-zinc-50 dark:bg-suno-panel border-l border-zinc-200 dark:border-white/5 transition-colors duration-300">
        {/* Header with tabs + collapse button */}
        <div className="h-14 flex items-center justify-between px-3 border-b border-zinc-200 dark:border-white/5 flex-shrink-0">
          <div className="flex items-center gap-1 bg-zinc-200/60 dark:bg-black/30 rounded-lg p-0.5">
            <button
              onClick={() => setActiveTab('info')}
              className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${
                activeTab === 'info'
                  ? 'bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white shadow-sm'
                  : 'text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200'
              }`}
            >
              Info
            </button>
            <button
              onClick={() => setActiveTab('quickgen')}
              className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${
                activeTab === 'quickgen'
                  ? 'bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white shadow-sm'
                  : 'text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200'
              }`}
            >
              Quick Gen
            </button>
          </div>
          <button
            onClick={() => setIsCollapsed(true)}
            className="p-1.5 hover:bg-zinc-200 dark:hover:bg-white/10 rounded-lg text-zinc-500 dark:text-zinc-400 transition-colors"
            title="Collapse sidebar"
          >
            <ChevronRight size={16} />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto custom-scrollbar">

          {/* ——— Info Tab ——— */}
          {activeTab === 'info' && (
            <div className="p-4 space-y-5 pb-24">
              {!selectedTrack ? (
                <div className="flex flex-col items-center justify-center py-16 gap-3 text-center">
                  <Music size={40} className="text-zinc-300 dark:text-zinc-700" />
                  <p className="text-sm text-zinc-400 dark:text-zinc-500">
                    Select a track to see details
                  </p>
                </div>
              ) : (
                <>
                  {/* Cover art */}
                  <div className="aspect-square w-full rounded-xl overflow-hidden bg-zinc-200 dark:bg-zinc-800 shadow-lg">
                    {selectedTrack.cover_url ? (
                      <img
                        src={selectedTrack.cover_url}
                        alt={selectedTrack.title}
                        className="w-full h-full object-cover"
                        onError={(e) => { e.currentTarget.style.display = 'none'; }}
                      />
                    ) : (
                      <AlbumCover
                        seed={selectedTrack.id || selectedTrack.title}
                        size="full"
                        className="w-full h-full"
                      />
                    )}
                  </div>

                  {/* Title + date */}
                  <div>
                    <h3 className="text-base font-bold text-zinc-900 dark:text-white leading-tight">
                      {selectedTrack.title}
                    </h3>
                    <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">
                      {new Date(selectedTrack.created_at).toLocaleDateString(undefined, {
                        year: 'numeric',
                        month: 'short',
                        day: 'numeric',
                      })}
                    </p>
                  </div>

                  {/* Detail rows */}
                  <div className="bg-white dark:bg-black/20 rounded-xl border border-zinc-200 dark:border-white/5 divide-y divide-zinc-100 dark:divide-white/5 overflow-hidden">
                    <DetailRow label="Task" value={selectedTrack.task_type || '—'} />
                    <DetailRow label="Duration" value={formatDuration(selectedTrack.duration)} />
                    {selectedTrack.bpm != null && selectedTrack.bpm > 0 && (
                      <DetailRow label="BPM" value={String(selectedTrack.bpm)} />
                    )}
                    {selectedTrack.key_scale && (
                      <DetailRow label="Key" value={selectedTrack.key_scale} />
                    )}
                    {selectedTrack.time_signature && (
                      <DetailRow label="Time" value={selectedTrack.time_signature} />
                    )}
                    {selectedTrack.seed != null && (
                      <DetailRow label="Seed" value={String(selectedTrack.seed)} />
                    )}
                  </div>

                  {/* Style */}
                  {selectedTrack.style && (
                    <div>
                      <p className="text-xs font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-wide mb-2">
                        Style
                      </p>
                      <p className="text-sm text-zinc-700 dark:text-zinc-300 leading-relaxed">
                        {selectedTrack.style}
                      </p>
                    </div>
                  )}

                  {/* Prompt */}
                  {selectedTrack.prompt && (
                    <div>
                      <p className="text-xs font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-wide mb-2">
                        Prompt
                      </p>
                      <p className="text-sm text-zinc-700 dark:text-zinc-300 whitespace-pre-wrap leading-relaxed">
                        {selectedTrack.prompt}
                      </p>
                    </div>
                  )}

                  {/* Audio URL */}
                  {selectedTrack.audio_url && (
                    <div>
                      <p className="text-xs font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-wide mb-2">
                        Audio URL
                      </p>
                      <div className="flex items-center gap-2 p-2.5 bg-white dark:bg-black/20 border border-zinc-200 dark:border-white/10 rounded-lg">
                        <span className="text-[11px] text-zinc-600 dark:text-zinc-400 truncate flex-1 font-mono leading-tight">
                          {selectedTrack.audio_url}
                        </span>
                        <button
                          onClick={copyAudioUrl}
                          className={`flex-shrink-0 p-1.5 rounded-md transition-colors ${
                            copiedUrl
                              ? 'text-green-500'
                              : 'text-zinc-400 hover:text-zinc-900 dark:hover:text-white hover:bg-zinc-100 dark:hover:bg-white/10'
                          }`}
                          title="Copy URL"
                        >
                          {copiedUrl ? <Check size={13} /> : <Copy size={13} />}
                        </button>
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {/* ——— Quick Gen Tab ——— */}
          {activeTab === 'quickgen' && (
            <div className="p-4 space-y-3 pb-24">
              <p className="text-xs text-zinc-500 dark:text-zinc-400">
                Generate in{' '}
                <span className="font-semibold text-zinc-700 dark:text-zinc-300">
                  {activeWorkspace?.name}
                </span>
              </p>

              {/* Prompt */}
              <div>
                <label className="text-xs font-medium text-zinc-500 dark:text-zinc-400 mb-1 block">
                  Prompt
                </label>
                <textarea
                  value={qPrompt}
                  onChange={e => setQPrompt(e.target.value)}
                  placeholder="Describe the music…"
                  rows={3}
                  disabled={qGenerating}
                  className="w-full px-3 py-2 rounded-lg bg-white dark:bg-black/20 border border-zinc-200 dark:border-white/10 text-zinc-900 dark:text-white text-sm placeholder-zinc-400 dark:placeholder-zinc-600 focus:outline-none focus:border-pink-500/50 resize-none disabled:opacity-50"
                />
              </div>

              {/* Style */}
              <div>
                <label className="text-xs font-medium text-zinc-500 dark:text-zinc-400 mb-1 block">
                  Style
                </label>
                <input
                  type="text"
                  value={qStyle}
                  onChange={e => setQStyle(e.target.value)}
                  placeholder="lo-fi, chill, jazz…"
                  disabled={qGenerating}
                  className="w-full px-3 py-2 rounded-lg bg-white dark:bg-black/20 border border-zinc-200 dark:border-white/10 text-zinc-900 dark:text-white text-sm placeholder-zinc-400 dark:placeholder-zinc-600 focus:outline-none focus:border-pink-500/50 disabled:opacity-50"
                />
              </div>

              {/* Error */}
              {qError && (
                <p className="text-xs text-red-500 dark:text-red-400">{qError}</p>
              )}

              {/* Progress */}
              {qProgress && (
                <p className="text-xs text-zinc-500 dark:text-zinc-400 flex items-center gap-1.5">
                  <Loader2 size={11} className="animate-spin flex-shrink-0" />
                  {qProgress}
                </p>
              )}

              {/* Generate button */}
              <button
                onClick={handleQuickGen}
                disabled={!qPrompt.trim() || qGenerating}
                className="w-full flex items-center justify-center gap-2 py-2.5 px-4 bg-gradient-to-r from-pink-500 to-purple-600 text-white text-sm font-semibold rounded-xl hover:from-pink-600 hover:to-purple-700 transition-all shadow-lg shadow-pink-500/20 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {qGenerating ? <Loader2 size={15} className="animate-spin" /> : <Zap size={15} />}
                {qGenerating ? 'Generating…' : 'Generate'}
              </button>
            </div>
          )}
        </div>
      </div>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 px-3 py-2.5">
      <span className="text-xs text-zinc-500 dark:text-zinc-400 flex-shrink-0">{label}</span>
      <span className="text-xs text-zinc-900 dark:text-white font-medium text-right truncate">
        {value}
      </span>
    </div>
  );
}
