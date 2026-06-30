# ACE-Step-Up Studio — Scope & Status

> Living reference document. Update "Status" column as work lands.  
> Last audited: June 2026 (full codebase read).

---

## Vision

A local-first AI music creation studio with one creative loop:

```
Generate → Iterate → Refine (stems/layers/repaint) → Finish (mixdown / regenerate)
```

**Dual control throughout:**
- **Artistic** — style description, mood, key, BPM (human labels)
- **Technical** — every ACE-Step model parameter exposed and accessible

---

## What Is In Scope

- Full ACE-Step generation (all task types, all model params)
- Workspace → Project (Song) → Track organization
- Studio: multi-layer non-destructive editing, region repaint, stem splitting, mixdown
- LoRA / LoKr fine-tuning (Training tab)

## What Is Out of Scope (Never Build)

- Auth / user accounts / cloud sync
- Social features (likes, follows, comments, playlists)
- Video generator / Pexels integration
- AudioMass integration (WaveSurfer is already the audio UI — AudioMass is only a static route, not wired in)

---

## Feature Status

### Generation

| Feature | Status | Notes |
|---------|--------|-------|
| text2music | ✅ Working | |
| cover / audio2audio | ✅ Working | Source audio upload wired |
| repaint (task type) | ✅ Working | Backend calls ACE-Step correctly |
| batch_size | ✅ Working | 1–4 in UI; API supports up to 8 |
| Thinking mode | ✅ Working | `thinking` flag wired |
| inference_steps, guidance_scale, shift | ✅ Working | In Advanced toggle |
| infer_method (ode/sde) | ✅ Working | |
| DiT model selection | ✅ Working | `/v1/init` switching wired |
| LM format enhancement (use_format) | ✅ Working | `enhance` flag → `/format_input` |
| Random description (sample_query) | ✅ Working | `create_random_sample` wired |
| LoRA load/unload/toggle | ✅ Working | Load/unload/scale implemented |
| Bulk generation queue | ✅ Working | Sequential local queue |
| Title auto-generation | ✅ Working | LLM-generated on track creation |
| **LM params in UI** | ❌ Missing | `lm_temperature`, `lm_cfg_scale`, `lm_top_k`, `lm_top_p`, `lm_repetition_penalty`, `lm_negative_prompt` — all supported by the API but NOT exposed in the generation form |
| **sample_query ("describe it") mode** | ❌ Missing | API supports full NL→music via `sample_query`; no dedicated UI path |
| **use_adg, cfg_interval_start/end** | ❌ Missing | API supports; UI doesn't expose |
| **custom_timesteps** | ❌ Missing | API supports; UI doesn't expose |
| Extract prompt from audio | ❌ Missing | ACE-Step `extract` task; no backend or UI |
| Complete / Extend audio | ❌ Missing | ACE-Step `complete` task; no UI |
| Lego mode | ❌ Missing | ACE-Step `lego` task; no UI |

### Organization

| Feature | Status | Notes |
|---------|--------|-------|
| Workspace CRUD | ✅ Working | |
| Project (Song) CRUD | ✅ Working | |
| Track CRUD | ✅ Working | |
| Promote track → Song | ✅ Working | |
| Create variation (child track) | ✅ Working | `parent_track_id` set |
| Breadcrumb navigation | ✅ Working | root → workspace → song |
| Track context menu | ✅ Working | Play, studio, promote, iterate, rename, delete |
| Stems display under tracks | ⚠️ Verify | Stems exist in DB; dropdown display needs browser test |

### Studio

