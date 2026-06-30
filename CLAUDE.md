# ACE-Step-Up Studio — CLAUDE.md

This file is auto-loaded by Claude Code. Read it fully before touching any code.

---

## What This Project Is

A **local-first AI music creation studio** built on top of the ACE-Step 1.5 model.
It is NOT a SaaS platform. There is no auth, no cloud, no social features.

**The creative loop the user wants:**
1. Generate tracks (single or batch) → iterate on the prompt → find a good one
2. Edit the stems — add/remove/repaint layers to refine the song
3. Mix down all layers into a final version (ffmpeg) OR regenerate from all layers (ACE-Step)

**Dual control philosophy:**
- **Artistic control** — simple, understandable settings (style description, mood, key, BPM slider)
- **Technical control** — every ACE-Step model parameter exposed and accessible

---

## Architecture

```
Workspace → Project (Song) → Track → Stems
                               ↓
                         Studio Session → Layers (master, stem, upload, generated, repaint)
```

**Frontend:** React 18 + TypeScript + TailwindCSS + Vite (port 5173 in dev, 3000 in prod)  
**Backend:** Express.js + SQLite (better-sqlite3), port 3001  
**AI Engine:** ACE-Step 1.5 HTTP API at `ACESTEP_API_URL` (default `http://localhost:8001`)  
**Audio tools:** FFmpeg (mixdown), Demucs (stem splitting), AudioMass (waveform editor, iframe)

**Key files:**
- [`types.ts`](types.ts) — all shared types (Workspace, Project, Track, Stem, StudioSession, StudioLayer)
- [`services/api.ts`](services/api.ts) — frontend API client
- [`server/src/routes/`](server/src/routes/) — REST API routes
- [`server/src/services/acestep.ts`](server/src/services/acestep.ts) — ACE-Step API bridge
- [`server/src/db/migrate.ts`](server/src/db/migrate.ts) — DB schema
- [`components/Dashboard.tsx`](components/Dashboard.tsx) — main workspace/song/track view
- [`App.tsx`](App.tsx) — root, wraps WorkspaceProvider + StudioProvider

**Navigation:**
- Two tabs: **Generation** | **Training**
- Breadcrumb in Generation tab: root → workspace → song
- Studio is a fullscreen overlay (not a breadcrumb level), opened from track context menu

---

## ACE-Step API Capabilities

The ACE-Step server runs at `ACESTEP_API_URL`. All generation goes through `POST /release_task` then polls `POST /query_result`.

### Task types (`task_type` param)
| Type | Description |
|------|-------------|
| `text2music` | Generate from prompt + lyrics (default) |
| `cover` | Transform existing audio with new style |
| `repaint` | Regenerate a time region of existing audio (`repainting_start`/`repainting_end`) |
| `lego` | Combine audio segments |
| `extract` | Extract prompt/caption from audio |
| `complete` | Extend/complete audio |

### Key generation parameters
- `prompt` — music description/style
- `lyrics` — with `[Verse]`/`[Chorus]` tags
- `thinking` — `true` = LM generates audio codes (best quality, slower). Auto-skipped for cover/repaint/extract.
- `sample_query` / `description` — natural language input, LM generates everything
- `use_format` — LM enhances/formats provided caption+lyrics
- `bpm`, `key_scale`, `time_signature`, `audio_duration` — music attributes
- `batch_size` (max 4) — generate multiple variations in one call
- `seed` / `use_random_seed` — reproducibility
- `inference_steps` — quality vs speed (turbo: 1–20, default 8; base: 1–200, default 32–64)
- `guidance_scale` — prompt adherence (base model only)
- `model` — select DiT model (list via `GET /v1/models`)
- `src_audio_path` / `src_audio` file — source audio for repaint/cover
- `reference_audio_path` / `reference_audio` file — style reference
- `audio_cover_strength` (0–1) — cover/style transfer strength
- `infer_method` — `"ode"` (faster) or `"sde"` (stochastic)
- `shift` — timestep shift (base models only, 1.0–5.0)
- LM params: `lm_temperature`, `lm_cfg_scale`, `lm_top_p`, `lm_repetition_penalty`

