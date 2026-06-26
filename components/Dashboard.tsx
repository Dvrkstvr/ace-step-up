import React, { useState, useEffect, useCallback } from 'react';
import {
  Plus, Play, MoreVertical, ChevronDown, ChevronRight,
  Music, FolderOpen, Loader2, X, Clock,
} from 'lucide-react';
import { useWorkspace } from '../context/WorkspaceContext';
import { projectsApi, tracksApi } from '../services/api';
import { Track, Project } from '../types';
import TrackContextMenu from './TrackContextMenu';

// ─── Props ───────────────────────────────────────────────────────────────────

interface DashboardProps {
  onSelectTrack: (track: Track | null) => void;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatDuration(seconds?: number): string {
  if (!seconds || isNaN(seconds)) return '--:--';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

// ─── NewTrackModal ────────────────────────────────────────────────────────────

interface NewTrackModalProps {
  workspaceId: string;
  onClose: () => void;
  onCreated: () => void;
}

const NewTrackModal: React.FC<NewTrackModalProps> = ({ workspaceId, onClose, onCreated }) => {
  const [title, setTitle] = useState('');
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const handleCreate = async () => {
    const trimmed = title.trim();
    if (!trimmed) return;
    setCreating(true);
    setError('');
    try {
      await tracksApi.create({
        title: trimmed,
        workspace_id: workspaceId,
        task_type: 'text2music',
        tags: [],
      });
      onCreated();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create track');
    } finally {
      setCreating(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-white dark:bg-zinc-900 rounded-2xl shadow-2xl border border-zinc-200 dark:border-white/10 w-full max-w-sm mx-4 p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-base font-semibold text-zinc-900 dark:text-white">New Track</h3>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-white/10 transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        <input
          type="text"
          placeholder="Track title…"
          value={title}
          onChange={e => setTitle(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') handleCreate(); }}
          autoFocus
          className="w-full px-3 py-2 rounded-lg bg-zinc-100 dark:bg-white/5 border border-zinc-200 dark:border-white/10 text-zinc-900 dark:text-white text-sm placeholder-zinc-400 dark:placeholder-zinc-600 focus:outline-none focus:border-pink-500/50 mb-2"
        />

        {error && (
          <p className="text-xs text-red-500 dark:text-red-400 mb-3">{error}</p>
        )}

        <div className="flex justify-end gap-3 mt-4">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium rounded-lg text-zinc-700 dark:text-zinc-300 bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleCreate}
            disabled={!title.trim() || creating}
            className="px-4 py-2 text-sm font-medium rounded-lg bg-pink-500 hover:bg-pink-600 text-white disabled:opacity-50 flex items-center gap-2 transition-colors"
          >
            {creating && <Loader2 size={14} className="animate-spin" />}
            Create
          </button>
        </div>
      </div>
    </div>
  );
};

// ─── TrackRow ─────────────────────────────────────────────────────────────────

interface TrackRowProps {
  track: Track;
  onSelect: (t: Track) => void;
  onRefresh: () => void;
}

const TrackRow: React.FC<TrackRowProps> = ({ track, onSelect, onRefresh }) => {
  const [menuPos, setMenuPos] = useState<{ x: number; y: number } | null>(null);

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

  return (
    <>
      <div
        className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-zinc-100 dark:hover:bg-white/5 group cursor-pointer transition-colors"
        onClick={() => onSelect(track)}
        onContextMenu={handleContextMenu}
      >
        {/* Play button */}
        <button
          onClick={handlePlay}
          className="w-8 h-8 rounded-full flex-shrink-0 flex items-center justify-center bg-zinc-200 dark:bg-white/10 text-zinc-500 dark:text-zinc-400 group-hover:bg-pink-500/20 group-hover:text-pink-500 dark:group-hover:text-pink-400 transition-colors"
          aria-label={`Play ${track.title}`}
        >
          <Play size={13} className="ml-0.5" fill="currentColor" />
        </button>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-zinc-900 dark:text-white truncate leading-tight">
            {track.title}
          </p>
          {track.style && (
            <p className="text-xs text-zinc-400 dark:text-zinc-500 truncate mt-0.5">{track.style}</p>
          )}
        </div>

        {/* Duration */}
        <span className="text-xs text-zinc-400 dark:text-zinc-600 font-mono flex-shrink-0 flex items-center gap-1">
          <Clock size={11} />
          {formatDuration(track.duration)}
        </span>

        {/* More button */}
        <button
          onClick={openMenu}
          className="p-1.5 rounded-lg flex-shrink-0 text-zinc-400 dark:text-zinc-600 hover:text-zinc-900 dark:hover:text-zinc-200 hover:bg-zinc-200 dark:hover:bg-white/10 transition-colors opacity-0 group-hover:opacity-100"
          aria-label="More options"
        >
          <MoreVertical size={15} />
        </button>
      </div>

      {menuPos && (
        <TrackContextMenu
          track={track}
          position={menuPos}
          onClose={() => setMenuPos(null)}
          onUpdate={onRefresh}
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
}

const WorkspaceView: React.FC<WorkspaceViewProps> = ({ onSelectTrack }) => {
  const { activeWorkspace, navigateTo } = useWorkspace();

  const [projects, setProjects] = useState<Project[]>([]);
  const [standaloneTracks, setStandaloneTracks] = useState<Track[]>([]);
  const [expandedProjects, setExpandedProjects] = useState<Set<string>>(new Set());
  const [projectTracks, setProjectTracks] = useState<Record<string, Track[]>>({});
  const [loading, setLoading] = useState(true);
  const [showNewTrack, setShowNewTrack] = useState(false);

  // Project rename inline state
  const [renamingProjectId, setRenamingProjectId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');

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

  useEffect(() => { load(); }, [load]);

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
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Music size={15} className="text-zinc-400 flex-shrink-0" />
            <h3 className="text-sm font-semibold text-zinc-900 dark:text-white">Tracks</h3>
            {standaloneTracks.length > 0 && (
              <span className="text-xs text-zinc-400 dark:text-zinc-600 font-normal">
                ({standaloneTracks.length})
              </span>
            )}
          </div>
          <button
            onClick={() => setShowNewTrack(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-zinc-100 dark:bg-white/5 border border-zinc-200 dark:border-white/10 text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white hover:bg-zinc-200 dark:hover:bg-white/10 transition-colors"
          >
            <Plus size={13} />
            New Track
          </button>
        </div>

        {standaloneTracks.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <Music size={36} className="text-zinc-300 dark:text-zinc-700 mb-3" />
            <p className="text-sm text-zinc-500 dark:text-zinc-400">No standalone tracks yet</p>
            <p className="text-xs text-zinc-400 dark:text-zinc-600 mt-1">
              Generate music or click "+ New Track" to get started
            </p>
          </div>
        ) : (
          <div className="bg-white dark:bg-suno-card border border-zinc-200 dark:border-suno-border rounded-xl overflow-hidden divide-y divide-zinc-100 dark:divide-white/5">
            {standaloneTracks.map(track => (
              <TrackRow
                key={track.id}
                track={track}
                onSelect={onSelectTrack}
                onRefresh={load}
              />
            ))}
          </div>
        )}
      </section>

      {showNewTrack && (
        <NewTrackModal
          workspaceId={ws.id}
          onClose={() => setShowNewTrack(false)}
          onCreated={load}
        />
      )}
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
        <div className="bg-white dark:bg-suno-card border border-zinc-200 dark:border-suno-border rounded-xl overflow-hidden divide-y divide-zinc-100 dark:divide-white/5">
          {tracks.map((track, i) => (
            <div key={track.id} className="flex items-center">
              {/* Version number */}
              <span className="w-10 text-center text-xs text-zinc-400 dark:text-zinc-600 flex-shrink-0 font-mono py-2">
                v{tracks.length - i}
              </span>
              <div className="flex-1 min-w-0">
                <TrackRow track={track} onSelect={onSelectTrack} onRefresh={load} />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

// ─── Dashboard ────────────────────────────────────────────────────────────────

const Dashboard: React.FC<DashboardProps> = ({ onSelectTrack }) => {
  const { breadcrumb } = useWorkspace();

  return (
    <div className="flex-1 overflow-y-auto bg-zinc-50 dark:bg-suno h-full">
      {breadcrumb.level === 'root' && <RootView />}
      {breadcrumb.level === 'workspace' && <WorkspaceView onSelectTrack={onSelectTrack} />}
      {breadcrumb.level === 'song' && <SongView onSelectTrack={onSelectTrack} />}
    </div>
  );
};

export default Dashboard;
