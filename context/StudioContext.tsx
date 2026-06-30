import React, { createContext, useContext, useState, useCallback, ReactNode } from 'react';
import { StudioSession, StudioLayer, Track, LayerSourceType } from '../types';
import { studioApi, stemsApi } from '../services/api';

export type StudioTool = 'move' | 'select' | 'cut';

/** Params surfaced into the bottom-panel Generate / Compose form from a right-click action. */
export interface GeneratePrefill {
  prompt:         string;
  style:          string;
  lyrics:         string;
  inferenceSteps: number;
  guidanceScale:  number;
}

interface StudioContextType {
  isOpen: boolean;
  session: StudioSession | null;
  layers: StudioLayer[];
  selectedRegion: { rowId: string; start: number; end: number } | null;
  activeTool: StudioTool;
  setActiveTool: (tool: StudioTool) => void;

  /** Seek the transport playhead to a specific time. Set by Studio.tsx after it initialises useStudioAudio. */
  seekPlayhead: ((seconds: number) => void) | null;
  setSeekPlayhead: (fn: ((seconds: number) => void) | null) => void;

  openStudio: (track: Track) => Promise<void>;
  closeStudio: () => void;

  addLayer: (data: Partial<StudioLayer> & { source_type: LayerSourceType; name: string; audio_url: string }) => Promise<void>;
  addLocalLayer: (layer: StudioLayer) => void;
  removeLocalLayer: (id: string) => void;
  updateLayer: (layerId: string, data: Partial<Pick<StudioLayer, 'name' | 'volume' | 'is_muted' | 'is_solo' | 'sort_order' | 'start_offset' | 'clip_start' | 'clip_end' | 'row_id'>>) => Promise<void>;
  deleteLayer: (layerId: string) => Promise<void>;
  reorderLayers: (newOrder: StudioLayer[]) => void;

  setSelectedRegion: (region: { rowId: string; start: number; end: number } | null) => void;
  revertLayer: (layerId: string) => Promise<void>;

  /** Populated by the timeline context menu; consumed + cleared by StudioBottomPanel. */
  generatePrefill: GeneratePrefill | null;
  setGeneratePrefill: (p: GeneratePrefill | null) => void;

  mixdown: (saveAs: 'new_track' | 'new_version' | 'replace', name?: string) => Promise<Track>;
}

const StudioContext = createContext<StudioContextType | undefined>(undefined);

/**
 * Removes child clips whose row_id points at an anchor that no longer exists
 * (e.g. left behind by a layer deletion from before cascade-delete was added
 * server-side) and deletes them server-side so they don't keep reappearing.
 */
function pruneOrphanClips(layers: StudioLayer[]): StudioLayer[] {
  const ids = new Set(layers.map(l => l.id));
  const valid: StudioLayer[] = [];
  const orphans: StudioLayer[] = [];
  for (const l of layers) {
    if (l.row_id && !ids.has(l.row_id)) orphans.push(l);
    else valid.push(l);
  }
  if (orphans.length > 0) {
    Promise.all(orphans.map(o => studioApi.deleteLayer(o.id))).catch(err =>
      console.error('Failed to clean up orphan clips:', err)
    );
  }
  return valid;
}