| Feature | Status | Notes |
|---------|--------|-------|
| Studio session (open/close/persist) | ✅ Working | Auto-creates, survives refresh |
| Layer panel (mute/solo/volume/lock) | ✅ Working | |
| WaveSurfer multi-track playback | ✅ Working | Web Audio API, GainNode per layer |
| Region selection (RegionsPlugin) | ✅ Working | WaveSurfer RegionsPlugin integrated |
| Drag-to-reorder layers | ⚠️ Verify | UI supports drag; DB sync needs verification |
| **Repaint end-to-end** | ❌ 501 stub | Route returns 501; comment describes what to build (ACE-Step repaint + new layer) |
| **Mixdown (ffmpeg amix)** | ❌ 501 stub | Route returns 501; needs ffmpeg amix integration |
| Add uploaded layer | ⚠️ Verify | Modal exists; wiring needs browser confirmation |
| **Generate on layer** (add AI layer from Studio) | ❌ 501 stub | Route `/studio/layers/:id/generate` returns 501 |
| Regenerate from all layers (lego/cover) | ❌ Missing | Mix layers → use as ACE-Step source |
| Library browser (add from workspace) | ❌ Missing | Design spec exists; no implementation |
| Freeze region (non-destructive silence) | ❌ Missing | Design spec exists; no implementation |

### Stems

| Feature | Status | Notes |
|---------|--------|-------|
| Stem splitting (Demucs) | ✅ Working | Async via `/api/tracks/:id/split-stems` |
| Stems saved to DB | ✅ Working | `stems` table |
| Stems loaded into Studio as layers | ✅ Working | Auto-added on Studio open |
| Stem analysis / confidence modal | ❌ Missing | Design spec exists (select which stems); no implementation |

### Training

| Feature | Status | Notes |
|---------|--------|-------|
| Training tab UI | ⚠️ Verify | Component exists; completeness unknown |
| LoRA training (routes) | ⚠️ Partial | Routes exist; Gradio bridge; untested depth |
| Audio dataset upload | ✅ Working | Reference track upload endpoint |
| Dataset preprocessing | ⚠️ Partial | Routes present |
| Training progress polling | ⚠️ Partial | Exists; needs browser verification |
| LoKr training | ❌ Missing | API supports it; no UI |

---

## Priority Plan

### P0 — Verify the core loop end-to-end (no new code until this is confirmed)
1. Generate a track → appears in workspace
2. Open track in Studio → master layer visible with waveform
3. Split to stems → stems appear as layers
4. Select region → Repaint → new repaint layer created
5. Mixdown → new track saved with audio

### P1 — Close the "technical control" gap in the UI
- Expose LM params in generation form (temperature, CFG scale, top-k/p, repetition penalty, negative prompt)
- Expose use_adg, cfg_interval_start/end, custom_timesteps in Advanced section
- Add sample_query ("describe it naturally") as a generation mode option

### P2 — Complete Studio tools
- Generate on layer: from within Studio, add a new text2music/cover layer
- Extract prompt: ACE-Step `extract` on any track → populate generation form
- Regenerate from all layers: mix → use as ACE-Step source for cover/repaint
- Library browser: add a layer from existing workspace tracks

### P3 — New ACE-Step task types
- Complete / Extend audio (task_type: 'complete')
- Lego mode (task_type: 'lego')

### P4 — Training tab
- Verify TrainingPanel is usable end-to-end
- LoKr training UI
- Stem analysis modal (show confidence, let user select which stems)

---

## Technical Notes

- **ACE-Step connection:** Gradio-first (calls `/generation_wrapper` with 51 positional args via `@gradio/client`), falls back to REST API `/v1/chat/completions`, then Python spawn. NOT using `/release_task` → `/query_result` queue directly.
- **Job queue:** Local in-memory sequential queue (`processQueue()` awaits each job). One GPU job at a time by design.
- **Studio audio engine:** `useStudioAudio` hook — Web Audio API, GainNode per layer, supports `clip_start`/`clip_end`/`start_offset` for timeline positioning.
- **AudioMass:** Served statically at `/editor` but NOT wired into the React app. WaveSurfer (with RegionsPlugin) is the actual audio UI.
- **LM params gap:** The backend `GenerationBody` type has 163 fields including all LM params. `InlineNewTrack.tsx` exposes most generation params but skips all LM params. They need to be added to the Advanced accordion.
