import { Router, Request, Response } from 'express';
import { existsSync } from 'fs';
import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';
import { pool } from '../db/pool.js';
import { generateMusicViaAPI, type GenerationParams } from '../services/acestep.js';
import { generateUUID } from '../db/sqlite.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const AUDIO_DIR = path.resolve(__dirname, '../../public/audio');

const router = Router();

// Helper: parse generation_params JSON field on a layer row
function parseLayer(layer: any): any {
  if (!layer) return layer;
  return {
    ...layer,
    generation_params: layer.generation_params
      ? (() => { try { return JSON.parse(layer.generation_params); } catch { return layer.generation_params; } })()
      : null,
  };
}

// ─── Session Management ────────────────────────────────────────────────────────

/**
 * GET /api/studio/sessions/:trackId
 * Get or create an active session for a track.
 * If no active session exists, one is created automatically.
 * If the track has an audio_url, a locked 'master' layer is added to the new session.
 * Returns the session object with a `layers` array.
 */
router.get('/sessions/:trackId', async (req: Request, res: Response) => {
  try {
    const { trackId } = req.params;

    // Verify track exists
    const trackResult = await pool.query(
      `SELECT id, audio_url FROM tracks WHERE id = ?`,
      [trackId]
    );
    if (trackResult.rows.length === 0) {
      res.status(404).json({ error: 'Track not found' });
      return;
    }
    const track = trackResult.rows[0];

    // Look for an existing active session
    let sessionResult = await pool.query(
      `SELECT * FROM studio_sessions WHERE track_id = ? AND is_active = 1 ORDER BY created_at DESC LIMIT 1`,
      [trackId]
    );

    if (sessionResult.rows.length === 0) {
      // Create a new session
      sessionResult = await pool.query(
        `INSERT INTO studio_sessions (track_id, name, is_active) VALUES (?, NULL, 1) RETURNING *`,
        [trackId]
      );

      const newSession = sessionResult.rows[0];

      // Add a master layer if the track has audio
      if (track.audio_url) {
        await pool.query(
          `INSERT INTO studio_layers
             (session_id, source_type, name, audio_url, original_audio_url,
              volume, is_muted, is_solo, is_locked, sort_order)
           VALUES (?, 'master', 'Master', ?, ?, 1.0, 0, 0, 0, 0)`,
          [newSession.id, track.audio_url, track.audio_url]
        );
      }
    }

    const session = sessionResult.rows[0];

    // Fetch all layers for the session ordered by sort_order
    const layersResult = await pool.query(
      `SELECT * FROM studio_layers WHERE session_id = ? ORDER BY sort_order ASC`,
      [session.id]
    );

    res.json({ ...session, layers: layersResult.rows.map(parseLayer) });
  } catch (error) {
    console.error('Get/create studio session error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /api/studio/sessions
 * Explicitly create a new session.
 * Body: { track_id, name? }
 */
router.post('/sessions', async (req: Request, res: Response) => {
  try {
    const { track_id, name } = req.body;

    if (!track_id) {
      res.status(400).json({ error: 'track_id is required' });
      return;
    }

    // Verify track exists
    const trackCheck = await pool.query(`SELECT id FROM tracks WHERE id = ?`, [track_id]);
    if (trackCheck.rows.length === 0) {
      res.status(404).json({ error: 'Track not found' });
      return;
    }

    const result = await pool.query(
      `INSERT INTO studio_sessions (track_id, name, is_active) VALUES (?, ?, 1) RETURNING *`,
      [track_id, name ?? null]
    );

    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Create studio session error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * DELETE /api/studio/sessions/:id
 * Delete a session (cascades to layers via FK). Returns 204.
 */
router.delete('/sessions/:id', async (req: Request, res: Response) => {
  try {
    const result = await pool.query(
      `DELETE FROM studio_sessions WHERE id = ?`,
      [req.params.id]
    );

    if (result.rowCount === 0) {
      res.status(404).json({ error: 'Session not found' });
      return;
    }

    res.status(204).send();
  } catch (error) {
    console.error('Delete studio session error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── Layer Management ─────────────────────────────────────────────────────────

/**
 * GET /api/studio/sessions/:sid/layers
 * Return all layers for a session ordered by sort_order. Parses generation_params from JSON.
 */
router.get('/sessions/:sid/layers', async (req: Request, res: Response) => {
  try {
    const { sid } = req.params;

    // Verify session exists
    const sessionCheck = await pool.query(`SELECT id FROM studio_sessions WHERE id = ?`, [sid]);
    if (sessionCheck.rows.length === 0) {
      res.status(404).json({ error: 'Session not found' });
      return;
    }

    const result = await pool.query(
      `SELECT * FROM studio_layers WHERE session_id = ? ORDER BY sort_order ASC`,
      [sid]
    );

    res.json({ layers: result.rows.map(parseLayer) });
  } catch (error) {
    console.error('List layers error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /api/studio/sessions/:sid/layers
 * Add a layer to a session.
 * sort_order is set to max(sort_order) + 1 for the session.
 * Body: { source_type, name, audio_url, stem_id?, parent_layer_id?,
 *         region_start?, region_end?, volume?, is_muted?, is_solo?,
 *         is_locked?, generation_params? }
 */
router.post('/sessions/:sid/layers', async (req: Request, res: Response) => {
  try {
    const { sid } = req.params;
    const {
      source_type,
      name,
      audio_url,
      stem_id,
      parent_layer_id,
      row_id,
      start_offset,
      clip_start,
      clip_end,
      region_start,
      region_end,
      volume,
      is_muted,
      is_solo,
      is_locked,
      generation_params,
    } = req.body;

    if (!source_type || !name || audio_url == null) {
      res.status(400).json({ error: 'source_type, name, and audio_url are required' });
      return;
    }

    const validSourceTypes = ['master', 'stem', 'upload', 'generated', 'repaint'];
    if (!validSourceTypes.includes(source_type)) {
      res.status(400).json({ error: `source_type must be one of: ${validSourceTypes.join(', ')}` });
      return;
    }

    // Verify session exists
    const sessionCheck = await pool.query(`SELECT id FROM studio_sessions WHERE id = ?`, [sid]);
    if (sessionCheck.rows.length === 0) {
      res.status(404).json({ error: 'Session not found' });
      return;
    }

    // Determine next sort_order
    const maxOrderResult = await pool.query(
      `SELECT COALESCE(MAX(sort_order), -1) AS max_order FROM studio_layers WHERE session_id = ?`,
      [sid]
    );
    const nextOrder = (maxOrderResult.rows[0]?.max_order ?? -1) + 1;

    const result = await pool.query(
      `INSERT INTO studio_layers
         (session_id, stem_id, parent_layer_id, row_id, source_type, name, audio_url, original_audio_url,
          volume, is_muted, is_solo, is_locked, sort_order,
          start_offset, clip_start, clip_end,
          region_start, region_end, generation_params)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       RETURNING *`,
      [
        sid,
        stem_id ?? null,
        parent_layer_id ?? null,
        row_id ?? null,
        source_type,
        name,
        audio_url,
        audio_url,
        volume !== undefined ? volume : 1.0,
        is_muted ? 1 : 0,
        is_solo ? 1 : 0,
        is_locked ? 1 : 0,
        nextOrder,
        start_offset ?? 0,
        clip_start ?? 0,
        clip_end ?? null,
        region_start ?? null,
        region_end ?? null,
        generation_params != null ? JSON.stringify(generation_params) : null,
      ]
    );

    res.status(201).json(parseLayer(result.rows[0]));
  } catch (error) {
    console.error('Add layer error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * PATCH /api/studio/layers/:id
 * Update mutable layer fields: volume, is_muted, is_solo, sort_order, name.
 * Returns the updated layer.
 */
router.patch('/layers/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { volume, is_muted, is_solo, sort_order, name, start_offset, clip_start, clip_end, row_id } = req.body;

    const updates: string[] = [];
    const values: unknown[] = [];

    if (name !== undefined)         { updates.push('name = ?');         values.push(name); }
    if (volume !== undefined)       { updates.push('volume = ?');       values.push(volume); }
    if (is_muted !== undefined)     { updates.push('is_muted = ?');     values.push(is_muted ? 1 : 0); }
    if (is_solo !== undefined)      { updates.push('is_solo = ?');      values.push(is_solo ? 1 : 0); }
    if (sort_order !== undefined)   { updates.push('sort_order = ?');   values.push(sort_order); }
    if (start_offset !== undefined) { updates.push('start_offset = ?'); values.push(start_offset); }
    if (clip_start !== undefined)   { updates.push('clip_start = ?');   values.push(clip_start); }
    if (clip_end !== undefined)     { updates.push('clip_end = ?');     values.push(clip_end); }
    if (row_id !== undefined)       { updates.push('row_id = ?');       values.push(row_id); }

    if (updates.length === 0) {
      res.status(400).json({ error: 'No updatable fields provided' });
      return;
    }

    values.push(id);

    const result = await pool.query(
      `UPDATE studio_layers SET ${updates.join(', ')} WHERE id = ? RETURNING *`,
      values
    );

    if (result.rows.length === 0) {
      res.status(404).json({ error: 'Layer not found' });
      return;
    }

    res.json(parseLayer(result.rows[0]));
  } catch (error) {
    console.error('Update layer error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * DELETE /api/studio/layers/:id
 * Delete a layer. Returns 400 if the layer is locked, 204 on success.
 */
router.delete('/layers/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const layerResult = await pool.query(
      `SELECT id, is_locked FROM studio_layers WHERE id = ?`,
      [id]
    );

    if (layerResult.rows.length === 0) {
      res.status(404).json({ error: 'Layer not found' });
      return;
    }

    if (layerResult.rows[0].is_locked) {
      res.status(400).json({ error: 'Cannot delete a locked layer' });
      return;
    }

    // Also delete any child clips on this row (row_id = anchor id)
    await pool.query(`DELETE FROM studio_layers WHERE row_id = ?`, [id]);
    await pool.query(`DELETE FROM studio_layers WHERE id = ?`, [id]);

    res.status(204).send();
  } catch (error) {
    console.error('Delete layer error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── Layer Actions ─────────────────────────────────────────────────────────────

/**
 * POST /api/studio/layers/:id/repaint
 * Queue an ACE-Step repaint job over the layer's audio.
 * Body: { region_start, region_end, prompt?, style?, lyrics?, inference_steps?,
 *         guidance_scale?, shift?, seed?, use_random_seed?, audio_cover_strength?,
 *         thinking?, audio_format?, infer_method?,
 *         lm_temperature?, lm_cfg_scale?, lm_top_p?, lm_top_k?, lm_negative_prompt? }
 * Returns: { jobId, sessionId, parentLayerId }
 * Caller polls /api/generate/status/:jobId; on success, POSTs a new 'repaint'
 * layer to /api/studio/sessions/:sessionId/layers with parent_layer_id = parentLayerId.
 */
router.post('/layers/:id/repaint', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const {
      prompt, style, lyrics,
      region_start, region_end,
      duration, bpm, key_scale, time_signature,
      inference_steps, guidance_scale, shift, seed, use_random_seed,
      audio_cover_strength, thinking, audio_format, infer_method,
      lm_temperature, lm_cfg_scale, lm_top_p, lm_top_k, lm_negative_prompt,
    } = req.body;

    if (region_start === undefined || region_end === undefined) {
      res.status(400).json({ error: 'region_start and region_end are required' });
      return;
    }

    const layerResult = await pool.query(
      'SELECT id, session_id, name, audio_url, start_offset, clip_start, clip_end FROM studio_layers WHERE id = ?',
      [id]
    );
    if (layerResult.rows.length === 0) {
      res.status(404).json({ error: 'Layer not found' });
      return;
    }
    const layer = layerResult.rows[0];
    if (!layer.audio_url) {
      res.status(400).json({ error: 'Layer has no audio to repaint' });
      return;
    }

    // region_start/end are timeline positions; convert to audio-local positions
    // (the ACE-Step repaint API expects offsets within the source audio file)
    const startOffset = Number(layer.start_offset ?? 0);
    const clipStart   = Number(layer.clip_start ?? 0);
    const audioLocalStart = Math.max(0, Number(region_start) - startOffset + clipStart);
    const audioLocalEnd   = Math.max(0, Number(region_end)   - startOffset + clipStart);

    const params: GenerationParams = {
      customMode: true,
      style: prompt || style || '',
      lyrics: lyrics || '',
      title: 'Repaint',
      instrumental: !(lyrics && String(lyrics).trim()),
      taskType: 'repaint',
      sourceAudioUrl: layer.audio_url,
      repaintingStart: audioLocalStart,
      repaintingEnd: audioLocalEnd,
      audioCoverStrength: audio_cover_strength !== undefined ? Number(audio_cover_strength) : 1.0,
      duration: duration !== undefined ? Number(duration) : undefined,
      bpm: bpm !== undefined ? Number(bpm) : undefined,
      keyScale: key_scale || undefined,
      timeSignature: time_signature || undefined,
      inferenceSteps: inference_steps !== undefined ? Number(inference_steps) : undefined,
      guidanceScale: guidance_scale !== undefined ? Number(guidance_scale) : undefined,
      shift: shift !== undefined ? Number(shift) : undefined,
      seed: seed !== undefined ? Number(seed) : undefined,
      randomSeed: use_random_seed !== false,
      thinking: thinking ?? false,
      audioFormat: audio_format || 'mp3',
      inferMethod: infer_method || 'ode',
      lmTemperature: lm_temperature !== undefined ? Number(lm_temperature) : undefined,
      lmCfgScale: lm_cfg_scale !== undefined ? Number(lm_cfg_scale) : undefined,
      lmTopP: lm_top_p !== undefined ? Number(lm_top_p) : undefined,
      lmTopK: lm_top_k !== undefined ? Number(lm_top_k) : undefined,
      lmNegativePrompt: lm_negative_prompt || undefined,
    };

    // Create a DB job record so /api/generate/status/:jobId polling works
    const localJobId = generateUUID();
    await pool.query(
      `INSERT INTO generation_jobs (id, user_id, status, params, created_at, updated_at)
       VALUES (?, ?, 'queued', ?, datetime('now'), datetime('now'))`,
      [localJobId, 'local-user', JSON.stringify(params)]
    );

    const { jobId: aceJobId } = await generateMusicViaAPI(params);

    await pool.query(
      `UPDATE generation_jobs SET acestep_task_id = ?, status = 'running', updated_at = datetime('now') WHERE id = ?`,
      [aceJobId, localJobId]
    );

    res.json({ jobId: localJobId, sessionId: layer.session_id, parentLayerId: id });
  } catch (error) {
    console.error('Repaint error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /api/studio/layers/:id/generate
 * Stub — not yet implemented.
 * When implemented: run ACE-Step generation using the layer's generation_params,
 * then create or update a 'generated' child layer with the resulting audio URL.
 */
router.post('/layers/:id/generate', async (_req: Request, res: Response) => {
  res.status(501).json({ error: 'Layer generation not yet implemented' });
});

/**
 * POST /api/studio/layers/:id/revert
 * Delete all 'repaint' child layers (where parent_layer_id = this id)
 * and restore audio_url from original_audio_url. Pure DB operation.
 */
router.post('/layers/:id/revert', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const layerResult = await pool.query(
      `SELECT id, original_audio_url FROM studio_layers WHERE id = ?`,
      [id]
    );

    if (layerResult.rows.length === 0) {
      res.status(404).json({ error: 'Layer not found' });
      return;
    }

    const layer = layerResult.rows[0];

    // Remove all repaint children
    await pool.query(
      `DELETE FROM studio_layers WHERE parent_layer_id = ? AND source_type = 'repaint'`,
      [id]
    );

    // Restore original audio if available
    if (layer.original_audio_url) {
      await pool.query(
        `UPDATE studio_layers SET audio_url = original_audio_url WHERE id = ?`,
        [id]
      );
    }

    const updatedResult = await pool.query(
      `SELECT * FROM studio_layers WHERE id = ?`,
      [id]
    );

    res.json(parseLayer(updatedResult.rows[0]));
  } catch (error) {
    console.error('Revert layer error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /api/studio/sessions/:sid/generate-clip
 * Generate a new audio clip (text2music) and place it on a specific row at a specific region.
 * Body: { row_id, region_start, region_end, audio_duration, prompt?, style?, lyrics?,
 *         inference_steps?, guidance_scale?, seed?, use_random_seed?, infer_method?,
 *         reference_audio_url? }
 * Returns: { jobId, sessionId, rowId }
 */
router.post('/sessions/:sid/generate-clip', async (req: Request, res: Response) => {
  try {
    const { sid } = req.params;
    const {
      row_id,
      region_start,
      region_end,
      audio_duration,
      prompt,
      style,
      lyrics,
      inference_steps,
      guidance_scale,
      seed,
      use_random_seed,
      infer_method,
      reference_audio_url,
    } = req.body;

    if (!row_id || region_start === undefined || region_end === undefined) {
      res.status(400).json({ error: 'row_id, region_start, and region_end are required' });
      return;
    }

    const sessionCheck = await pool.query('SELECT id FROM studio_sessions WHERE id = ?', [sid]);
    if (sessionCheck.rows.length === 0) {
      res.status(404).json({ error: 'Session not found' });
      return;
    }

    const params: GenerationParams = {
      customMode: true,
      style: prompt || style || '',
      lyrics: lyrics || '',
      title: 'Generated Clip',
      instrumental: !(lyrics && String(lyrics).trim()),
      taskType: 'text2music',
      duration: audio_duration !== undefined ? Number(audio_duration) : Number(region_end) - Number(region_start),
      inferenceSteps: inference_steps !== undefined ? Number(inference_steps) : 8,
      guidanceScale: guidance_scale !== undefined ? Number(guidance_scale) : 7,
      seed: seed !== undefined ? Number(seed) : undefined,
      randomSeed: use_random_seed !== false,
      inferMethod: infer_method || 'ode',
      audioFormat: 'mp3',
      referenceAudioUrl: reference_audio_url || undefined,
    };

    const localJobId = generateUUID();
    await pool.query(
      `INSERT INTO generation_jobs (id, user_id, status, params, created_at, updated_at)
       VALUES (?, ?, 'queued', ?, datetime('now'), datetime('now'))`,
      [localJobId, 'local-user', JSON.stringify(params)]
    );

    const { jobId: aceJobId } = await generateMusicViaAPI(params);

    await pool.query(
      `UPDATE generation_jobs SET acestep_task_id = ?, status = 'running', updated_at = datetime('now') WHERE id = ?`,
      [aceJobId, localJobId]
    );

    res.json({ jobId: localJobId, sessionId: sid, rowId: row_id });
  } catch (error) {
    console.error('Generate clip error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /api/studio/sessions/:sid/compose
 * Generate a new audio layer using existing clips as harmonic/stylistic context
 * (reference_audio for text2music). Multiple clips are mixed down via ffmpeg first.
 * Creates a NEW top-level layer (no row_id) — i.e. an entirely new track row.
 * Body: { context_clip_ids[], region_start, region_end, style?, lyrics?,
 *         inference_steps?, guidance_scale?, seed?, use_random_seed?, infer_method? }
 * Returns: { jobId, sessionId }
 */
router.post('/sessions/:sid/compose', async (req: Request, res: Response) => {
  try {
    const { sid } = req.params;
    const {
      context_clip_ids = [],
      region_start,
      region_end,
      style,
      lyrics,
      inference_steps,
      guidance_scale,
      seed,
      use_random_seed,
      infer_method,
    } = req.body;

    if (region_start === undefined || region_end === undefined) {
      res.status(400).json({ error: 'region_start and region_end are required' });
      return;
    }

    // Resolve reference audio: mix context clips or use single clip directly
    let referenceAudioUrl: string | undefined;

    if (Array.isArray(context_clip_ids) && context_clip_ids.length > 0) {
      const placeholders = context_clip_ids.map(() => '?').join(', ');
      const clipRows = await pool.query(
        `SELECT audio_url FROM studio_layers WHERE id IN (${placeholders}) AND audio_url != '' AND audio_url != 'pending'`,
        context_clip_ids
      );
      const audioUrls: string[] = clipRows.rows.map((r: any) => r.audio_url).filter(Boolean);

      if (audioUrls.length === 1) {
        referenceAudioUrl = audioUrls[0];
      } else if (audioUrls.length > 1) {
        // Mix clips together so ACE-Step gets the combined harmonic context
        const inputs = audioUrls.map(u =>
          u.startsWith('/audio/') ? path.join(AUDIO_DIR, u.replace('/audio/', '')) : u
        ).filter(p => existsSync(p));

        if (inputs.length === 1) {
          referenceAudioUrl = audioUrls[0];
        } else if (inputs.length > 1) {
          const { mkdtemp, writeFile: _wf } = await import('fs/promises');
          const { tmpdir } = await import('os');
          const tmpDir = await mkdtemp(path.join(tmpdir(), 'compose-'));
          const mixedPath = path.join(tmpDir, 'context_mix.mp3');

          await new Promise<void>((resolve, reject) => {
            const ffmpegArgs = [
              ...inputs.flatMap(f => ['-i', f]),
              '-filter_complex', `amix=inputs=${inputs.length}:duration=shortest:normalize=0`,
              '-y', mixedPath,
            ];
            const proc = spawn('ffmpeg', ffmpegArgs, { stdio: 'pipe' });
            proc.on('close', code => code === 0 ? resolve() : reject(new Error(`ffmpeg exited ${code}`)));
            proc.on('error', err => reject(new Error(`ffmpeg not found: ${err.message}`)));
          });

          // Copy to AUDIO_DIR so acestep.ts can resolve it
          const { copyFile, rm } = await import('fs/promises');
          const destName = `compose_ref_${Date.now()}.mp3`;
          const destPath = path.join(AUDIO_DIR, destName);
          await copyFile(mixedPath, destPath);
          await rm(tmpDir, { recursive: true, force: true }).catch(() => {});
          referenceAudioUrl = `/audio/${destName}`;
        }
      }
    }

    const duration = Number(region_end) - Number(region_start);

    const params: GenerationParams = {
      customMode: true,
      style: style || '',
      lyrics: lyrics || '',
      title: 'Composed Layer',
      instrumental: !(lyrics && String(lyrics).trim()),
      taskType: 'text2music',
      duration: Math.max(1, Math.round(duration)),
      inferenceSteps: inference_steps !== undefined ? Number(inference_steps) : 8,
      guidanceScale: guidance_scale !== undefined ? Number(guidance_scale) : 7,
      seed: seed !== undefined ? Number(seed) : undefined,
      randomSeed: use_random_seed !== false,
      inferMethod: infer_method || 'ode',
      audioFormat: 'mp3',
      referenceAudioUrl,
    };

    const localJobId = generateUUID();
    await pool.query(
      `INSERT INTO generation_jobs (id, user_id, status, params, created_at, updated_at)
       VALUES (?, ?, 'queued', ?, datetime('now'), datetime('now'))`,
      [localJobId, 'local-user', JSON.stringify(params)]
    );

    const { jobId: aceJobId } = await generateMusicViaAPI(params);

    await pool.query(
      `UPDATE generation_jobs SET acestep_task_id = ?, status = 'running', updated_at = datetime('now') WHERE id = ?`,
      [aceJobId, localJobId]
    );

    res.json({ jobId: localJobId, sessionId: sid });
  } catch (error) {
    console.error('Compose error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── Mixdown and Preview ──────────────────────────────────────────────────────

/**
 * POST /api/studio/sessions/:sid/mixdown
 * Mix all non-muted layers using ffmpeg amix, applying per-layer volume and
 * start_offset/clip_start/clip_end.
 * Body: { audio_format?: 'mp3' | 'flac' }
 * Returns: { audioUrl }
 */
router.post('/sessions/:sid/mixdown', async (req: Request, res: Response) => {
  try {
    const { sid } = req.params;
    const { audio_format = 'mp3' } = req.body;

    const sessionCheck = await pool.query('SELECT id FROM studio_sessions WHERE id = ?', [sid]);
    if (sessionCheck.rows.length === 0) {
      res.status(404).json({ error: 'Session not found' });
      return;
    }

    const layersResult = await pool.query(
      'SELECT * FROM studio_layers WHERE session_id = ? AND is_muted = 0 ORDER BY sort_order ASC',
      [sid]
    );

    // Resolve each layer to an absolute path, skipping missing files
    function resolveAudio(audioUrl: string): string {
      if (audioUrl.startsWith('/audio/')) return path.join(AUDIO_DIR, audioUrl.slice(7));
      return audioUrl;
    }

    const validLayers = layersResult.rows.filter(l => {
      if (!l.audio_url) return false;
      return existsSync(resolveAudio(l.audio_url));
    });

    if (validLayers.length === 0) {
      res.status(400).json({ error: 'No audible layers with audio files found' });
      return;
    }

    // Build ffmpeg -i args and filter_complex
    const inputArgs: string[] = [];
    const filterParts: string[] = [];
    const mixLabels: string[] = [];

    validLayers.forEach((layer, i) => {
      inputArgs.push('-i', resolveAudio(layer.audio_url));

      const vol = Number(layer.volume ?? 1.0);
      const offsetMs = Math.round(Number(layer.start_offset ?? 0) * 1000);
      const clipStart = layer.clip_start ? Number(layer.clip_start) : null;
      const clipEnd = layer.clip_end ? Number(layer.clip_end) : null;

      let chain = `[${i}:a]`;
      if (clipStart !== null || clipEnd !== null) {
        const trimStart = clipStart ?? 0;
        chain += clipEnd !== null
          ? `atrim=start=${trimStart}:end=${clipEnd},asetpts=PTS-STARTPTS,`
          : `atrim=start=${trimStart},asetpts=PTS-STARTPTS,`;
      }
      chain += `volume=${vol}`;
      if (offsetMs > 0) chain += `,adelay=${offsetMs}|${offsetMs}`;
      chain += `[a${i}]`;

      filterParts.push(chain);
      mixLabels.push(`[a${i}]`);
    });

    const n = validLayers.length;
    if (n === 1) {
      filterParts.push(`[a0]anull[out]`);
    } else {
      filterParts.push(`${mixLabels.join('')}amix=inputs=${n}:duration=longest:normalize=0[out]`);
    }

    const outputFilename = `mixdown_${sid}_${Date.now()}.${audio_format}`;
    const outputPath = path.join(AUDIO_DIR, outputFilename);
    const codecArgs = audio_format === 'flac'
      ? ['-c:a', 'flac']
      : ['-c:a', 'libmp3lame', '-q:a', '2'];

    await new Promise<void>((resolve, reject) => {
      const args = [
        ...inputArgs,
        '-filter_complex', filterParts.join(';'),
        '-map', '[out]',
        ...codecArgs,
        '-y', outputPath,
      ];
      const proc = spawn('ffmpeg', args);
      let stderr = '';
      proc.stderr.on('data', (d: Buffer) => { stderr += d.toString(); });
      proc.on('close', (code: number | null) => {
        if (code === 0) resolve();
        else reject(new Error(`ffmpeg exited ${code}: ${stderr.slice(-500)}`));
      });
      proc.on('error', (err: Error) => reject(new Error(`ffmpeg not found: ${err.message}`)));
    });

    res.json({ audioUrl: `/audio/${outputFilename}` });
  } catch (error) {
    console.error('Mixdown error:', error);
    res.status(500).json({ error: error instanceof Error ? error.message : 'Mixdown failed' });
  }
});

/**
 * GET /api/studio/sessions/:sid/preview
 * Stub — not yet implemented.
 */
router.get('/sessions/:sid/preview', async (_req: Request, res: Response) => {
  res.status(501).json({ error: 'Preview not yet implemented' });
});

export default router;
