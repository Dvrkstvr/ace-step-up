# ACE-Step-Up Studio — Progress

## What Was Done

The app was refactored from a SaaS music platform into a local-first AI music creation studio.

### Backend
- **New DB schema** — dropped all SaaS tables (users, songs, playlists, etc.), created: `workspaces`, `projects`, `tracks`, `stems`, `studio_sessions`, `studio_layers`, `generation_jobs`, `reference_tracks`
- **Auth removed** — JWT stripped out, middleware replaced with a no-op passthrough (`req.user = { id: 'local-user' }`)
- **New REST API** — full CRUD routes for workspaces, projects, tracks, stems, and studio sessions/layers
- **Gradio bridge fixes** — `prepareAudioFile()` uses `handle_file()` directly, `sanitizeGradioPayload()` added, `ditModel`/`lmModel` passed through to Python fallback
- **Generate route** — auto-creates a `tracks` row on successful generation, accepts `workspace_id` / `project_id` / `parent_track_id`

### Frontend
- **New type system** — `Workspace`, `Project`, `Track`, `Stem`, `StudioSession`, `StudioLayer` replace old SaaS types
- **New API service layer** — `workspacesApi`, `projectsApi`, `tracksApi`, `stemsApi`, `studioApi`
- **WorkspaceContext** — manages workspace list, breadcrumb navigation, active workspace/project
- **StudioContext** — manages studio session, layers, selected region, open/close state
- **TopNav** — two-tab layout (Generation / Training), clickable breadcrumb, dark mode toggle
- **Dashboard** — three views: workspace grid → track+song list → song detail (iterations)
- **TrackContextMenu** — right-click or `⋯` on any track: play, open in studio, promote to song, create variation, rename, delete
- **Studio overlay** — fullscreen DAW-like interface with layer panel, timeline placeholder, tools panel, action bar
- **NewTrackModal** — generation form with task type selector, advanced params, polling progress
- **ContextSidebar** — track info tab + quick-gen tab
- **Player** — social features removed, updated to `Track` type
- **SettingsModal** — profile/video sections removed
- **22 legacy files deleted** — all SaaS components, routes, and services

---

## What's Next

### Studio integrations (all currently return 501)

| Feature | Endpoint | What's needed |
|---------|----------|---------------|
| **Mixdown** | `POST /api/studio/sessions/:id/mixdown` | ffmpeg `amix` — sum selected layers at correct timeline offsets |
| **Stem splitting** | `POST /api/tracks/:id/split-stems` | Demucs — separate audio into instrument stems, save to `stems` table |
| **Repaint region** | `POST /api/studio/layers/:id/repaint` | ACE-Step repaint task — regenerate a time region, create new `repaint` layer |
| **Generate on layer** | `POST /api/studio/layers/:id/generate` | ACE-Step text2music/a2a — add generated audio as a new layer |
| **Extract prompt** | `POST /api/tracks/:id/extract-prompt` | Gradio audio analysis endpoint |

### Studio timeline
The timeline area is currently a placeholder. A proper multi-track waveform view (or AudioMass iframe bridge) needs to be wired up for region selection to work visually.

### Polish
- Drag-to-reorder layers in the Studio layer panel
- Stem dropdown display under tracks in the workspace view
- Library browser panel in the Studio ("Add Layer → From Library")
