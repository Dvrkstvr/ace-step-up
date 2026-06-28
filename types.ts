// === Data Models ===

export interface Workspace {
  id: string;
  name: string;
  type: string;
  track_count?: number;
  created_at: string;
}

export interface Project {  // A "Song"
  id: string;
  workspace_id: string;
  name: string;
  track_count?: number;
  latest_track_title?: string;
  latest_audio_url?: string;
  tracks?: Track[];
  created_at: string;
}

export interface Track {
  id: string;
  workspace_id?: string;
  project_id?: string;
  parent_track_id?: string;
  title: string;
  audio_url?: string;
  task_type: string;
  prompt?: string;
  lyrics?: string;
  style?: string;
  duration?: number;
  bpm?: number;
  key_scale?: string;
  time_signature?: string;
  parameters?: GenerationParams;
  seed?: number;
  cover_url?: string;
  tags: string[];
  stems?: Stem[];
  children?: Track[];
  has_stems?: boolean;
  isGenerating?: boolean;
  progress?: number;
  stage?: string;
  created_at: string;
}

export interface Stem {
  id: string;
  track_id: string;
  instrument_class: string;
  audio_url: string;
  is_custom: boolean;
  created_at: string;
}

// === Studio ===

export interface StudioSession {
  id: string;
  track_id: string;
  name?: string;
  is_active: boolean;
  layers: StudioLayer[];
  created_at: string;
}

export type LayerSourceType = 'master' | 'stem' | 'upload' | 'generated' | 'repaint';

export interface StudioLayer {
  id: string;
  session_id: string;
  stem_id?: string;
  parent_layer_id?: string;
  source_type: LayerSourceType;
  name: string;
  audio_url: string;
  original_audio_url?: string;
  volume: number;
  is_muted: boolean;
  is_solo: boolean;
  is_locked: boolean;
  sort_order: number;
  // Clip positioning on the timeline (seconds from t=0)
  start_offset: number;
  // Trim points within the source audio (seconds); clip_end=null means play to end
  clip_start: number;
  clip_end: number | null;
  // Repaint region (which portion of this layer to repaint)
  region_start?: number;
  region_end?: number;
  generation_params?: Partial<GenerationParams>;
  created_at: string;
}

export interface RepaintParams {
  region_start: number;
  region_end: number;
  prompt?: string;
  style?: string;
  instruction?: string;
}

// === Navigation ===

export type TopView = 'generation' | 'training';

export type BreadcrumbLevel =
  | { level: 'root' }
  | { level: 'workspace'; workspace: Workspace }
  | { level: 'song'; workspace: Workspace; project: Project };

// === Generation ===

export interface GenerationParams {
  // Mode
  customMode: boolean;

  // Simple Mode
  songDescription?: string;

  // Custom Mode
  prompt: string;
  lyrics: string;
  style: string;
  title: string;
  ditModel?: string;

  // Common
  instrumental: boolean;
  vocalLanguage: string;

  // Music Parameters
  bpm: number;
  keyScale: string;
  timeSignature: string;
  duration: number;

  // Generation Settings
  inferenceSteps: number;
  guidanceScale: number;
  batchSize: number;
  randomSeed: boolean;
  seed: number;
  thinking: boolean;
  enhance?: boolean;
  audioFormat: 'mp3' | 'flac';
  inferMethod: 'ode' | 'sde';
  shift: number;

  // LM Parameters
  lmTemperature: number;
  lmCfgScale: number;
  lmTopK: number;
  lmTopP: number;
  lmNegativePrompt: string;
  lmBackend?: 'pt' | 'vllm';
  lmModel?: string;

  // Expert Parameters
  referenceAudioUrl?: string;
  sourceAudioUrl?: string;
  referenceAudioTitle?: string;
  sourceAudioTitle?: string;
  audioCodes?: string;
  repaintingStart?: number;
  repaintingEnd?: number;
  instruction?: string;
  audioCoverStrength?: number;
  taskType?: string;
  useAdg?: boolean;
  cfgIntervalStart?: number;
  cfgIntervalEnd?: number;
  customTimesteps?: string;
  useCotMetas?: boolean;
  useCotCaption?: boolean;
  useCotLanguage?: boolean;
  autogen?: boolean;
  constrainedDecodingDebug?: boolean;
  allowLmBatch?: boolean;
  getScores?: boolean;
  getLrc?: boolean;
  scoreScale?: number;
  lmBatchChunkSize?: number;
  trackName?: string;
  completeTrackClasses?: string[];
  isFormatCaption?: boolean;
}
