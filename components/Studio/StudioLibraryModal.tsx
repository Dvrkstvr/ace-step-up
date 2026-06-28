import React, { useEffect, useState } from 'react';
import { X, ChevronRight, ChevronDown, Plus, Music, Disc } from 'lucide-react';
import { useStudio } from '../../context/StudioContext';
import { workspacesApi, projectsApi, tracksApi } from '../../services/api';
import { Workspace, Project, Track, Stem } from '../../types';

interface StudioLibraryModalProps {
  onClose: () => void;
}

const StudioLibraryModal: React.FC<StudioLibraryModalProps> = ({ onClose }) => {
  const { addLayer, layers } = useStudio();

  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState<string | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loadingWorkspaces, setLoadingWorkspaces] = useState(true);
  const [loadingProjects, setLoadingProjects] = useState(false);

  const [expandedProjects, setExpandedProjects] = useState<Set<string>>(new Set());
  const [projectTracks, setProjectTracks] = useState<Record<string, Track[]>>({});
  const [loadingTracks, setLoadingTracks] = useState<Set<string>>(new Set());
  const [expandedTracks, setExpandedTracks] = useState<Set<string>>(new Set());

  const [addingId, setAddingId] = useState<string | null>(null);

  const nextOrder = layers.length;

  useEffect(() => {
    workspacesApi.list()
      .then(ws => {
        setWorkspaces(ws);
        if (ws.length > 0) setSelectedWorkspaceId(ws[0].id);
      })
      .catch(console.error)
      .finally(() => setLoadingWorkspaces(false));
  }, []);

  useEffect(() => {
    if (!selectedWorkspaceId) return;
    setLoadingProjects(true);
    setProjects([]);
    setExpandedProjects(new Set());
    setProjectTracks({});
    setExpandedTracks(new Set());
    projectsApi.list(selectedWorkspaceId)
      .then(setProjects)
      .catch(console.error)
      .finally(() => setLoadingProjects(false));
  }, [selectedWorkspaceId]);

  const toggleProject = async (projectId: string) => {
    const next = new Set(expandedProjects);
    if (next.has(projectId)) {
      next.delete(projectId);
      setExpandedProjects(next);
      return;
    }
    next.add(projectId);
    setExpandedProjects(next);

    if (!projectTracks[projectId]) {
      setLoadingTracks(prev => new Set(prev).add(projectId));
      try {
        const tracks = await tracksApi.list({ project_id: projectId });
        setProjectTracks(prev => ({ ...prev, [projectId]: tracks }));
      } catch (err) {
        console.error('Failed to load tracks:', err);
      } finally {
        setLoadingTracks(prev => { const s = new Set(prev); s.delete(projectId); return s; });
      }
    }
  };

  const toggleTrack = (trackId: string) => {
    const next = new Set(expandedTracks);
    if (next.has(trackId)) next.delete(trackId);
    else next.add(trackId);
    setExpandedTracks(next);
  };

  const handleAddTrack = async (track: Track) => {
    if (!track.audio_url) return;
    setAddingId(track.id);
    try {
      await addLayer({
        source_type: 'master',
        name: track.title,
        audio_url: track.audio_url,
        volume: 1.0,
        is_muted: false,
        is_solo: false,
        is_locked: false,
        sort_order: nextOrder,
      });
      onClose();
    } catch (err) {
      console.error('Failed to add track layer:', err);
    } finally {
      setAddingId(null);
    }
  };

  const handleAddStem = async (stem: Stem, trackTitle: string) => {
    setAddingId(stem.id);
    try {
      await addLayer({
        source_type: 'stem',
        name: `${stem.instrument_class.charAt(0).toUpperCase()}${stem.instrument_class.slice(1)} — ${trackTitle}`,
        audio_url: stem.audio_url,
        stem_id: stem.id,
        volume: 1.0,
        is_muted: false,
        is_solo: false,
        is_locked: false,
        sort_order: nextOrder,
      });
      onClose();
    } catch (err) {
      console.error('Failed to add stem layer:', err);
    } finally {
      setAddingId(null);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-white dark:bg-zinc-900 rounded-xl shadow-2xl border border-zinc-200 dark:border-white/10 w-[680px] max-w-[95vw] h-[520px] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-zinc-200 dark:border-white/10 flex-shrink-0">
          <h3 className="text-sm font-semibold text-zinc-900 dark:text-white">Add from Library</h3>
          <button
            onClick={onClose}
            className="p-1 rounded-full hover:bg-zinc-100 dark:hover:bg-white/10 text-zinc-500 dark:text-zinc-400 transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <div className="flex flex-1 min-h-0">
          {/* Left: workspace list */}
          <div className="w-44 flex-shrink-0 border-r border-zinc-200 dark:border-white/10 overflow-y-auto py-2">
            {loadingWorkspaces ? (
              <div className="px-4 py-6 text-xs text-zinc-400 dark:text-zinc-500 text-center">Loading…</div>
            ) : workspaces.length === 0 ? (
              <div className="px-4 py-6 text-xs text-zinc-400 dark:text-zinc-500 text-center">No workspaces</div>
            ) : (
              workspaces.map(ws => (
                <button
                  key={ws.id}
                  onClick={() => setSelectedWorkspaceId(ws.id)}
                  className={`w-full text-left px-3 py-2 text-xs font-medium transition-colors truncate ${
                    selectedWorkspaceId === ws.id
                      ? 'bg-pink-50 dark:bg-pink-900/20 text-pink-600 dark:text-pink-400'
                      : 'text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-white/5'
                  }`}
                >
                  {ws.name}
                </button>
              ))
            )}
          </div>

          {/* Right: projects / tracks / stems */}
          <div className="flex-1 overflow-y-auto">
            {loadingProjects ? (
              <div className="px-4 py-8 text-xs text-zinc-400 dark:text-zinc-500 text-center">Loading projects…</div>
            ) : projects.length === 0 ? (
              <div className="px-4 py-8 text-xs text-zinc-400 dark:text-zinc-500 text-center">No projects in this workspace</div>
            ) : (
              projects.map(project => {
                const isExpanded = expandedProjects.has(project.id);
                const tracks = projectTracks[project.id] ?? [];
                const isLoadingTracks = loadingTracks.has(project.id);

                return (
                  <div key={project.id}>
                    <button
                      onClick={() => toggleProject(project.id)}
                      className="w-full flex items-center gap-2 px-4 py-2.5 hover:bg-zinc-50 dark:hover:bg-white/5 transition-colors text-left border-b border-zinc-100 dark:border-white/5"
                    >
                      {isExpanded
                        ? <ChevronDown size={13} className="text-zinc-400 flex-shrink-0" />
                        : <ChevronRight size={13} className="text-zinc-400 flex-shrink-0" />
                      }
                      <span className="text-xs font-semibold text-zinc-700 dark:text-zinc-200 truncate">{project.name}</span>
                    </button>

                    {isExpanded && (
                      <div>
                        {isLoadingTracks ? (
                          <div className="px-8 py-3 text-xs text-zinc-400 dark:text-zinc-500">Loading tracks…</div>
                        ) : tracks.length === 0 ? (
                          <div className="px-8 py-3 text-xs text-zinc-400 dark:text-zinc-500">No tracks</div>
                        ) : (
                          tracks.map(track => {
                            const isTrackExpanded = expandedTracks.has(track.id);
                            const stems = track.stems ?? [];

                            return (
                              <div key={track.id}>
                                <div className="flex items-center gap-2 px-6 py-2 border-b border-zinc-100 dark:border-white/5 hover:bg-zinc-50 dark:hover:bg-white/5 group">
                                  {stems.length > 0 ? (
                                    <button
                                      onClick={() => toggleTrack(track.id)}
                                      className="flex-shrink-0 text-zinc-400"
                                    >
                                      {isTrackExpanded
                                        ? <ChevronDown size={12} />
                                        : <ChevronRight size={12} />
                                      }
                                    </button>
                                  ) : (
                                    <span className="w-3 flex-shrink-0" />
                                  )}
                                  <Music size={12} className="text-blue-400 flex-shrink-0" />
                                  <span className="flex-1 text-xs text-zinc-700 dark:text-zinc-300 truncate">{track.title}</span>
                                  {track.audio_url && (
                                    <button
                                      onClick={() => handleAddTrack(track)}
                                      disabled={addingId === track.id}
                                      className="flex-shrink-0 flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium bg-pink-500 hover:bg-pink-600 text-white transition-colors disabled:opacity-50 opacity-0 group-hover:opacity-100"
                                    >
                                      <Plus size={10} />
                                      Add
                                    </button>
                                  )}
                                </div>

                                {isTrackExpanded && stems.map((stem: Stem) => (
                                  <div
                                    key={stem.id}
                                    className="flex items-center gap-2 px-10 py-1.5 border-b border-zinc-100 dark:border-white/5 hover:bg-zinc-50 dark:hover:bg-white/5 group"
                                  >
                                    <Disc size={11} className="text-green-400 flex-shrink-0" />
                                    <span className="flex-1 text-xs text-zinc-600 dark:text-zinc-400 capitalize truncate">
                                      {stem.instrument_class}
                                    </span>
                                    <button
                                      onClick={() => handleAddStem(stem, track.title)}
                                      disabled={addingId === stem.id}
                                      className="flex-shrink-0 flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium bg-green-500 hover:bg-green-600 text-white transition-colors disabled:opacity-50 opacity-0 group-hover:opacity-100"
                                    >
                                      <Plus size={10} />
                                      Add
                                    </button>
                                  </div>
                                ))}
                              </div>
                            );
                          })
                        )}
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default StudioLibraryModal;
