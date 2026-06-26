import React, { useState } from 'react';
import { ChevronLeft, ChevronRight, Music, Copy, Check, Zap } from 'lucide-react';
import type { Track } from '../types';
import { useWorkspace } from '../context/WorkspaceContext';
import { AlbumCover } from './AlbumCover';
import NewTrackModal from './NewTrackModal';

interface ContextSidebarProps {
  selectedTrack: Track | null;
}

export default function ContextSidebar({ selectedTrack }: ContextSidebarProps) {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [activeTab, setActiveTab] = useState<'info' | 'quickgen'>('info');
  const [copiedUrl, setCopiedUrl] = useState(false);
  const [isNewTrackOpen, setIsNewTrackOpen] = useState(false);

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
    <>
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
            <div className="p-4 space-y-4 pb-24">
              <p className="text-sm text-zinc-600 dark:text-zinc-400">
                Quickly generate a new track in{' '}
                <span className="font-semibold text-zinc-800 dark:text-zinc-200">
                  {activeWorkspace?.name ?? 'the active workspace'}
                </span>
                .
              </p>

              {!activeWorkspace ? (
                <div className="p-4 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-500/30 rounded-xl text-sm text-amber-700 dark:text-amber-400">
                  Select a workspace first to generate tracks.
                </div>
              ) : (
                <button
                  onClick={() => setIsNewTrackOpen(true)}
                  className="w-full flex items-center justify-center gap-2 py-3 px-4 bg-gradient-to-r from-pink-500 to-purple-600 text-white text-sm font-semibold rounded-xl hover:from-pink-600 hover:to-purple-700 transition-all shadow-lg shadow-pink-500/20"
                >
                  <Zap size={16} />
                  Open Generate Form
                </button>
              )}

              {selectedTrack && (
                <div className="pt-3 border-t border-zinc-200 dark:border-white/5 space-y-1">
                  <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
                    Currently selected:
                  </p>
                  <p className="text-sm font-semibold text-zinc-800 dark:text-zinc-200 truncate">
                    {selectedTrack.title}
                  </p>
                  {selectedTrack.style && (
                    <p className="text-xs text-zinc-500 dark:text-zinc-400 truncate">
                      {selectedTrack.style}
                    </p>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {activeWorkspace && (
        <NewTrackModal
          isOpen={isNewTrackOpen}
          onClose={() => setIsNewTrackOpen(false)}
          workspaceId={activeWorkspace.id}
          onTrackCreated={() => {
            setIsNewTrackOpen(false);
          }}
        />
      )}
    </>
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
