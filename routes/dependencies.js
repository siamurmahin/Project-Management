const express = require('express');
const { getDb } = require('../config/database');
const { authenticate } = require('../middleware/auth');

const router = express.Router();
router.use(authenticate);

// Get dependencies for a task (tasks this task depends on)
router.get('/:taskId', (req, res) => {
  try {
    const db = getDb();
    const deps = db.prepare(`
      SELECT t.id, t.title, t.status, t.priority, p.name as project_name
      FROM task_dependencies td
      JOIN tasks t ON td.depends_on = t.id
      LEFT JOIN projects p ON t.project_id = p.id
      WHERE td.task_id = ?
    `).all(req.params.taskId);

    const blockedBy = db.prepare(`
      SELECT t.id, t.title, t.status FROM task_dependencies td
      JOIN tasks t ON td.task_id = t.id
      WHERE td.depends_on = ?
    `).all(req.params.taskId);

    res.json({ dependencies: deps, blockedBy });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Add dependency (taskId depends on dependsOnId)
router.post('/:taskId', (req, res) => {
  try {
    const { depends_on } = req.body;
    const taskId = parseInt(req.params.taskId);
    const depId = parseInt(depends_on);

    if (!depId || depId === taskId) return res.status(400).json({ error: 'Invalid dependency' });

    const db = getDb();

    // Simple cycle check: don't allow A->B if B->A already exists
    const cycle = db.prepare('SELECT 1 FROM task_dependencies WHERE task_id = ? AND depends_on = ?').get(depId, taskId);
    if (cycle) return res.status(400).json({ error: 'Circular dependency detected' });

    db.prepare('INSERT OR IGNORE INTO task_dependencies (task_id, depends_on) VALUES (?, ?)').run(taskId, depId);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Remove dependency
router.delete('/:taskId/:dependsOnId', (req, res) => {
  try {
    const db = getDb();
    db.prepare('DELETE FROM task_dependencies WHERE task_id = ? AND depends_on = ?').run(req.params.taskId, req.params.dependsOnId);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
