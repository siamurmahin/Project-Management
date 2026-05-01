const express = require('express');
const { getDb } = require('../config/database');
const { authenticate } = require('../middleware/auth');

const router = express.Router();
router.use(authenticate);

// Get labels for a project
router.get('/project/:projectId', (req, res) => {
  try {
    const db = getDb();
    const labels = db.prepare('SELECT * FROM task_labels WHERE project_id = ? OR project_id IS NULL ORDER BY name').all(req.params.projectId);
    res.json({ labels });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Create label
router.post('/', (req, res) => {
  try {
    const { name, color, project_id } = req.body;
    if (!name) return res.status(400).json({ error: 'name required' });
    const db = getDb();
    const result = db.prepare('INSERT INTO task_labels (name, color, project_id, created_by) VALUES (?, ?, ?, ?)').run(name, color || '#6C5CE7', project_id || null, req.user.id);
    const label = db.prepare('SELECT * FROM task_labels WHERE id = ?').get(result.lastInsertRowid);
    res.status(201).json({ label });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Delete label
router.delete('/:id', (req, res) => {
  try {
    const db = getDb();
    db.prepare('DELETE FROM task_labels WHERE id = ? AND created_by = ?').run(req.params.id, req.user.id);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Get labels for a task
router.get('/task/:taskId', (req, res) => {
  try {
    const db = getDb();
    const labels = db.prepare(`
      SELECT tl.* FROM task_labels tl
      JOIN task_label_map tlm ON tl.id = tlm.label_id
      WHERE tlm.task_id = ?
    `).all(req.params.taskId);
    res.json({ labels });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Add label to task
router.post('/task/:taskId', (req, res) => {
  try {
    const { label_id } = req.body;
    if (!label_id) return res.status(400).json({ error: 'label_id required' });
    const db = getDb();
    db.prepare('INSERT OR IGNORE INTO task_label_map (task_id, label_id) VALUES (?, ?)').run(req.params.taskId, label_id);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Remove label from task
router.delete('/task/:taskId/:labelId', (req, res) => {
  try {
    const db = getDb();
    db.prepare('DELETE FROM task_label_map WHERE task_id = ? AND label_id = ?').run(req.params.taskId, req.params.labelId);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