### Other API endpoints
- `POST /format_input` — LM-enhance caption+lyrics before generation
- `POST /create_random_sample` — get a random example for form prefill
- `GET /v1/models` — list loaded DiT models
- `POST /v1/init` — load/switch models without restart
- `GET /v1/stats` — server queue stats
- `GET /v1/audio?path=...` — download generated audio
- `GET /health` — health check

File upload: use `multipart/form-data` with `src_audio` or `reference_audio` fields.

---

## Current State (as of June 2026)

### Working
- Full CRUD: workspaces, projects, tracks, stems via REST API
- Studio session/layer management (create, CRUD, revert)
- Track generation with polling (`/api/generate`)
- Dashboard (3 depth views), breadcrumb navigation, dark mode
- TopNav, TrackContextMenu, Player, SettingsModal
- No-op auth middleware (`req.user = { id: 'local-user' }`)

### Stubbed (returns 501 — next things to build)
| Feature | Backend endpoint | What's needed |
|---------|-----------------|---------------|
| **Mixdown** | `POST /api/studio/sessions/:id/mixdown` | ffmpeg `amix` — sum selected layers at correct timeline offsets |
| **Repaint region** | `POST /api/studio/layers/:id/repaint` | ACE-Step `task_type: 'repaint'` with `repainting_start`/`repainting_end` |
| **Generate on layer** | `POST /api/studio/layers/:id/generate` | ACE-Step text2music/cover → new `generated` layer |
| **Extract prompt** | `POST /api/tracks/:id/extract-prompt` | ACE-Step `task_type: 'extract'` |

### Working (previously thought to be stubs)
- **Stem splitting** — `POST /api/tracks/:id/split-stems` — fully working via Demucs; completes async, saves vocals/drums/bass/other wavs to DB and disk.

### Studio timeline
Currently a placeholder. Needs a multi-track waveform view for region selection.
Design: embed AudioMass as `<iframe src="/editor">` with `postMessage` bridge, or build a custom WaveSurfer-based multi-track renderer.

---

## How to Run

```bash
# First time only
cd server && npm run db:migrate

# Start everything (backend :3001 + Vite :5173)
npm run start
```

ACE-Step must be running separately at `ACESTEP_API_URL` (default `http://localhost:8001`):
```bash
# Windows portable
python_embeded\python -m acestep --port 8001 --enable-api --backend pt --server-name 127.0.0.1
```

---

## Working Rules

- **Local-first always.** No auth, no cloud, no social features. Never re-add them.
- **No-op auth is intentional.** `req.user = { id: 'local-user' }` stays. Don't add real auth.
- **DB schema changes require migration.** Never modify the live DB directly — update `migrate.ts` and re-run.
- **ACE-Step is HTTP, not Gradio.** The API is the `--enable-api` REST server on port 8001, NOT the Gradio UI. Use `POST /release_task` → poll `POST /query_result`.
- **Expose all ACE-Step params.** The user wants full technical control. Don't hide params — put them in an "Advanced" accordion if needed for cleanliness, but keep them accessible.
- **Artistic = simple labels, Technical = raw params.** A "Style" text field is artistic. `inference_steps`, `guidance_scale`, `shift`, `lm_temperature` are technical. Both should be available in the generation UI.
- **Non-destructive editing.** Original audio (master/stem layers) is never overwritten. Repaint/edit creates new layers. Revert restores original.
- **Layer types:** `master` | `stem` | `upload` | `generated` | `repaint` — don't invent new ones without updating the DB schema CHECK constraint.
- **File uploads to ACE-Step** use `multipart/form-data` with `src_audio` or `reference_audio` fields. Server-side paths can use `src_audio_path`.
- **Don't over-engineer.** This is a personal local tool. Simplicity beats abstraction.
