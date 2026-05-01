const express = require('express');
const { getDb } = require('../config/database');
const { authenticate } = require('../middleware/auth');

const router = express.Router();
router.use(authenticate);

// Get all templates (global + project-specific)
router.get('/', (req, res) => {
  try {
    const { project_id } = req.query;
    const db = getDb();
    const templates = project_id
      ? db.prepare('SELECT t.*, u.full_name as creator FROM task_templates t JOIN users u ON t.created_by = u.id WHERE t.project_id = ? OR t.project_id IS NULL ORDER BY t.name').all(project_id)
      : db.prepare('SELECT t.*, u.full_name as creator FROM task_templates t JOIN users u ON t.created_by = u.id WHERE t.project_id IS NULL ORDER BY t.name').all();
    res.json({ templates });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Create template
router.post('/', (req, res) => {
  try {
    const { name, description, priority, project_id } = req.body;
    if (!name) return res.status(400).json({ error: 'name required' });
    const db = getDb();
    const result = db.prepare(
      'INSERT INTO task_templates (name, description, priority, project_id, created_by) VALUES (?, ?, ?, ?, ?)'
    ).run(name, description || null, priority || 'medium', project_id || null, req.user.id);
    const template = db.prepare('SELECT * FROM task_templates WHERE id = ?').get(result.lastInsertRowid);
    res.status(201).json({ template });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Delete template
router.delete('/:id', (req, res) => {
  try {
    const db = getDb();
    db.prepare('DELETE FROM task_templates WHERE id = ? AND created_by = ?').run(req.params.id, req.user.id);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
