import React, { createContext, useContext, useState, useCallback, ReactNode } from 'react';
import { StudioSession, StudioLayer, Track, LayerSourceType } from '../types';
import { studioApi } from '../services/api';

interface StudioContextType {
  isOpen: boolean;
  session: StudioSession | null;
  layers: StudioLayer[];
  selectedRegion: { layerId: string; start: number; end: number } | null;

  openStudio: (track: Track) => Promise<void>;
  closeStudio: () => void;

  addLayer: (data: Partial<StudioLayer> & { source_type: LayerSourceType; name: string; audio_url: string }) => Promise<void>;
  updateLayer: (layerId: string, data: Partial<Pick<StudioLayer, 'name' | 'volume' | 'is_muted' | 'is_solo' | 'sort_order'>>) => Promise<void>;
  deleteLayer: (layerId: string) => Promise<void>;
  reorderLayers: (newOrder: StudioLayer[]) => void;

  setSelectedRegion: (region: { layerId: string; start: number; end: number } | null) => void;
  revertLayer: (layerId: string) => Promise<void>;

  mixdown: (saveAs: 'new_track' | 'new_version' | 'replace', name?: string) => Promise<Track>;
}

const StudioContext = createContext<StudioContextType | undefined>(undefined);

export function StudioProvider({ children }: { children: ReactNode }): React.ReactElement {
  const [isOpen, setIsOpen] = useState(false);
  const [session, setSession] = useState<StudioSession | null>(null);
  const [layers, setLayers] = useState<StudioLayer[]>([]);
  const [selectedRegion, setSelectedRegion] = useState<{ layerId: string; start: number; end: number } | null>(null);

  const openStudio = useCallback(async (track: Track): Promise<void> => {
    const s = await studioApi.getOrCreateSession(track.id);
    setSession(s);
    setLayers(s.layers ?? []);
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

  const updateLayer = useCallback(async (
    layerId: string,
    data: Partial<Pick<StudioLayer, 'name' | 'volume' | 'is_muted' | 'is_solo' | 'sort_order'>>
  ): Promise<void> => {
    const updated = await studioApi.updateLayer(layerId, data);
    setLayers(prev => prev.map(l => l.id === layerId ? updated : l));
  }, []);

  const deleteLayer = useCallback(async (layerId: string): Promise<void> => {
    await studioApi.deleteLayer(layerId);
    setLayers(prev => prev.filter(l => l.id !== layerId));
  }, []);

  const reorderLayers = useCallback((newOrder: StudioLayer[]): void => {
    setLayers(newOrder);
    // Optimistically update sort_order on each layer
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
    setLayers(refreshed);
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
    openStudio,
    closeStudio,
    addLayer,
    updateLayer,
    deleteLayer,
    reorderLayers,
    setSelectedRegion,
    revertLayer,
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
