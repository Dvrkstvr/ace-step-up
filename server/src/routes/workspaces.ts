import { Router, Request, Response } from 'express';
import { pool } from '../db/pool.js';

const router = Router();

// GET /api/workspaces — list all workspaces, including track count per workspace
router.get('/', async (_req: Request, res: Response) => {
  try {
    const result = await pool.query(
      `SELECT w.id, w.name, w.type, w.created_at, w.updated_at,
              COUNT(t.id) AS track_count
       FROM workspaces w
       LEFT JOIN tracks t ON t.workspace_id = w.id
       GROUP BY w.id
       ORDER BY w.created_at DESC`
    );
    res.json(result.rows);
  } catch (error) {
    console.error('List workspaces error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/workspaces — create a new workspace
router.post('/', async (req: Request, res: Response) => {
  try {
    const { name, type } = req.body as { name?: string; type?: string };

    if (!name?.trim()) {
      res.status(400).json({ error: 'name is required' });
      return;
    }

    // pool auto-generates id for the workspaces table when id is omitted from the INSERT
    const result = await pool.query(
      `INSERT INTO workspaces (name, type) VALUES (?, ?) RETURNING *`,
      [name.trim(), type ?? 'General']
    );

    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Create workspace error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PATCH /api/workspaces/:id — update name and/or type
router.patch('/:id', async (req: Request, res: Response) => {
  try {
    const { name, type } = req.body as { name?: string; type?: string };

    if (name === undefined && type === undefined) {
      res.status(400).json({ error: 'At least one of name or type is required' });
      return;
    }

    // Build SET clause dynamically — only touch provided fields
    const sets: string[] = [];
    const params: unknown[] = [];

    if (name !== undefined) {
      sets.push('name = ?');
      params.push(name.trim());
    }
    if (type !== undefined) {
      sets.push('type = ?');
      params.push(type);
    }
    // Always refresh updated_at (SQL literal, no placeholder)
    sets.push("updated_at = datetime('now')");

    // WHERE clause param comes last
    params.push(req.params.id);

    const result = await pool.query(
      `UPDATE workspaces SET ${sets.join(', ')} WHERE id = ? RETURNING *`,
      params
    );

    if (result.rows.length === 0) {
      res.status(404).json({ error: 'Workspace not found' });
      return;
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Update workspace error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /api/workspaces/:id
// SQLite cascades: projects with workspace_id = id are deleted (ON DELETE CASCADE),
// which in turn sets tracks.project_id = NULL for those projects (ON DELETE SET NULL).
// Tracks whose workspace_id = id also get workspace_id set to NULL (ON DELETE SET NULL).
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const result = await pool.query(
      `DELETE FROM workspaces WHERE id = ?`,
      [req.params.id]
    );

    if (result.rowCount === 0) {
      res.status(404).json({ error: 'Workspace not found' });
      return;
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Delete workspace error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
