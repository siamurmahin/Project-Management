const express = require('express');
const { body, validationResult } = require('express-validator');
const { getDb } = require('../config/database');
const { authenticate, requireAdmin } = require('../middleware/auth');

const router = express.Router();
router.use(authenticate);

function isMember(db, projectId, userId) {
  return !!db.prepare('SELECT id FROM project_members WHERE project_id = ? AND user_id = ?').get(projectId, userId);
}

// Get all projects for current user
router.get('/', (req, res) => {
  try {
    const db = getDb();
    let projects;
    if (req.user.role === 'admin') {
      projects = db.prepare(`
        SELECT p.*, u.full_name as owner_name,
          (SELECT COUNT(*) FROM tasks WHERE project_id = p.id) as task_count,
          (SELECT COUNT(*) FROM tasks WHERE project_id = p.id AND status = 'done') as done_count,
          (SELECT COUNT(*) FROM project_members WHERE project_id = p.id) as member_count
        FROM projects p LEFT JOIN users u ON p.owner_id = u.id
        ORDER BY p.created_at DESC
      `).all();
    } else {
      projects = db.prepare(`
        SELECT p.*, u.full_name as owner_name,
          (SELECT COUNT(*) FROM tasks WHERE project_id = p.id) as task_count,
          (SELECT COUNT(*) FROM tasks WHERE project_id = p.id AND status = 'done') as done_count,
          (SELECT COUNT(*) FROM project_members WHERE project_id = p.id) as member_count
        FROM projects p
        LEFT JOIN users u ON p.owner_id = u.id
        WHERE p.owner_id = ? OR p.id IN (SELECT project_id FROM project_members WHERE user_id = ?)
        ORDER BY p.created_at DESC
      `).all(req.user.id, req.user.id);
    }
    res.json({ projects });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Create project
router.post('/', [
  body('name').trim().isLength({ min: 1 }).withMessage('Project name required'),
], (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

  try {
    const { name, description, color } = req.body;
    const db = getDb();

    const result = db.prepare(
      'INSERT INTO projects (name, description, color, owner_id) VALUES (?, ?, ?, ?)'
    ).run(name, description || null, color || '#6C5CE7', req.user.id);

    db.prepare('INSERT OR IGNORE INTO project_members (project_id, user_id) VALUES (?, ?)').run(result.lastInsertRowid, req.user.id);

    const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(result.lastInsertRowid);

    db.prepare('INSERT INTO activity_log (user_id, action, entity_type, entity_id, details) VALUES (?, ?, ?, ?, ?)').run(
      req.user.id, 'created', 'project', project.id, JSON.stringify({ name })
    );

    res.status(201).json({ project });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get project by id — must be member or admin
router.get('/:id', (req, res) => {
  try {
    const db = getDb();
    const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(req.params.id);
    if (!project) return res.status(404).json({ error: 'Project not found' });

    if (req.user.role !== 'admin' && !isMember(db, req.params.id, req.user.id)) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const members = db.prepare(`
      SELECT u.id, u.full_name, u.email, u.role, u.avatar
      FROM project_members pm JOIN users u ON pm.user_id = u.id
      WHERE pm.project_id = ?
    `).all(req.params.id);

    res.json({ project, members });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Update project — owner or admin only
router.put('/:id', [
  body('name').optional().trim().isLength({ min: 1 }).withMessage('Project name cannot be empty'),
  body('status').optional().isIn(['active', 'archived']).withMessage('Invalid status'),
], (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

  try {
    const db = getDb();
    const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(req.params.id);
    if (!project) return res.status(404).json({ error: 'Project not found' });

    if (req.user.role !== 'admin' && project.owner_id !== req.user.id) {
      return res.status(403).json({ error: 'Only the project owner or an admin can update this project' });
    }

    const { name, description, color, status } = req.body;
    db.prepare(
      'UPDATE projects SET name = COALESCE(?, name), description = COALESCE(?, description), color = COALESCE(?, color), status = COALESCE(?, status), updated_at = CURRENT_TIMESTAMP WHERE id = ?'
    ).run(name || null, description || null, color || null, status || null, req.params.id);

    const updated = db.prepare('SELECT * FROM projects WHERE id = ?').get(req.params.id);
    res.json({ project: updated });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Archive project (soft-delete) — admin only
router.delete('/:id', requireAdmin, (req, res) => {
  try {
    const db = getDb();
    const project = db.prepare('SELECT id FROM projects WHERE id = ?').get(req.params.id);
    if (!project) return res.status(404).json({ error: 'Project not found' });
    db.prepare("UPDATE projects SET status = 'archived', archived_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Restore archived project
router.patch('/:id/restore', (req, res) => {
  try {
    const db = getDb();
    const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(req.params.id);
    if (!project) return res.status(404).json({ error: 'Project not found' });
    if (req.user.role !== 'admin' && project.owner_id !== req.user.id) return res.status(403).json({ error: 'Forbidden' });
    db.prepare("UPDATE projects SET status = 'active', archived_at = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(req.params.id);
    const updated = db.prepare('SELECT * FROM projects WHERE id = ?').get(req.params.id);
    res.json({ project: updated });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Add member — admin only
router.post('/:id/members', requireAdmin, (req, res) => {
  try {
    const { user_id } = req.body;
    if (!user_id) return res.status(400).json({ error: 'user_id required' });
    const db = getDb();
    db.prepare('INSERT OR IGNORE INTO project_members (project_id, user_id) VALUES (?, ?)').run(req.params.id, user_id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Remove member — admin only
router.delete('/:id/members/:userId', requireAdmin, (req, res) => {
  try {
    const db = getDb();
    db.prepare('DELETE FROM project_members WHERE project_id = ? AND user_id = ?').run(req.params.id, req.params.userId);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
