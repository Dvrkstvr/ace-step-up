import React, { useState, useEffect, useCallback } from 'react';
import {
  Plus, Play, MoreVertical, ChevronDown, ChevronRight,
  Music, FolderOpen, Loader2, Clock, Trash2, RefreshCw, X, CheckSquare, Scissors,
} from 'lucide-react';
import { useWorkspace } from '../context/WorkspaceContext';
import { projectsApi, tracksApi } from '../services/api';
import { Stem, Track, Project } from '../types';
import TrackContextMenu from './TrackContextMenu';
import InlineNewTrack from './InlineNewTrack';
import StemWaveform from './StemWaveform';

// ─── Props ───────────────────────────────────────────────────────────────────

interface DashboardProps {
  onSelectTrack: (track: Track | null) => void;
  refreshKey?: number;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatDuration(seconds?: number): string {
  if (!seconds || isNaN(seconds)) return '--:--';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

// ─── TrackRow ─────────────────────────────────────────────────────────────────

const STEM_META: Record<string, { emoji: string; label: string }> = {
  vocals: { emoji: '🎤', label: 'Vocals' },
  drums:  { emoji: '🥁', label: 'Drums' },
  bass:   { emoji: '🎸', label: 'Bass' },
  other:  { emoji: '🎹', label: 'Other' },
  guitar: { emoji: '🎸', label: 'Guitar' },
  piano:  { emoji: '🎹', label: 'Piano' },
};

interface TrackRowProps {
  track: Track;
  onSelect: (t: Track) => void;
  onRefresh: () => void;
  onCreateVariation?: (params: any) => void;
  selected?: boolean;
  onToggleSelect?: (id: string) => void;
  selectionActive?: boolean;
}

const TrackRow: React.FC<TrackRowProps> = ({ track, onSelect, onRefresh, onCreateVariation, selected = false, onToggleSelect, selectionActive = false }) => {
  const [menuPos, setMenuPos] = useState<{ x: number; y: number } | null>(null);
  const [localStems, setLocalStems] = useState<Stem[] | null>(null);
  const [stemsOpen, setStemsOpen] = useState(false);

  const openMenu = (e: React.MouseEvent) => {
    e.stopPropagation();
    setMenuPos({ x: e.clientX, y: e.clientY });
  };

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    setMenuPos({ x: e.clientX, y: e.clientY });
  };

  const handlePlay = (e: React.MouseEvent) => {
    e.stopPropagation();
    onSelect(track);
    window.dispatchEvent(new CustomEvent('ace:play-track', { detail: track }));
  };

  const hasStems = !!(track.has_stems || localStems?.length);

  return (
    <>
      <div> {/* wrapper — card styling applied by parent */}
      <div
        className={`flex items-center gap-3 px-3 py-2 rounded-lg group cursor-pointer transition-colors ${
          selected
            ? 'bg-pink-50 dark:bg-pink-500/10'
            : 'hover:bg-zinc-100 dark:hover:bg-white/5'
        }`}
        onClick={() => selectionActive && onToggleSelect ? onToggleSelect(track.id) : onSelect(track)}
        onContextMenu={handleContextMenu}
      >
        {/* Checkbox (selection mode) or Play button */}
        {selectionActive ? (
          <button
            onClick={e => { e.stopPropagation(); onToggleSelect?.(track.id); }}
            className={`w-8 h-8 rounded-full flex-shrink-0 flex items-center justify-center transition-colors ${
              selected
                ? 'bg-pink-500 text-white'
                : 'bg-zinc-200 dark:bg-white/10 text-zinc-400 dark:text-zinc-500'
            }`}
          >
            {selected
              ? <CheckSquare size={14} />
              : <div className="w-4 h-4 rounded border-2 border-zinc-400 dark:border-zinc-500" />}
          </button>
        ) : (
          <button
            onClick={handlePlay}
            className="w-8 h-8 rounded-full flex-shrink-0 flex items-center justify-center bg-zinc-200 dark:bg-white/10 text-zinc-500 dark:text-zinc-400 group-hover:bg-pink-500/20 group-hover:text-pink-500 dark:group-hover:text-pink-400 transition-colors"
            aria-label={`Play ${track.title}`}
          >
            <Play size={13} className="ml-0.5" fill="currentColor" />
          </button>
        )}

        {/* Info */}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-zinc-900 dark:text-white truncate leading-tight">
            {track.title}
          </p>
          {track.style && (
            <p className="text-xs text-zinc-400 dark:text-zinc-500 truncate mt-0.5">{track.style}</p>
          )}
          {(track.bpm || track.key_scale || track.time_signature) && (
            <div className="flex items-center gap-1.5 mt-1 flex-wrap">
              {track.bpm ? (
                <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-zinc-100 dark:bg-white/8 text-zinc-500 dark:text-zinc-400">{track.bpm} BPM</span>
              ) : null}
              {track.key_scale ? (
                <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-zinc-100 dark:bg-white/8 text-zinc-500 dark:text-zinc-400">{track.key_scale}</span>
              ) : null}
              {track.time_signature ? (
                <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-zinc-100 dark:bg-white/8 text-zinc-500 dark:text-zinc-400">{track.time_signature}</span>
              ) : null}
            </div>
          )}
        </div>

        {/* Duration */}
        <span className="text-xs text-zinc-400 dark:text-zinc-600 font-mono flex-shrink-0 flex items-center gap-1">
          <Clock size={11} />
          {formatDuration(track.duration)}
        </span>

        {/* More button — hidden in selection mode */}
        {!selectionActive && (
          <button
            onClick={openMenu}
            className="p-1.5 rounded-lg flex-shrink-0 text-zinc-400 dark:text-zinc-600 hover:text-zinc-900 dark:hover:text-zinc-200 hover:bg-zinc-200 dark:hover:bg-white/10 transition-colors opacity-0 group-hover:opacity-100"
            aria-label="More options"
          >
            <MoreVertical size={15} />
          </button>
        )}
      </div>

      {/* Stems sliver */}
      {hasStems && (
        <>
          <button
            onClick={e => {
              e.stopPropagation();
              if (!stemsOpen && !localStems) {
                import('../services/api').then(({ stemsApi }) =>
                  stemsApi.list(track.id).then(setLocalStems).catch(() => {})
                );
              }
              setStemsOpen(p => !p);
            }}
            className="w-full flex items-center gap-2 px-3 py-1 bg-zinc-50 dark:bg-white/[0.03] border-t border-zinc-100 dark:border-white/5 hover:bg-zinc-100 dark:hover:bg-white/[0.06] transition-colors text-left"
          >
            <Scissors size={10} className="text-pink-400 flex-shrink-0" />
            <span className="flex-1 flex items-center gap-2 min-w-0">
              {(localStems ?? []).map(s => {
                const meta = STEM_META[s.instrument_class] ?? { emoji: '🎵', label: s.instrument_class };
                return (
                  <span key={s.id} className="text-[10px] text-zinc-400 dark:text-zinc-500 flex items-center gap-0.5">
                    <span>{meta.emoji}</span>
                    <span>{meta.label}</span>
                  </span>
                );
              })}
              {!localStems && (
                <span className="text-[10px] text-zinc-400 dark:text-zinc-500">Stems</span>
              )}
            </span>
            {stemsOpen
              ? <ChevronDown size={11} className="text-zinc-400 dark:text-zinc-500 flex-shrink-0" />
              : <ChevronRight size={11} className="text-zinc-400 dark:text-zinc-500 flex-shrink-0" />}
          </button>

          {stemsOpen && localStems && localStems.map(stem => (
            <StemWaveform key={stem.id} stem={stem} track={track} />
          ))}
        </>
      )}
      </div> {/* end wrapper */}

      {menuPos && (
        <TrackContextMenu
          track={track}
          position={menuPos}
          onClose={() => setMenuPos(null)}
          onUpdate={onRefresh}
          onCreateVariation={onCreateVariation}
          onStemsCreated={(stems) => {
            setLocalStems(stems);
            setStemsOpen(true);
          }}
        />
      )}
    </>
  );
};

// ─── Root View — Workspace grid ───────────────────────────────────────────────

const RootView: React.FC = () => {
  const { workspaces, createWorkspace, navigateTo } = useWorkspace();
  const [showNewForm, setShowNewForm] = useState(false);
  const [newName, setNewName] = useState('');
  const [newType, setNewType] = useState('general');
  const [creating, setCreating] = useState(false);

  const handleCreateWorkspace = async () => {
    const trimmed = newName.trim();
    if (!trimmed) return;
    setCreating(true);
    try {
      const ws = await createWorkspace(trimmed, newType);
      setNewName('');
      setNewType('general');
      setShowNewForm(false);
      navigateTo({ level: 'workspace', workspace: ws });
    } catch (err) {
      console.error('Failed to create workspace:', err);
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="p-6">
      <div className="mb-6">
        <h2 className="text-xl font-bold text-zinc-900 dark:text-white">Workspaces</h2>
        <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1">
          Organise your music projects into workspaces
        </p>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
        {workspaces.map(ws => (
          <button
            key={ws.id}
            onClick={() => navigateTo({ level: 'workspace', workspace: ws })}
            className="flex flex-col items-start gap-3 p-4 rounded-xl bg-white dark:bg-suno-card border border-zinc-200 dark:border-suno-border hover:border-pink-500/40 dark:hover:border-pink-500/40 hover:shadow-md transition-all text-left group"
          >
            <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-pink-500/15 to-purple-600/15 dark:from-pink-500/10 dark:to-purple-600/10 flex items-center justify-center group-hover:from-pink-500/25 group-hover:to-purple-600/25 transition-all">
              <FolderOpen size={20} className="text-pink-500 dark:text-pink-400" />
            </div>
            <div className="w-full min-w-0">
              <p className="text-sm font-semibold text-zinc-900 dark:text-white truncate">
                {ws.name}
              </p>
              <p className="text-xs text-zinc-500 dark:text-zinc-400 capitalize mt-0.5">
                {ws.type}
              </p>
              {ws.track_count !== undefined && (
                <p className="text-xs text-zinc-400 dark:text-zinc-600 mt-1">
                  {ws.track_count} {ws.track_count === 1 ? 'track' : 'tracks'}
                </p>
              )}
            </div>
          </button>
        ))}

        {/* New Workspace card */}
        {!showNewForm ? (
          <button
            onClick={() => setShowNewForm(true)}
            className="flex flex-col items-center justify-center gap-2 p-4 rounded-xl border-2 border-dashed border-zinc-300 dark:border-zinc-700 hover:border-pink-400 dark:hover:border-pink-500/50 text-zinc-400 dark:text-zinc-500 hover:text-pink-500 dark:hover:text-pink-400 transition-all min-h-[120px]"
          >
            <Plus size={22} />
            <span className="text-sm font-medium">New Workspace</span>
          </button>
        ) : (
          <div className="flex flex-col gap-2 p-4 rounded-xl bg-white dark:bg-suno-card border border-zinc-200 dark:border-suno-border min-h-[120px]">
            <input
              type="text"
              placeholder="Workspace name"
              value={newName}
              onChange={e => setNewName(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') handleCreateWorkspace();
                if (e.key === 'Escape') { setShowNewForm(false); setNewName(''); }
              }}
              autoFocus
              className="w-full px-2.5 py-1.5 rounded-lg bg-zinc-100 dark:bg-white/5 border border-zinc-200 dark:border-white/10 text-zinc-900 dark:text-white text-xs placeholder-zinc-400 focus:outline-none focus:border-pink-500/50"
            />
            <select
              value={newType}
              onChange={e => setNewType(e.target.value)}
              className="w-full px-2.5 py-1.5 rounded-lg bg-zinc-100 dark:bg-white/5 border border-zinc-200 dark:border-white/10 text-zinc-700 dark:text-zinc-200 text-xs focus:outline-none focus:border-pink-500/50"
            >
              <option value="general">General</option>
              <option value="artist">Artist</option>
              <option value="band">Band</option>
              <option value="producer">Producer</option>
              <option value="album">Album</option>
            </select>
            <div className="flex gap-1.5 mt-auto">
              <button
                onClick={() => { setShowNewForm(false); setNewName(''); }}
                className="flex-1 py-1.5 text-xs rounded-lg bg-zinc-100 dark:bg-white/5 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-white/10 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleCreateWorkspace}
                disabled={!newName.trim() || creating}
                className="flex-1 py-1.5 text-xs rounded-lg bg-pink-500 hover:bg-pink-600 text-white disabled:opacity-50 flex items-center justify-center gap-1 transition-colors"
              >
                {creating && <Loader2 size={10} className="animate-spin" />}
                Create
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

// ─── Workspace View ───────────────────────────────────────────────────────────

interface WorkspaceViewProps {
  onSelectTrack: (t: Track | null) => void;
  refreshKey?: number;
}

const WorkspaceView: React.FC<WorkspaceViewProps> = ({ onSelectTrack, refreshKey }) => {
  const { activeWorkspace, navigateTo } = useWorkspace();

  const [projects, setProjects] = useState<Project[]>([]);
  const [standaloneTracks, setStandaloneTracks] = useState<Track[]>([]);
  const [expandedProjects, setExpandedProjects] = useState<Set<string>>(new Set());
  const [projectTracks, setProjectTracks] = useState<Record<string, Track[]>>({});
  const [loading, setLoading] = useState(true);
  // Project rename inline state
  const [renamingProjectId, setRenamingProjectId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  // Multi-select state
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkLoading, setBulkLoading] = useState<string | null>(null);
  // Variation prefill: when set, show a prefilled InlineNewTrack for re-generation
  const [variationPrefill, setVariationPrefill] = useState<import('./InlineNewTrack').InlineNewTrackPrefill | null>(null);

  const toggleSelect = (id: string) =>
    setSelectedIds(prev => { const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s; });
  const clearSelection = () => setSelectedIds(new Set());

  const handleBulkDelete = async () => {
    if (!selectedIds.size) return;
    setBulkLoading('delete');
    try {
      await Promise.all([...selectedIds].map(id => tracksApi.delete(id)));
      clearSelection();
      load();
    } catch (err) { console.error('Bulk delete failed:', err); }
    finally { setBulkLoading(null); }
  };

  const handleBulkVariations = async () => {
    if (!selectedIds.size) return;
    setBulkLoading('variations');
    try {
      // Fetch params for all selected tracks and open prefilled forms sequentially
      // For simplicity, use the first selected track's params to open the form
      const firstId = [...selectedIds][0];
      const params = await tracksApi.iterate(firstId);
      setVariationPrefill(params as any);
      clearSelection();
    } catch (err) { console.error('Bulk variations failed:', err); }
    finally { setBulkLoading(null); }
  };

  const load = useCallback(async () => {
    if (!activeWorkspace) return;
    setLoading(true);
    try {
      const [projs, allTracks] = await Promise.all([
        projectsApi.list(activeWorkspace.id),
        tracksApi.list({ workspace_id: activeWorkspace.id }),
      ]);
      setProjects(projs);
      setStandaloneTracks(allTracks.filter(t => !t.project_id));
    } catch (err) {
      console.error('Failed to load workspace content:', err);
    } finally {
      setLoading(false);
    }
  }, [activeWorkspace]);

  useEffect(() => { load(); }, [load, refreshKey]);

  const loadProjectTracks = useCallback(async (projectId: string) => {
    try {
      const tracks = await tracksApi.list({ project_id: projectId });
      setProjectTracks(prev => ({
        ...prev,
        [projectId]: tracks.sort((a, b) => b.created_at.localeCompare(a.created_at)),
      }));
    } catch (err) {
      console.error('Failed to load project tracks:', err);
    }
  }, []);

  const toggleProject = async (projectId: string) => {
    if (expandedProjects.has(projectId)) {
      setExpandedProjects(prev => { const s = new Set(prev); s.delete(projectId); return s; });
    } else {
      setExpandedProjects(prev => new Set([...prev, projectId]));
      if (!projectTracks[projectId]) {
        await loadProjectTracks(projectId);
      }
    }
  };

  const handleRenameProject = async (projectId: string) => {
    const trimmed = renameValue.trim();
    if (trimmed && trimmed !== projects.find(p => p.id === projectId)?.name) {
      try {
        await projectsApi.update(projectId, { name: trimmed });
        await load();
      } catch (err) {
        console.error('Failed to rename project:', err);
      }
    }
    setRenamingProjectId(null);
    setRenameValue('');
  };

  const handleDeleteProject = async (project: Project) => {
    if (!confirm(`Delete "${project.name}" and all its tracks?`)) return;
    try {
      await projectsApi.delete(project.id);
      await load();
    } catch (err) {
      console.error('Failed to delete project:', err);
    }
  };

  // Capture non-null ref so closures can use it safely
  const ws = activeWorkspace;
  if (!ws) return null;

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center py-24">
        <Loader2 size={24} className="animate-spin text-zinc-400 dark:text-zinc-600" />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-8">

      {/* ── Songs (projects) ──────────────────────────────────────────────── */}
      {projects.length > 0 && (
        <section>
          <div className="flex items-center gap-2 mb-3">
            <Music size={15} className="text-pink-500 flex-shrink-0" />
            <h3 className="text-sm font-semibold text-zinc-900 dark:text-white">Songs</h3>
            <span className="text-xs text-zinc-400 dark:text-zinc-600 font-normal">
              ({projects.length})
            </span>
          </div>

          <div className="space-y-2">
            {projects.map(project => {
              const isExpanded = expandedProjects.has(project.id);
              const pTracks = projectTracks[project.id];

              return (
                <div
                  key={project.id}
                  className="bg-white dark:bg-suno-card border border-zinc-200 dark:border-suno-border rounded-xl overflow-hidden"
                >
                  {/* Project header row */}
                  <div className="flex items-center gap-2 px-3 py-2.5 group">
                    {/* Expand toggle */}
                    <button
                      onClick={() => toggleProject(project.id)}
                      className="p-0.5 text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 transition-colors flex-shrink-0"
                      aria-label={isExpanded ? 'Collapse' : 'Expand'}
                    >
                      {isExpanded
                        ? <ChevronDown size={16} />
                        : <ChevronRight size={16} />}
                    </button>

                    {/* Project name / rename input */}
                    <div className="flex-1 min-w-0">
                      {renamingProjectId === project.id ? (
                        <input
                          type="text"
                          value={renameValue}
                          onChange={e => setRenameValue(e.target.value)}
                          onKeyDown={e => {
                            e.stopPropagation();
                            if (e.key === 'Enter') handleRenameProject(project.id);
                            if (e.key === 'Escape') {
                              setRenamingProjectId(null);
                              setRenameValue('');
                            }
                          }}
                          onBlur={() => handleRenameProject(project.id)}
                          onClick={e => e.stopPropagation()}
                          autoFocus
                          className="px-2 py-0.5 w-full rounded bg-zinc-100 dark:bg-white/10 border border-pink-500/50 text-sm font-medium text-zinc-900 dark:text-white focus:outline-none"
                        />
                      ) : (
                        <button
                          onClick={() => navigateTo({ level: 'song', workspace: ws, project })}
                          className="text-sm font-medium text-zinc-900 dark:text-white truncate block text-left hover:text-pink-600 dark:hover:text-pink-400 transition-colors"
                        >
                          {project.name}
                        </button>
                      )}
                      {project.track_count !== undefined && (
                        <span className="text-xs text-zinc-400 dark:text-zinc-500">
                          {project.track_count} {project.track_count === 1 ? 'version' : 'versions'}
                        </span>
                      )}
                    </div>

                    {/* Context actions (hover) */}
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
                      <button
                        onClick={e => {
                          e.stopPropagation();
                          setRenamingProjectId(project.id);
                          setRenameValue(project.name);
                        }}
                        className="px-2 py-1 text-xs rounded-lg text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white hover:bg-zinc-100 dark:hover:bg-white/10 transition-colors"
                      >
                        Rename
                      </button>
                      <button
                        onClick={e => { e.stopPropagation(); handleDeleteProject(project); }}
                        className="px-2 py-1 text-xs rounded-lg text-zinc-500 dark:text-zinc-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-500/10 transition-colors"
                      >
                        Delete
                      </button>
                    </div>
                  </div>

                  {/* Expanded track list */}
                  {isExpanded && (
                    <div className="border-t border-zinc-100 dark:border-white/5 px-2 py-1 space-y-0.5">
                      {!pTracks ? (
                        <div className="flex justify-center py-3">
                          <Loader2 size={16} className="animate-spin text-zinc-400 dark:text-zinc-600" />
                        </div>
                      ) : pTracks.length === 0 ? (
                        <p className="text-xs text-zinc-400 dark:text-zinc-600 py-2 px-2">
                          No tracks yet
                        </p>
                      ) : (
                        pTracks.map(track => (
                          <TrackRow
                            key={track.id}
                            track={track}
                            onSelect={onSelectTrack}
                            onRefresh={() => loadProjectTracks(project.id)}
                          />
                        ))
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* ── Standalone Tracks ─────────────────────────────────────────────── */}
      <section>
        <div className="flex items-center gap-2 mb-3">
          <Music size={15} className="text-zinc-400 flex-shrink-0" />
          <h3 className="text-sm font-semibold text-zinc-900 dark:text-white">Tracks</h3>
          {standaloneTracks.length > 0 && (
            <span className="text-xs text-zinc-400 dark:text-zinc-600 font-normal">
              ({standaloneTracks.length})
            </span>
          )}
          <div className="flex-1" />
          {standaloneTracks.length > 0 && (
            selectedIds.size > 0 ? (
              <button onClick={clearSelection} className="flex items-center gap-1 text-xs text-zinc-500 dark:text-zinc-400 hover:text-zinc-800 dark:hover:text-zinc-200 transition-colors">
                <X size={12} /> Cancel
              </button>
            ) : (
              <button
                onClick={() => setSelectedIds(new Set(standaloneTracks.map(t => t.id)))}
                className="text-xs text-zinc-400 dark:text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 transition-colors"
              >
                Select
              </button>
            )
          )}
        </div>

        {(() => {
          // A stemmed track ends its card group (gap comes after, not before).
          // Consecutive no-stem tracks share a card; a stemmed track closes the current card.
          type Group = { tracks: Track[] };
          const groups: Group[] = [];
          for (const t of standaloneTracks) {
            const last = groups[groups.length - 1];
            if (!last || last.tracks[last.tracks.length - 1]?.has_stems) {
              groups.push({ tracks: [t] });
            } else {
              last.tracks.push(t);
            }
          }

          const cardCls = 'bg-white dark:bg-suno-card border border-zinc-200 dark:border-suno-border rounded-xl overflow-hidden';

          return (
            <div className="space-y-2">
              {/* New track input always its own card */}
              <div className={cardCls}>
                {variationPrefill ? (
                  <InlineNewTrack
                    key={JSON.stringify(variationPrefill)}
                    workspaceId={ws.id}
                    prefill={variationPrefill}
                    autoOpen
                    onTrackCreated={t => { setVariationPrefill(null); load(); onSelectTrack(t); }}
                    onSelect={onSelectTrack}
                  />
                ) : (
                  <InlineNewTrack
                    workspaceId={ws.id}
                    onTrackCreated={t => { load(); onSelectTrack(t); }}
                    onSelect={onSelectTrack}
                  />
                )}
              </div>

              {groups.map((group, gi) => (
                <div key={gi} className={`${cardCls} divide-y divide-zinc-100 dark:divide-white/5`}>
                  {group.tracks.map(t => (
                    <TrackRow
                      key={t.id}
                      track={t}
                      onSelect={onSelectTrack}
                      onRefresh={load}
                      onCreateVariation={params => setVariationPrefill(params)}
                      selected={selectedIds.has(t.id)}
                      onToggleSelect={toggleSelect}
                      selectionActive={selectedIds.size > 0}
                    />
                  ))}
                </div>
              ))}
            </div>
          );
        })()}

        {/* Bulk action bar */}
        {selectedIds.size > 0 && (
          <div className="mt-3 flex items-center gap-2 p-3 bg-white dark:bg-suno-card border border-zinc-200 dark:border-suno-border rounded-xl shadow-sm">
            <span className="text-xs font-semibold text-zinc-600 dark:text-zinc-400 flex-1">
              {selectedIds.size} track{selectedIds.size !== 1 ? 's' : ''} selected
            </span>
            <button
              onClick={handleBulkVariations}
              disabled={!!bulkLoading}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border border-zinc-200 dark:border-white/10 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-white/10 transition-colors disabled:opacity-50"
            >
              {bulkLoading === 'variations' ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
              Create Variations
            </button>
            <button
              onClick={handleBulkDelete}
              disabled={!!bulkLoading}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border border-red-200 dark:border-red-500/30 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-500/10 transition-colors disabled:opacity-50"
            >
              {bulkLoading === 'delete' ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />}
              Delete
            </button>
          </div>
        )}
      </section>
    </div>
  );
};

// ─── Song (Project Detail) View ───────────────────────────────────────────────

interface SongViewProps {
  onSelectTrack: (t: Track | null) => void;
}

const SongView: React.FC<SongViewProps> = ({ onSelectTrack }) => {
  const { activeProject } = useWorkspace();
  const [tracks, setTracks] = useState<Track[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!activeProject) return;
    setLoading(true);
    try {
      const data = await tracksApi.list({ project_id: activeProject.id });
      // Newest first
      setTracks(data.sort((a, b) => b.created_at.localeCompare(a.created_at)));
    } catch (err) {
      console.error('Failed to load project tracks:', err);
    } finally {
      setLoading(false);
    }
  }, [activeProject]);

  useEffect(() => { load(); }, [load]);

  // Capture non-null ref for closures
  const proj = activeProject;
  if (!proj) return null;

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center py-24">
        <Loader2 size={24} className="animate-spin text-zinc-400 dark:text-zinc-600" />
      </div>
    );
  }

  return (
    <div className="p-6">
      <div className="mb-6">
        <h2 className="text-xl font-bold text-zinc-900 dark:text-white">{proj.name}</h2>
        <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1">
          {tracks.length} {tracks.length === 1 ? 'version' : 'versions'}
          {tracks.length > 0 && ' · newest first'}
        </p>
      </div>

      {tracks.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <Music size={40} className="text-zinc-300 dark:text-zinc-700 mb-3" />
          <p className="text-sm text-zinc-500 dark:text-zinc-400">No tracks in this song yet</p>
        </div>
      ) : (
        (() => {
          type Group = { entries: { track: Track; vNum: number }[] };
          const groups: Group[] = [];
          tracks.forEach((t, i) => {
            const vNum = tracks.length - i;
            const last = groups[groups.length - 1];
            const lastTrack = last?.entries[last.entries.length - 1]?.track;
            if (!last || lastTrack?.has_stems) {
              groups.push({ entries: [{ track: t, vNum }] });
            } else {
              last.entries.push({ track: t, vNum });
            }
          });

          const cardCls = 'bg-white dark:bg-suno-card border border-zinc-200 dark:border-suno-border rounded-xl overflow-hidden';
          const vLabel = (n: number) => (
            <span className="w-10 text-center text-xs text-zinc-400 dark:text-zinc-600 flex-shrink-0 font-mono self-start pt-3">
              v{n}
            </span>
          );

          return (
            <div className="space-y-2">
              {groups.map((group, gi) => (
                <div key={gi} className={`${cardCls} divide-y divide-zinc-100 dark:divide-white/5`}>
                  {group.entries.map(({ track: t, vNum }) => (
                    <div key={t.id} className="flex items-center">
                      {vLabel(vNum)}
                      <div className="flex-1 min-w-0">
                        <TrackRow track={t} onSelect={onSelectTrack} onRefresh={load} />
                      </div>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          );
        })()
      )}
    </div>
  );
};

// ─── Dashboard ────────────────────────────────────────────────────────────────

const Dashboard: React.FC<DashboardProps> = ({ onSelectTrack, refreshKey }) => {
  const { breadcrumb } = useWorkspace();

  return (
    <div className="flex-1 overflow-y-auto bg-zinc-50 dark:bg-suno h-full">
      {breadcrumb.level === 'root' && <RootView />}
      {breadcrumb.level === 'workspace' && <WorkspaceView onSelectTrack={onSelectTrack} refreshKey={refreshKey} />}
      {breadcrumb.level === 'song' && <SongView onSelectTrack={onSelectTrack} />}
    </div>
  );
};

export default Dashboard;