export function StudioProvider({ children }: { children: ReactNode }): React.ReactElement {
  const [isOpen, setIsOpen] = useState(false);
  const [session, setSession] = useState<StudioSession | null>(null);
  const [layers, setLayers] = useState<StudioLayer[]>([]);
  const [generatePrefill, setGeneratePrefill] = useState<GeneratePrefill | null>(null);
  const [selectedRegion, setSelectedRegion] = useState<{ rowId: string; start: number; end: number } | null>(null);
  const [activeTool, setActiveTool] = useState<StudioTool>('move');
  const [seekPlayhead, setSeekPlayheadState] = useState<((seconds: number) => void) | null>(null);
  const setSeekPlayhead = useCallback((fn: ((seconds: number) => void) | null) => {
    setSeekPlayheadState(() => fn);
  }, []);

  const openStudio = useCallback(async (track: Track): Promise<void> => {
    const s = await studioApi.getOrCreateSession(track.id);
    setSession(s);

    const isNewSession = (s.layers ?? []).length <= 1;
    if (isNewSession) {
      // Resolve stems: prefer stems already on the track object, fall back to API fetch
      let stems = track.stems;
      if (!stems || stems.length === 0) {
        stems = await stemsApi.list(track.id).catch(() => []);
      }

      if (stems && stems.length > 0) {
        await Promise.all(stems.map((stem, i) =>
          studioApi.addLayer(s.id, {
            source_type: 'stem',
            name: stem.instrument_class.charAt(0).toUpperCase() + stem.instrument_class.slice(1),
            audio_url: stem.audio_url,
            stem_id: stem.id,
            volume: 1.0,
            is_muted: false,
            is_solo: false,
            is_locked: false,
            sort_order: i + 1,
          })
        ));
        const refreshed = await studioApi.getLayers(s.id);
        setLayers(pruneOrphanClips(Array.isArray(refreshed) ? refreshed : (refreshed as any).layers ?? []));
      } else {
        setLayers(pruneOrphanClips(s.layers ?? []));
      }
    } else {
      setLayers(pruneOrphanClips(s.layers ?? []));
    }

    setIsOpen(true);
  }, []);

  const closeStudio = useCallback((): void => {
    setIsOpen(false);
    setSession(null);
    setLayers([]);
    setSelectedRegion(null);
  }, []);

  const addLayer = useCallback(async (
    data: Partial<StudioLayer> & { source_type: LayerSourceType; name: string; audio_url: string }
  ): Promise<void> => {
    if (!session) throw new Error('No active studio session');
    const newLayer = await studioApi.addLayer(session.id, data);
    setLayers(prev => [...prev, newLayer]);
  }, [session]);

  const addLocalLayer = useCallback((layer: StudioLayer): void => {
    setLayers(prev => [...prev, layer]);
  }, []);

  const removeLocalLayer = useCallback((id: string): void => {
    setLayers(prev => prev.filter(l => l.id !== id));
  }, []);

  const updateLayer = useCallback(async (
    layerId: string,
    data: Partial<Pick<StudioLayer, 'name' | 'volume' | 'is_muted' | 'is_solo' | 'sort_order' | 'start_offset' | 'clip_start' | 'clip_end' | 'row_id'>>
  ): Promise<void> => {
    const updated = await studioApi.updateLayer(layerId, data);
    setLayers(prev => prev.map(l => l.id === layerId ? updated : l));
  }, []);

  const deleteLayer = useCallback(async (layerId: string): Promise<void> => {
    await studioApi.deleteLayer(layerId); // server also deletes children (row_id = layerId)
    setLayers(prev => prev.filter(l => l.id !== layerId && l.row_id !== layerId));
  }, []);

  const reorderLayers = useCallback((newOrder: StudioLayer[]): void => {
    setLayers(newOrder);
    newOrder.forEach((layer, index) => {
      studioApi.updateLayer(layer.id, { sort_order: index }).catch(err => {
        console.error('Failed to update layer sort_order:', err);
      });
    });
  }, []);

  const revertLayer = useCallback(async (layerId: string): Promise<void> => {
    await studioApi.revertLayer(layerId);
    if (!session) return;
    const refreshed = await studioApi.getLayers(session.id);
    setLayers(pruneOrphanClips(Array.isArray(refreshed) ? refreshed : (refreshed as any).layers ?? []));
  }, [session]);

  const mixdown = useCallback(async (
    saveAs: 'new_track' | 'new_version' | 'replace',
    name?: string
  ): Promise<Track> => {
    if (!session) throw new Error('No active studio session');
    return studioApi.mixdown(session.id, saveAs, name);
  }, [session]);

  const value: StudioContextType = {
    isOpen,
    session,
    layers,
    selectedRegion,
    activeTool,
    setActiveTool,
    seekPlayhead,
    setSeekPlayhead,
    openStudio,
    closeStudio,
    addLayer,
    addLocalLayer,
    removeLocalLayer,
    updateLayer,
    deleteLayer,
    reorderLayers,
    setSelectedRegion,
    revertLayer,
    generatePrefill,
    setGeneratePrefill,
    mixdown,
  };

  return <StudioContext.Provider value={value}>{children}</StudioContext.Provider>;
}

export function useStudio(): StudioContextType {
  const context = useContext(StudioContext);
  if (context === undefined) {
    throw new Error('useStudio must be used within a StudioProvider');
  }
  return context;
}
