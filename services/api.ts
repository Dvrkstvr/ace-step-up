import type {
  GenerationParams,
  Workspace,
  Project,
  Track,
  Stem,
  StudioSession,
  StudioLayer,
  LayerSourceType,
  RepaintParams,
} from '../types';

// Use relative URLs so Vite proxy handles them (enables LAN access)
const API_BASE = '';

// Resolve audio URL based on storage type
export function getAudioUrl(audioUrl: string | undefined | null, songId?: string): string | undefined {
  if (!audioUrl) return undefined;

  // Local storage: already relative, works with proxy
  if (audioUrl.startsWith('/audio/')) {
    return audioUrl;
  }

  // Already a full URL
  return audioUrl;
}

interface ApiOptions {
  method?: string;
  body?: unknown;
}

async function api<T>(endpoint: string, options: ApiOptions = {}): Promise<T> {
  const { method = 'GET', body } = options;

  const headers: HeadersInit = {
    'Content-Type': 'application/json',
  };

  const response = await fetch(`${API_BASE}${endpoint}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
    credentials: 'include',
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Request failed' }));
    const errorMessage = error.error || error.message || 'Request failed';
    // Include status code in error for proper handling
    throw new Error(`${response.status}: ${errorMessage}`);
  }

  if (response.status === 204 || response.headers.get('content-length') === '0') {
    return undefined as T;
  }
  return response.json();
}

// Generation API

export interface GenerationJob {
  jobId: string;
  id?: string;
  status: 'pending' | 'queued' | 'running' | 'succeeded' | 'failed';
  queuePosition?: number;
  etaSeconds?: number;
  progress?: number;
  stage?: string;
  params?: any;
  created_at?: string;
  result?: {
    audioUrls: string[];
    bpm?: number;
    duration?: number;
    keyScale?: string;
    timeSignature?: string;
  };
  error?: string;
}

export const generateApi = {
  startGeneration: (params: GenerationParams & { workspace_id?: string; project_id?: string; parent_track_id?: string }): Promise<GenerationJob> =>
    api('/api/generate', { method: 'POST', body: params }),

  getStatus: (jobId: string): Promise<GenerationJob> =>
    api(`/api/generate/status/${jobId}`),

  getHistory: (): Promise<{ jobs: GenerationJob[] }> =>
    api('/api/generate/history'),

  uploadAudio: async (file: File): Promise<{ url: string; key: string }> => {
    const formData = new FormData();
    formData.append('audio', file);
    const response = await fetch(`${API_BASE}/api/generate/upload-audio`, {
      method: 'POST',
      body: formData,
    });
    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Upload failed' }));
      throw new Error(error.details || error.error || 'Upload failed');
    }
    return response.json();
  },

  formatInput: (params: {
    caption: string;
    lyrics?: string;
    bpm?: number;
    duration?: number;
    keyScale?: string;
    timeSignature?: string;
    vocalLanguage?: string;
    temperature?: number;
    topK?: number;
    topP?: number;
    lmModel?: string;
    lmBackend?: string;
  }): Promise<{
    caption?: string;
    lyrics?: string;
    bpm?: number;
    duration?: number;
    key_scale?: string;
    vocal_language?: string;
    time_signature?: string;
    status_message?: string;
    error?: string;
  }> => api('/api/generate/format', { method: 'POST', body: params }),

  generateTitle: (params: { caption?: string; lyrics?: string }): Promise<{ title: string }> =>
    api('/api/generate/generate-title', { method: 'POST', body: params }),

  // Random description from Gradio's example library
  getRandomDescription: (): Promise<{
    description: string;
    instrumental: boolean;
    vocalLanguage: string;
  }> => api('/api/generate/random-description'),

  // LoRA Inference (requires ACE-Step training fork)
  loadLora: (params: {
    lora_path: string;
  }): Promise<{
    message: string;
    lora_path: string;
  }> => api('/api/lora/load', { method: 'POST', body: params }),

  unloadLora: (): Promise<{
    message: string;
  }> => api('/api/lora/unload', { method: 'POST' }),

  setLoraScale: (params: {
    scale: number;
  }): Promise<{
    message: string;
    scale: number;
  }> => api('/api/lora/scale', { method: 'POST', body: params }),

  toggleLora: (params: {
    enabled: boolean;
  }): Promise<{
    message: string;
    active: boolean;
  }> => api('/api/lora/toggle', { method: 'POST', body: params }),

  getLoraStatus: (): Promise<{
    loaded: boolean;
    active: boolean;
    scale: number;
    path: string;
  }> => api('/api/lora/status'),
};

// Training API (LoRA fine-tuning via Gradio)

export interface TrainingSample {
  audio: unknown;
  filename: string;
  caption: string;
  genre: string;
  promptOverride: string;
  lyrics: string;
  bpm: number;
  key: string;
  timeSignature: string;
  duration: number;
  language: string;
  instrumental: boolean;
  rawLyrics?: string;
}

export interface DatasetSettings {
  datasetName: string;
  customTag: string;
  tagPosition: 'prepend' | 'append' | 'replace';
  allInstrumental: boolean;
  genreRatio: number;
}

export interface TrainingParams {
  tensorDir?: string;
  rank?: number;
  alpha?: number;
  dropout?: number;
  learningRate?: number;
  epochs?: number;
  batchSize?: number;
  gradientAccumulation?: number;
  saveEvery?: number;
  shift?: number;
  seed?: number;
  outputDir?: string;
  resumeCheckpoint?: string | null;
}

// Helper: build proxy URL for training audio files
export function getTrainingAudioUrl(audioPath: unknown): string | undefined {
  if (!audioPath) return undefined;

  // Handle Gradio FileData objects
  if (typeof audioPath === 'object' && audioPath !== null) {
    const fd = audioPath as Record<string, unknown>;
    if (fd.url && typeof fd.url === 'string') return fd.url;
    if (fd.path && typeof fd.path === 'string') {
      return `${API_BASE}/api/training/audio?path=${encodeURIComponent(fd.path)}`;
    }
    return undefined;
  }

  // Handle absolute path string
  if (typeof audioPath === 'string') {
    if (audioPath.startsWith('http://') || audioPath.startsWith('https://') || audioPath.startsWith('/audio/')) {
      return audioPath;
    }
    return `${API_BASE}/api/training/audio?path=${encodeURIComponent(audioPath)}`;
  }

  return undefined;
}

export const trainingApi = {
  // Upload audio files for a dataset
  uploadAudio: async (files: File[], datasetName: string): Promise<{
    files: Array<{ filename: string; originalName: string; size: number; path: string }>;
    uploadDir: string;
    count: number;
  }> => {
    const formData = new FormData();
    formData.append('datasetName', datasetName);
    for (const file of files) {
      formData.append('audio', file);
    }
    const response = await fetch(`${API_BASE}/api/training/upload-audio`, {
      method: 'POST',
      body: formData,
    });
    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Upload failed' }));
      throw new Error(error.error || 'Upload failed');
    }
    return response.json();
  },

  // Build dataset JSON from uploaded audio files
  buildDataset: (params: {
    datasetName: string;
    customTag?: string;
    tagPosition?: string;
    allInstrumental?: boolean;
  }): Promise<{
    status: string;
    dataframe: unknown;
    sampleCount: number;
    sample: TrainingSample;
    settings: DatasetSettings;
    datasetPath: string;
  }> => api('/api/training/build-dataset', { method: 'POST', body: params }),

  // Scan directory for audio files (Node.js implementation)
  scanDirectory: (params: {
    audioDir: string;
    datasetName?: string;
    customTag?: string;
    tagPosition?: string;
    allInstrumental?: boolean;
  }): Promise<{
    status: string;
    dataframe: unknown;
    sampleCount: number;
    audioDir: string;
  }> => api('/api/training/scan-directory', { method: 'POST', body: params }),

  // Auto-label dataset samples (requires model loaded in Gradio)
  autoLabel: (params: {
    skipMetas?: boolean;
    formatLyrics?: boolean;
    transcribeLyrics?: boolean;
    onlyUnlabeled?: boolean;
  }): Promise<{
    dataframe?: unknown;
    status: string;
    error?: string;
    hint?: string;
  }> => api('/api/training/auto-label', { method: 'POST', body: params }),

  // Initialize model for training (requires Gradio)
  initModel: (params: {
    checkpoint?: string;
    configPath?: string;
    device?: string;
    initLlm?: boolean;
    lmModelPath?: string;
    backend?: string;
    useFlashAttention?: boolean;
    offloadToCpu?: boolean;
    offloadDitToCpu?: boolean;
    compileModel?: boolean;
    quantization?: boolean;
  }): Promise<{
    status: string;
    modelReady?: boolean;
    error?: string;
    hint?: string;
  }> => api('/api/training/init-model', { method: 'POST', body: params }),

  // List available checkpoints
  getCheckpoints: (): Promise<{
    checkpoints: string[];
    configs: string[];
  }> => api('/api/training/checkpoints'),

  // List LoRA training checkpoints
  getLoraCheckpoints: (dir: string): Promise<{
    checkpoints: string[];
    outputDir: string;
  }> => api(`/api/training/lora-checkpoints?dir=${encodeURIComponent(dir)}`),

  // Preprocess dataset to tensors
  preprocess: (params: {
    datasetPath: string;
    outputDir?: string;
  }): Promise<{
    status: string;
    message?: string;
    output_files?: number;
  }> => api('/api/training/preprocess', { method: 'POST', body: params }),

  loadDataset: (datasetPath: string): Promise<{
    status: string;
    dataframe: unknown;
    sampleCount: number;
    sample: TrainingSample;
    settings: DatasetSettings;
  }> => api('/api/training/load-dataset', { method: 'POST', body: { datasetPath } }),

  getSamplePreview: (idx: number): Promise<TrainingSample> =>
    api(`/api/training/sample-preview?idx=${idx}`),

  saveSample: (params: {
    sampleIdx: number;
    caption: string;
    genre: string;
    promptOverride: string;
    lyrics: string;
    bpm: number;
    key: string;
    timeSignature: string;
    language: string;
    instrumental: boolean;
  }): Promise<{ dataframe: unknown; status: string }> =>
    api('/api/training/save-sample', { method: 'POST', body: params }),

  updateSettings: (params: {
    customTag: string;
    tagPosition: string;
    allInstrumental: boolean;
    genreRatio: number;
  }): Promise<{ success: boolean }> =>
    api('/api/training/update-settings', { method: 'POST', body: params }),

  saveDataset: (params: {
    savePath?: string;
    datasetName?: string;
    customTag?: string;
    tagPosition?: string;
    allInstrumental?: boolean;
    genreRatio?: number;
  }): Promise<{ status: string; path: string }> =>
    api('/api/training/save-dataset', { method: 'POST', body: params }),

  loadTensors: (tensorDir: string): Promise<{ status: string }> =>
    api('/api/training/load-tensors', { method: 'POST', body: { tensorDir } }),

  startTraining: (params: TrainingParams): Promise<{
    progress: string;
    log: string;
    metrics: unknown;
  }> => api('/api/training/start', { method: 'POST', body: params }),

  stopTraining: (): Promise<{ status: string }> =>
    api('/api/training/stop', { method: 'POST' }),

  exportLora: (params: {
    exportPath?: string;
    loraOutputDir?: string;
  }): Promise<{ status: string }> =>
    api('/api/training/export', { method: 'POST', body: params }),

  importDataset: (datasetType: string): Promise<{ status: string }> =>
    api('/api/training/import-dataset', { method: 'POST', body: { datasetType } }),
};

// Workspace API

export const workspacesApi = {
  list: () => api<Workspace[]>('/api/workspaces'),
  create: (name: string, type?: string) =>
    api<Workspace>('/api/workspaces', { method: 'POST', body: { name, type } }),
  update: (id: string, data: Partial<Pick<Workspace, 'name' | 'type'>>) =>
    api<Workspace>(`/api/workspaces/${id}`, { method: 'PATCH', body: data }),
  delete: (id: string) =>
    api<void>(`/api/workspaces/${id}`, { method: 'DELETE' }),
};

// Projects API

export const projectsApi = {
  list: (workspaceId: string) =>
    api<Project[]>(`/api/workspaces/${workspaceId}/projects`),
  create: (workspaceId: string, name: string) =>
    api<Project>(`/api/workspaces/${workspaceId}/projects`, { method: 'POST', body: { name } }),
  promote: (trackId: string) =>
    api<Project>(`/api/tracks/${trackId}/promote`, { method: 'POST' }),
  update: (id: string, data: Partial<Pick<Project, 'name'>>) =>
    api<Project>(`/api/projects/${id}`, { method: 'PATCH', body: data }),
  delete: (id: string) =>
    api<void>(`/api/projects/${id}`, { method: 'DELETE' }),
};

// Tracks API

export const tracksApi = {
  list: (filters?: { workspace_id?: string; project_id?: string; parent_track_id?: string }) =>
    api<Track[]>('/api/tracks' + (filters ? '?' + new URLSearchParams(filters as any).toString() : '')),
  get: (id: string) =>
    api<Track>(`/api/tracks/${id}`),
  create: (data: Partial<Track> & { title: string; workspace_id: string }) =>
    api<Track>('/api/tracks', { method: 'POST', body: data }),
  update: (id: string, data: Partial<Track>) =>
    api<Track>(`/api/tracks/${id}`, { method: 'PATCH', body: data }),
  delete: (id: string) =>
    api<void>(`/api/tracks/${id}`, { method: 'DELETE' }),
  iterate: (id: string) =>
    api<{ sourceTrackId: string; workspaceId: string; projectId?: string; caption?: string; lyrics?: string; duration?: number; bpm?: number; keyScale?: string; timeSignature?: string; taskType?: string; ditModel?: string; inferenceSteps?: number; guidanceScale?: number; shift?: number; vocalLanguage?: string }>(`/api/tracks/${id}/iterate`, { method: 'POST', body: {} }),
  splitStems: (id: string, params: { model?: string; stems?: string[] }) =>
    api<{ jobId: string }>(`/api/tracks/${id}/split-stems`, { method: 'POST', body: params }),
  getStemJob: (id: string, jobId: string) =>
    api<{ status: 'running' | 'succeeded' | 'failed'; stems?: Stem[]; error?: string; elapsed: number }>(`/api/tracks/${id}/split-stems/${jobId}`),
};

// Stems API

export const stemsApi = {
  list: (trackId: string) =>
    api<Stem[]>(`/api/tracks/${trackId}/stems`),
  create: (trackId: string, data: { instrument_class: string; audio_url: string; is_custom?: boolean }) =>
    api<Stem>(`/api/tracks/${trackId}/stems`, { method: 'POST', body: data }),
  update: (id: string, data: Partial<Pick<Stem, 'instrument_class' | 'audio_url'>>) =>
    api<Stem>(`/api/stems/${id}`, { method: 'PATCH', body: data }),
  delete: (id: string) =>
    api<void>(`/api/stems/${id}`, { method: 'DELETE' }),
};

// Studio API

export const studioApi = {
  getOrCreateSession: (trackId: string) =>
    api<StudioSession>(`/api/studio/sessions/${trackId}`),
  createSession: (trackId: string, name?: string) =>
    api<StudioSession>('/api/studio/sessions', { method: 'POST', body: { track_id: trackId, name } }),
  deleteSession: (sessionId: string) =>
    api<void>(`/api/studio/sessions/${sessionId}`, { method: 'DELETE' }),

  getLayers: (sessionId: string) =>
    api<StudioLayer[]>(`/api/studio/sessions/${sessionId}/layers`),
  addLayer: (sessionId: string, data: Partial<StudioLayer> & { source_type: LayerSourceType; name: string; audio_url: string }) =>
    api<StudioLayer>(`/api/studio/sessions/${sessionId}/layers`, { method: 'POST', body: data }),
  updateLayer: (layerId: string, data: Partial<Pick<StudioLayer, 'name' | 'volume' | 'is_muted' | 'is_solo' | 'sort_order' | 'start_offset' | 'clip_start' | 'clip_end'>>) =>
    api<StudioLayer>(`/api/studio/layers/${layerId}`, { method: 'PATCH', body: data }),
  deleteLayer: (layerId: string) =>
    api<void>(`/api/studio/layers/${layerId}`, { method: 'DELETE' }),

  repaintRegion: (layerId: string, params: RepaintParams) =>
    api<StudioLayer>(`/api/studio/layers/${layerId}/repaint`, { method: 'POST', body: params }),
  generateOnLayer: (layerId: string, params: Partial<GenerationParams>) =>
    api<StudioLayer>(`/api/studio/layers/${layerId}/generate`, { method: 'POST', body: params }),
  revertLayer: (layerId: string) =>
    api<StudioLayer>(`/api/studio/layers/${layerId}/revert`, { method: 'POST' }),

  mixdown: (sessionId: string, saveAs: 'new_track' | 'new_version' | 'replace', name?: string) =>
    api<Track>(`/api/studio/sessions/${sessionId}/mixdown`, {
      method: 'POST', body: { save_as: saveAs, name }
    }),
};
