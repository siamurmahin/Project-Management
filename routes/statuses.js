const express = require('express');
const { getDb } = require('../config/database');
const { authenticate, requireAdmin } = require('../middleware/auth');

const router = express.Router();
router.use(authenticate);

// Get custom statuses for a project
router.get('/:projectId', (req, res) => {
  try {
    const db = getDb();
    const statuses = db.prepare('SELECT * FROM custom_statuses WHERE project_id = ? ORDER BY position').all(req.params.projectId);
    res.json({ statuses });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Create custom status
router.post('/:projectId', (req, res) => {
  try {
    const { name, color, base_status } = req.body;
    if (!name) return res.status(400).json({ error: 'name required' });
    const db = getDb();
    const maxPos = db.prepare('SELECT COALESCE(MAX(position),0) as m FROM custom_statuses WHERE project_id = ?').get(req.params.projectId);
    const result = db.prepare(
      'INSERT INTO custom_statuses (project_id, name, color, base_status, position) VALUES (?, ?, ?, ?, ?)'
    ).run(req.params.projectId, name, color || '#6C5CE7', base_status || 'todo', (maxPos.m || 0) + 1);
    const status = db.prepare('SELECT * FROM custom_statuses WHERE id = ?').get(result.lastInsertRowid);
    res.status(201).json({ status });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Delete custom status
router.delete('/:id', (req, res) => {
  try {
    const db = getDb();
    db.prepare('DELETE FROM custom_statuses WHERE id = ?').run(req.params.id);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
