import { db } from './pool.js';

const migrations = `
-- Drop legacy SaaS tables
DROP TABLE IF EXISTS playlist_songs;
DROP TABLE IF EXISTS playlists;
DROP TABLE IF EXISTS liked_songs;
DROP TABLE IF EXISTS comments;
DROP TABLE IF EXISTS followers;
DROP TABLE IF EXISTS contact_submissions;
DROP TABLE IF EXISTS generation_jobs;
DROP TABLE IF EXISTS reference_tracks;
DROP TABLE IF EXISTS songs;
DROP TABLE IF EXISTS users;

-- Workspaces
CREATE TABLE IF NOT EXISTS workspaces (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  type TEXT DEFAULT 'General',
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

-- Projects (a "Song" — promoted from a track)
CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

-- Tracks
CREATE TABLE IF NOT EXISTS tracks (
  id TEXT PRIMARY KEY,
  workspace_id TEXT REFERENCES workspaces(id) ON DELETE SET NULL,
  project_id TEXT REFERENCES projects(id) ON DELETE SET NULL,
  parent_track_id TEXT REFERENCES tracks(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  audio_url TEXT,
  task_type TEXT DEFAULT 'text2music',
  prompt TEXT,
  lyrics TEXT,
  style TEXT,
  duration INTEGER,
  bpm INTEGER,
  key_scale TEXT,
  time_signature TEXT,
  parameters TEXT DEFAULT '{}',
  seed INTEGER,
  cover_url TEXT,
  tags TEXT DEFAULT '[]',
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

-- Stems (instrument-separated audio from a track)
CREATE TABLE IF NOT EXISTS stems (
  id TEXT PRIMARY KEY,
  track_id TEXT NOT NULL REFERENCES tracks(id) ON DELETE CASCADE,
  instrument_class TEXT NOT NULL,
  audio_url TEXT NOT NULL,
  is_custom INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now'))
);

-- Studio Sessions (persistent DAW sessions)
CREATE TABLE IF NOT EXISTS studio_sessions (
  id TEXT PRIMARY KEY,
  track_id TEXT NOT NULL REFERENCES tracks(id) ON DELETE CASCADE,
  name TEXT,
  is_active INTEGER DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

-- Studio Layers (audio layers within a session)
CREATE TABLE IF NOT EXISTS studio_layers (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES studio_sessions(id) ON DELETE CASCADE,
  stem_id TEXT REFERENCES stems(id) ON DELETE SET NULL,
  parent_layer_id TEXT REFERENCES studio_layers(id) ON DELETE SET NULL,
  source_type TEXT NOT NULL CHECK(source_type IN ('master', 'stem', 'upload', 'generated', 'repaint')),
  name TEXT NOT NULL,
  audio_url TEXT NOT NULL,
  original_audio_url TEXT,
  volume REAL DEFAULT 1.0,
  is_muted INTEGER DEFAULT 0,
  is_solo INTEGER DEFAULT 0,
  is_locked INTEGER DEFAULT 0,
  sort_order INTEGER DEFAULT 0,
  start_offset REAL DEFAULT 0,
  clip_start REAL DEFAULT 0,
  clip_end REAL,
  region_start REAL,
  region_end REAL,
  generation_params TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

-- Generation jobs
CREATE TABLE IF NOT EXISTS generation_jobs (
  id TEXT PRIMARY KEY,
  user_id TEXT,
  track_id TEXT REFERENCES tracks(id) ON DELETE SET NULL,
  acestep_task_id TEXT,
  status TEXT DEFAULT 'pending',
  params TEXT,
  result TEXT,
  error TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

-- Reference tracks
CREATE TABLE IF NOT EXISTS reference_tracks (
  id TEXT PRIMARY KEY,
  workspace_id TEXT REFERENCES workspaces(id) ON DELETE SET NULL,
  filename TEXT NOT NULL,
  storage_key TEXT NOT NULL,
  duration INTEGER,
  file_size_bytes INTEGER,
  tags TEXT DEFAULT '[]',
  created_at TEXT DEFAULT (datetime('now'))
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_projects_workspace ON projects(workspace_id);
CREATE INDEX IF NOT EXISTS idx_tracks_workspace ON tracks(workspace_id);
CREATE INDEX IF NOT EXISTS idx_tracks_project ON tracks(project_id);
CREATE INDEX IF NOT EXISTS idx_tracks_parent ON tracks(parent_track_id);
CREATE INDEX IF NOT EXISTS idx_tracks_created ON tracks(created_at);
CREATE INDEX IF NOT EXISTS idx_stems_track ON stems(track_id);
CREATE INDEX IF NOT EXISTS idx_studio_sessions_track ON studio_sessions(track_id);
CREATE INDEX IF NOT EXISTS idx_studio_layers_session ON studio_layers(session_id);
CREATE INDEX IF NOT EXISTS idx_studio_layers_sort ON studio_layers(session_id, sort_order);
CREATE INDEX IF NOT EXISTS idx_generation_jobs_status ON generation_jobs(status);
CREATE INDEX IF NOT EXISTS idx_reference_tracks_workspace ON reference_tracks(workspace_id);

-- Default workspace
INSERT OR IGNORE INTO workspaces (id, name, type)
VALUES ('default', 'My Music', 'General');
`;

// Columns added in later migrations — safe to run repeatedly
const columnMigrations: Array<{ table: string; column: string; definition: string }> = [
  { table: 'studio_layers', column: 'start_offset', definition: 'REAL DEFAULT 0' },
  { table: 'studio_layers', column: 'clip_start',   definition: 'REAL DEFAULT 0' },
  { table: 'studio_layers', column: 'clip_end',     definition: 'REAL' },
];

function migrate(): void {
  console.log('Running SQLite database migrations...');

  try {
    db.exec(migrations);
    console.log('Migrations completed successfully!');
  } catch (error) {
    const errorMsg = String(error);
    if (errorMsg.includes('already exists')) {
      console.log('Tables already exist, migrations completed!');
    } else {
      console.error('Migration failed:', error);
      throw error;
    }
  }

  // Add new columns to existing tables (idempotent — ignore "duplicate column" errors)
  for (const { table, column, definition } of columnMigrations) {
    try {
      db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
      console.log(`Added column ${table}.${column}`);
    } catch {
      // Column already exists — expected on subsequent runs
    }
  }
}

// Run migrations
migrate();
