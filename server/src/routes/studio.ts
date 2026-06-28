import { Router, Request, Response } from 'express';
import { pool } from '../db/pool.js';

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

    if (!source_type || !name || !audio_url) {
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
         (session_id, stem_id, parent_layer_id, source_type, name, audio_url, original_audio_url,
          volume, is_muted, is_solo, is_locked, sort_order,
          start_offset, clip_start, clip_end,
          region_start, region_end, generation_params)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       RETURNING *`,
      [
        sid,
        stem_id ?? null,
        parent_layer_id ?? null,
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
    const { volume, is_muted, is_solo, sort_order, name, start_offset, clip_start, clip_end } = req.body;

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
 * Stub — not yet implemented.
 * When implemented: call ACE-Step with task type 'repaint' and the layer's
 * audio_url as the source audio, then create a new 'repaint' layer with
 * parent_layer_id = this layer's id and audio_url = the generated audio URL.
 */
router.post('/layers/:id/repaint', async (_req: Request, res: Response) => {
  res.status(501).json({ error: 'Repaint not yet implemented' });
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

// ─── Mixdown and Preview ──────────────────────────────────────────────────────

/**
 * POST /api/studio/sessions/:sid/mixdown
 * Stub — not yet implemented.
 * When implemented: blend all non-muted layers using ffmpeg's amix filter,
 * applying per-layer volume, and return the mixed-down audio URL.
 */
router.post('/sessions/:sid/mixdown', async (_req: Request, res: Response) => {
  res.status(501).json({ error: 'Mixdown not yet implemented — requires ffmpeg integration' });
});

/**
 * GET /api/studio/sessions/:sid/preview
 * Stub — not yet implemented.
 */
router.get('/sessions/:sid/preview', async (_req: Request, res: Response) => {
  res.status(501).json({ error: 'Preview not yet implemented' });
});

export default router;
