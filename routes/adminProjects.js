const express = require('express');
const { getDb } = require('../config/database');
const { authenticate, requireAdmin } = require('../middleware/auth');

const router = express.Router();
router.use(authenticate, requireAdmin);

// All projects with full stats
router.get('/', (req, res) => {
  try {
    const db = getDb();
    const projects = db.prepare(`
      SELECT p.*, u.full_name as owner_name, u.avatar as owner_avatar,
        COUNT(DISTINCT pm.user_id) as member_count,
        COUNT(DISTINCT t.id) as task_count,
        COUNT(DISTINCT CASE WHEN t.status = 'done' THEN t.id END) as done_count,
        COUNT(DISTINCT CASE WHEN t.due_date < date('now') AND t.status != 'done' THEN t.id END) as overdue_count,
        MAX(t.updated_at) as last_activity
      FROM projects p
      JOIN users u ON p.owner_id = u.id
      LEFT JOIN project_members pm ON pm.project_id = p.id
      LEFT JOIN tasks t ON t.project_id = p.id
      GROUP BY p.id ORDER BY p.created_at DESC
    `).all();
    res.json({ projects });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Update project
router.put('/:id', (req, res) => {
  try {
    const { name, description, color, owner_id } = req.body;
    const db = getDb();
    const fields = []; const values = [];
    if (name) { fields.push('name = ?'); values.push(name); }
    if (description !== undefined) { fields.push('description = ?'); values.push(description); }
    if (color) { fields.push('color = ?'); values.push(color); }
    if (owner_id) { fields.push('owner_id = ?'); values.push(owner_id); }
    if (!fields.length) return res.status(400).json({ error: 'Nothing to update' });
    fields.push('updated_at = CURRENT_TIMESTAMP');
    values.push(req.params.id);
    db.prepare(`UPDATE projects SET ${fields.join(', ')} WHERE id = ?`).run(...values);
    res.json({ project: db.prepare('SELECT * FROM projects WHERE id = ?').get(req.params.id) });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Archive
router.patch('/:id/archive', (req, res) => {
  try {
    getDb().prepare("UPDATE projects SET status='archived', archived_at=CURRENT_TIMESTAMP WHERE id=?").run(req.params.id);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Restore
router.patch('/:id/restore', (req, res) => {
  try {
    getDb().prepare("UPDATE projects SET status='active', archived_at=NULL WHERE id=?").run(req.params.id);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Permanently delete
router.delete('/:id', (req, res) => {
  try {
    getDb().prepare('DELETE FROM projects WHERE id=?').run(req.params.id);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Get members of a project
router.get('/:id/members', (req, res) => {
  try {
    const members = getDb().prepare(`
      SELECT u.id, u.full_name, u.email, u.avatar, u.role
      FROM project_members pm JOIN users u ON pm.user_id = u.id
      WHERE pm.project_id = ?
    `).all(req.params.id);
    res.json({ members });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Add member
router.post('/:id/members', (req, res) => {
  try {
    getDb().prepare('INSERT OR IGNORE INTO project_members (project_id, user_id) VALUES (?, ?)').run(req.params.id, req.body.user_id);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Remove member
router.delete('/:id/members/:userId', (req, res) => {
  try {
    getDb().prepare('DELETE FROM project_members WHERE project_id=? AND user_id=?').run(req.params.id, req.params.userId);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
