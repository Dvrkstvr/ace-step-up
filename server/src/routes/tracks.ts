import { Router, Request, Response } from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { pool } from '../db/pool.js';
import { splitWithDemucs, DEMUCS_MODEL_STEMS, type DemucsModel } from '../services/demucs.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const AUDIO_DIR = path.join(__dirname, '../../public/audio');

function resolveAudioPath(audioUrl: string): string {
  if (audioUrl.startsWith('/audio/')) {
    return path.join(AUDIO_DIR, audioUrl.replace('/audio/', ''));
  }
  return audioUrl;
}

interface StemJob {
  status: 'running' | 'succeeded' | 'failed';
  stems?: unknown[];
  error?: string;
  startTime: number;
}

const stemJobs = new Map<string, StemJob>();

// Cleanup stem jobs older than 1 hour
setInterval(() => {
  const cutoff = Date.now() - 3_600_000;
  for (const [id, job] of stemJobs) {
    if (job.startTime < cutoff) stemJobs.delete(id);
  }
}, 600_000);

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
      `SELECT t.*, (SELECT COUNT(*) FROM stems WHERE track_id = t.id) as stem_count
       FROM tracks t ${where} ORDER BY t.created_at DESC`,
      params.length > 0 ? params : undefined
    );

    res.json(result.rows.map(r => ({ ...parseTrack(r), has_stems: r.stem_count > 0 })));
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

// POST /api/tracks/:id/iterate — return source track params for re-generation
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

    const source = parseTrack(sourceResult.rows[0]);
    // Return the source params so the frontend can pre-fill a new generation.
    // Use a random seed so the variation sounds different.
    const params = source.parameters ?? {};
    res.json({
      sourceTrackId: source.id,
      workspaceId: source.workspace_id,
      projectId: source.project_id,
      caption: source.style ?? params.caption ?? '',
      lyrics: source.lyrics ?? params.lyrics ?? '',
      duration: source.duration ?? params.duration,
      bpm: source.bpm ?? params.bpm,
      keyScale: source.key_scale ?? params.keyScale,
      timeSignature: source.time_signature ?? params.timeSignature,
      taskType: source.task_type ?? params.taskType ?? 'text2music',
      ditModel: params.ditModel,
      inferenceSteps: params.inferenceSteps,
      guidanceScale: params.guidanceScale,
      shift: params.shift,
      vocalLanguage: params.vocalLanguage,
    });
  } catch (error) {
    console.error('Iterate track error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/tracks/:id/extract-prompt — stub (not yet implemented)
router.post('/:id/extract-prompt', (_req: Request, res: Response) => {
  res.status(501).json({ error: 'Extract prompt not yet implemented' });
});

// POST /api/tracks/:id/split-stems — start async Demucs stem splitting job
router.post('/:id/split-stems', async (req: Request, res: Response) => {
  try {
    const trackResult = await pool.query(
      `SELECT id, audio_url FROM tracks WHERE id = ?`,
      [req.params.id]
    );
    if (trackResult.rows.length === 0) {
      res.status(404).json({ error: 'Track not found' });
      return;
    }

    const track = trackResult.rows[0];
    if (!track.audio_url) {
      res.status(400).json({ error: 'Track has no audio file' });
      return;
    }

    const model: DemucsModel = (req.body.model as DemucsModel) || 'htdemucs';
    const selectedStems: string[] | undefined = req.body.stems;

    if (!DEMUCS_MODEL_STEMS[model]) {
      res.status(400).json({ error: `Unknown model: ${model}` });
      return;
    }

    const jobId = `stems_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    stemJobs.set(jobId, { status: 'running', startTime: Date.now() });

    res.json({ jobId });

    // Run Demucs asynchronously
    (async () => {
      const job = stemJobs.get(jobId)!;
      try {
        const audioPath = resolveAudioPath(track.audio_url);
        const stemResults = await splitWithDemucs(audioPath, track.id, model, selectedStems);

        // Delete any existing stems for this track before inserting new ones
        await pool.query(`DELETE FROM stems WHERE track_id = ?`, [track.id]);

        for (const stem of stemResults) {
          await pool.query(
            `INSERT INTO stems (track_id, instrument_class, audio_url) VALUES (?, ?, ?)`,
            [track.id, stem.instrument_class, stem.audio_url]
          );
        }

        const saved = await pool.query(
          `SELECT * FROM stems WHERE track_id = ? ORDER BY created_at ASC`,
          [track.id]
        );

        job.status = 'succeeded';
        job.stems = saved.rows;
        console.log(`[Stems] Job ${jobId}: split ${saved.rows.length} stems for track ${track.id}`);
      } catch (err) {
        job.status = 'failed';
        job.error = err instanceof Error ? err.message : 'Stem splitting failed';
        console.error(`[Stems] Job ${jobId} failed:`, err);
      }
    })();
  } catch (error) {
    console.error('Split stems error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/tracks/:id/split-stems/:jobId — poll stem splitting job status
router.get('/:id/split-stems/:jobId', (req: Request, res: Response) => {
  const job = stemJobs.get(req.params.jobId);
  if (!job) {
    res.status(404).json({ error: 'Job not found' });
    return;
  }
  const elapsed = Math.round((Date.now() - job.startTime) / 1000);
  res.json({ status: job.status, stems: job.stems, error: job.error, elapsed });
});

export default router;
