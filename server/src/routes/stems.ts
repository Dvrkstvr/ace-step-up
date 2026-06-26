import { Router, Request, Response } from 'express';
import { pool } from '../db/pool.js';

// This router is intended to be mounted at /api, giving:
//   GET    /api/tracks/:trackId/stems
//   POST   /api/tracks/:trackId/stems
//   PATCH  /api/stems/:id
//   DELETE /api/stems/:id

const router = Router();

// GET /api/tracks/:trackId/stems — list all stems for a track
router.get('/tracks/:trackId/stems', async (req: Request, res: Response) => {
  try {
    const result = await pool.query(
      `SELECT * FROM stems WHERE track_id = ? ORDER BY created_at ASC`,
      [req.params.trackId]
    );
    res.json(result.rows);
  } catch (error) {
    console.error('List stems error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/tracks/:trackId/stems — add a stem to a track
router.post('/tracks/:trackId/stems', async (req: Request, res: Response) => {
  try {
    const { instrument_class, audio_url, is_custom } = req.body;

    if (!instrument_class) {
      res.status(400).json({ error: 'instrument_class is required' });
      return;
    }
    if (!audio_url) {
      res.status(400).json({ error: 'audio_url is required' });
      return;
    }

    // Verify the parent track exists
    const trackCheck = await pool.query(
      `SELECT id FROM tracks WHERE id = ?`,
      [req.params.trackId]
    );
    if (trackCheck.rows.length === 0) {
      res.status(404).json({ error: 'Track not found' });
      return;
    }

    const result = await pool.query(
      `INSERT INTO stems (track_id, instrument_class, audio_url, is_custom)
       VALUES (?, ?, ?, ?)
       RETURNING *`,
      [req.params.trackId, instrument_class, audio_url, is_custom ? 1 : 0]
    );

    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Add stem error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PATCH /api/stems/:id — update a stem (swap audio_url or rename instrument_class)
router.patch('/stems/:id', async (req: Request, res: Response) => {
  try {
    const allowedFields = ['audio_url', 'instrument_class'];
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

    params.push(req.params.id);

    const result = await pool.query(
      `UPDATE stems SET ${setClauses.join(', ')} WHERE id = ? RETURNING *`,
      params
    );

    if (result.rows.length === 0) {
      res.status(404).json({ error: 'Stem not found' });
      return;
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Update stem error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /api/stems/:id — delete a stem
router.delete('/stems/:id', async (req: Request, res: Response) => {
  try {
    const result = await pool.query(
      `DELETE FROM stems WHERE id = ?`,
      [req.params.id]
    );

    if (result.rowCount === 0) {
      res.status(404).json({ error: 'Stem not found' });
      return;
    }

    res.status(204).send();
  } catch (error) {
    console.error('Delete stem error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
