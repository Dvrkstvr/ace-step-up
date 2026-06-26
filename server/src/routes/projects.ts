import { Router, Request, Response } from 'express';
import { pool } from '../db/pool.js';

// This router is designed to be mounted at /api so that it can serve endpoints
// rooted at three different path prefixes:
//   GET  /workspaces/:wsId/projects
//   POST /workspaces/:wsId/projects
//   POST /tracks/:trackId/promote
//   PATCH  /projects/:id
//   DELETE /projects/:id
const router = Router();

// GET /api/workspaces/:wsId/projects
// Returns all projects in the workspace plus a lightweight preview of each project's
// latest track (audio_url, title) so the UI can render a thumbnail/player.
router.get('/workspaces/:wsId/projects', async (req: Request, res: Response) => {
  try {
    // Verify workspace exists
    const wsCheck = await pool.query(
      `SELECT id FROM workspaces WHERE id = ?`,
      [req.params.wsId]
    );
    if (wsCheck.rows.length === 0) {
      res.status(404).json({ error: 'Workspace not found' });
      return;
    }

    const result = await pool.query(
      `SELECT p.id, p.name, p.workspace_id, p.created_at, p.updated_at,
              COUNT(t.id) AS track_count,
              (SELECT t2.title     FROM tracks t2 WHERE t2.project_id = p.id ORDER BY t2.created_at DESC LIMIT 1) AS latest_track_title,
              (SELECT t2.audio_url FROM tracks t2 WHERE t2.project_id = p.id ORDER BY t2.created_at DESC LIMIT 1) AS latest_audio_url,
              (SELECT t2.created_at FROM tracks t2 WHERE t2.project_id = p.id ORDER BY t2.created_at DESC LIMIT 1) AS latest_track_at
       FROM projects p
       LEFT JOIN tracks t ON t.project_id = p.id
       WHERE p.workspace_id = ?
       GROUP BY p.id
       ORDER BY p.created_at DESC`,
      [req.params.wsId]
    );

    res.json(result.rows);
  } catch (error) {
    console.error('List projects error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/workspaces/:wsId/projects — create a project inside a workspace
router.post('/workspaces/:wsId/projects', async (req: Request, res: Response) => {
  try {
    // Verify workspace exists
    const wsCheck = await pool.query(
      `SELECT id FROM workspaces WHERE id = ?`,
      [req.params.wsId]
    );
    if (wsCheck.rows.length === 0) {
      res.status(404).json({ error: 'Workspace not found' });
      return;
    }

    const { name } = req.body as { name?: string };
    if (!name?.trim()) {
      res.status(400).json({ error: 'name is required' });
      return;
    }

    // pool auto-generates id for the projects table when id is omitted
    const result = await pool.query(
      `INSERT INTO projects (workspace_id, name) VALUES (?, ?) RETURNING *`,
      [req.params.wsId, name.trim()]
    );

    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Create project error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/tracks/:trackId/promote
// Promotes a standalone track (project_id IS NULL) into a new project.
// Steps:
//   1. Look up the track to get its workspace_id and title.
//   2. Create a new project in that workspace (name defaults to track title).
//   3. Set track.project_id = new project id.
// Runs inside a transaction so both writes succeed or both are rolled back.
router.post('/tracks/:trackId/promote', async (req: Request, res: Response) => {
  const client = await pool.connect();
  try {
    // Look up the track
    const trackResult = await client.query(
      `SELECT id, title, workspace_id, project_id FROM tracks WHERE id = ?`,
      [req.params.trackId]
    );

    if (trackResult.rows.length === 0) {
      res.status(404).json({ error: 'Track not found' });
      return;
    }

    const track = trackResult.rows[0];

    if (track.project_id) {
      res.status(400).json({ error: 'Track already belongs to a project' });
      return;
    }

    // A track may have no workspace if its workspace was deleted (workspace_id SET NULL).
    // In that case we can't auto-place it — require the caller to supply a workspace.
    const workspaceId: string = track.workspace_id ?? (req.body as any)?.workspace_id;
    if (!workspaceId) {
      res.status(400).json({ error: 'Track has no workspace. Provide workspace_id in the request body.' });
      return;
    }

    // Optional override for the project name; falls back to track title
    const projectName: string = ((req.body as any)?.name as string | undefined)?.trim() || track.title;

    await client.query('BEGIN');

    // Create project (pool auto-generates id)
    const projectResult = await client.query(
      `INSERT INTO projects (workspace_id, name) VALUES (?, ?) RETURNING *`,
      [workspaceId, projectName]
    );
    const newProject = projectResult.rows[0];

    // Link track to the new project
    await client.query(
      `UPDATE tracks SET project_id = ?, updated_at = datetime('now') WHERE id = ?`,
      [newProject.id, req.params.trackId]
    );

    await client.query('COMMIT');

    res.status(201).json(newProject);
  } catch (error) {
    try { await client.query('ROLLBACK'); } catch { /* ignore rollback errors */ }
    console.error('Promote track error:', error);
    res.status(500).json({ error: 'Internal server error' });
  } finally {
    client.release();
  }
});

// PATCH /api/projects/:id — update project name
router.patch('/projects/:id', async (req: Request, res: Response) => {
  try {
    const { name } = req.body as { name?: string };

    if (!name?.trim()) {
      res.status(400).json({ error: 'name is required' });
      return;
    }

    const result = await pool.query(
      `UPDATE projects SET name = ?, updated_at = datetime('now') WHERE id = ? RETURNING *`,
      [name.trim(), req.params.id]
    );

    if (result.rows.length === 0) {
      res.status(404).json({ error: 'Project not found' });
      return;
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Update project error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /api/projects/:id
// SQLite FK behaviour: tracks.project_id has ON DELETE SET NULL, so tracks that
// belonged to this project are kept but become standalone (project_id = NULL).
router.delete('/projects/:id', async (req: Request, res: Response) => {
  try {
    const result = await pool.query(
      `DELETE FROM projects WHERE id = ?`,
      [req.params.id]
    );

    if (result.rowCount === 0) {
      res.status(404).json({ error: 'Project not found' });
      return;
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Delete project error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
