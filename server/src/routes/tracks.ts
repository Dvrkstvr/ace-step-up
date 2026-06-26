import { Router, Request, Response } from 'express';
import { pool } from '../db/pool.js';

const router = Router();

// Parse JSON text columns stored in SQLite back to objects/arrays
function parseTrack(track: any): any {
  if (!track) return track;
  return {
    ...track,
    tags: (() => {
      try { return JSON.parse(track.tags || '[]'); } catch { return []; }
    })(),
    parameters: (() => {
      try { return JSON.parse(track.parameters || '{}'); } catch { return {}; }
    })(),
  };
}

// GET /api/tracks — list tracks with optional filters
router.get('/', async (req: Request, res: Response) => {
  try {
    const { workspace_id, project_id, parent_track_id } = req.query;

    const conditions: string[] = [];
    const params: unknown[] = [];

    if (workspace_id !== undefined) {
      conditions.push('workspace_id = ?');
      params.push(workspace_id);
    }
    if (project_id !== undefined) {
      conditions.push('project_id = ?');
      params.push(project_id);
    }
    if (parent_track_id !== undefined) {
      conditions.push('parent_track_id = ?');
      params.push(parent_track_id);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const result = await pool.query(
      `SELECT * FROM tracks ${where} ORDER BY created_at DESC`,
      params.length > 0 ? params : undefined
    );

    res.json(result.rows.map(parseTrack));
  } catch (error) {
    console.error('List tracks error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/tracks/:id — get single track with stems and children
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const trackResult = await pool.query(
      `SELECT * FROM tracks WHERE id = ?`,
      [req.params.id]
    );

    if (trackResult.rows.length === 0) {
      res.status(404).json({ error: 'Track not found' });
      return;
    }

    const track = parseTrack(trackResult.rows[0]);

    const [stemsResult, childrenResult] = await Promise.all([
      pool.query(
        `SELECT * FROM stems WHERE track_id = ? ORDER BY created_at ASC`,
        [req.params.id]
      ),
      pool.query(
        `SELECT * FROM tracks WHERE parent_track_id = ? ORDER BY created_at ASC`,
        [req.params.id]
      ),
    ]);

    res.json({
      ...track,
      stems: stemsResult.rows,
      children: childrenResult.rows.map(parseTrack),
    });
  } catch (error) {
    console.error('Get track error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/tracks — create track
router.post('/', async (req: Request, res: Response) => {
  try {
    const {
      workspace_id, project_id, parent_track_id, title,
      audio_url, task_type, prompt, lyrics, style,
      duration, bpm, key_scale, time_signature,
      parameters, seed, cover_url, tags,
    } = req.body;

    if (!title) {
      res.status(400).json({ error: 'title is required' });
      return;
    }

    const result = await pool.query(
      `INSERT INTO tracks (
        workspace_id, project_id, parent_track_id, title,
        audio_url, task_type, prompt, lyrics, style,
        duration, bpm, key_scale, time_signature,
        parameters, seed, cover_url, tags
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      RETURNING *`,
      [
        workspace_id ?? null,
        project_id ?? null,
        parent_track_id ?? null,
        title,
        audio_url ?? null,
        task_type ?? 'text2music',
        prompt ?? null,
        lyrics ?? null,
        style ?? null,
        duration ?? null,
        bpm ?? null,
        key_scale ?? null,
        time_signature ?? null,
        parameters ?? {},
        seed ?? null,
        cover_url ?? null,
        tags ?? [],
      ]
    );

    res.status(201).json(parseTrack(result.rows[0]));
  } catch (error) {
    console.error('Create track error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PATCH /api/tracks/:id — update any track fields
router.patch('/:id', async (req: Request, res: Response) => {
  try {
    const allowedFields = [
      'workspace_id', 'project_id', 'parent_track_id', 'title',
      'audio_url', 'task_type', 'prompt', 'lyrics', 'style',
      'duration', 'bpm', 'key_scale', 'time_signature',
      'parameters', 'seed', 'cover_url', 'tags',
    ];

    const setClauses: string[] = [];
    const params: unknown[] = [];

    for (const field of allowedFields) {
      if (field in req.body) {
        setClauses.push(`${field} = ?`);
        params.push(req.body[field]);
      }
    }

    if (setClauses.length === 0) {
      res.status(400).json({ error: 'No valid fields to update' });
      return;
    }

    // updated_at as a literal — safe here since it has no nested parens issue
    // (it's in the SET clause, not the VALUES clause that pool's regex scans)
    setClauses.push(`updated_at = datetime('now')`);
    params.push(req.params.id);

    const result = await pool.query(
      `UPDATE tracks SET ${setClauses.join(', ')} WHERE id = ? RETURNING *`,
      params
    );

    if (result.rows.length === 0) {
      res.status(404).json({ error: 'Track not found' });
      return;
    }

    res.json(parseTrack(result.rows[0]));
  } catch (error) {
    console.error('Update track error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /api/tracks/:id — delete track (stems cascade automatically via FK)
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const result = await pool.query(
      `DELETE FROM tracks WHERE id = ?`,
      [req.params.id]
    );

    if (result.rowCount === 0) {
      res.status(404).json({ error: 'Track not found' });
      return;
    }

    res.status(204).send();
  } catch (error) {
    console.error('Delete track error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/tracks/:id/iterate — create a variation by copying the source track
router.post('/:id/iterate', async (req: Request, res: Response) => {
  try {
    const sourceResult = await pool.query(
      `SELECT * FROM tracks WHERE id = ?`,
      [req.params.id]
    );

    if (sourceResult.rows.length === 0) {
      res.status(404).json({ error: 'Track not found' });
      return;
    }

    const source = sourceResult.rows[0];
    const { title, prompt, style } = req.body;

    const result = await pool.query(
      `INSERT INTO tracks (
        workspace_id, project_id, parent_track_id, title,
        audio_url, task_type, prompt, lyrics, style,
        duration, bpm, key_scale, time_signature,
        parameters, seed, cover_url, tags
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      RETURNING *`,
      [
        source.workspace_id,
        source.project_id,
        req.params.id,           // parent_track_id = source track id
        title ?? source.title,
        source.audio_url,
        source.task_type,
        prompt ?? source.prompt,
        source.lyrics,
        style ?? source.style,
        source.duration,
        source.bpm,
        source.key_scale,
        source.time_signature,
        source.parameters,        // already a JSON string from DB; pool leaves strings as-is
        source.seed,
        source.cover_url,
        source.tags,              // already a JSON string from DB
      ]
    );

    res.status(201).json(parseTrack(result.rows[0]));
  } catch (error) {
    console.error('Iterate track error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/tracks/:id/extract-prompt — stub (not yet implemented)
router.post('/:id/extract-prompt', (_req: Request, res: Response) => {
  res.status(501).json({ error: 'Extract prompt not yet implemented' });
});

// POST /api/tracks/:id/split-stems — stub (not yet implemented)
router.post('/:id/split-stems', (_req: Request, res: Response) => {
  res.status(501).json({ error: 'Stem splitting not yet implemented' });
});

export default router;
