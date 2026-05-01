const express = require('express');
const { getDb } = require('../config/database');
const { authenticate } = require('../middleware/auth');

const router = express.Router();
router.use(authenticate);

// Get subtasks for a task
router.get('/:taskId', (req, res) => {
  try {
    const db = getDb();
    const subtasks = db.prepare('SELECT * FROM subtasks WHERE task_id = ? ORDER BY position, id').all(req.params.taskId);
    res.json({ subtasks });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Create subtask
router.post('/:taskId', (req, res) => {
  try {
    const { title } = req.body;
    if (!title) return res.status(400).json({ error: 'title required' });
    const db = getDb();
    const maxPos = db.prepare('SELECT COALESCE(MAX(position),0) as m FROM subtasks WHERE task_id = ?').get(req.params.taskId);
    const result = db.prepare('INSERT INTO subtasks (task_id, title, position) VALUES (?, ?, ?)').run(req.params.taskId, title.trim(), (maxPos.m || 0) + 1);
    const subtask = db.prepare('SELECT * FROM subtasks WHERE id = ?').get(result.lastInsertRowid);
    res.status(201).json({ subtask });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Toggle subtask done
router.patch('/:id/toggle', (req, res) => {
  try {
    const db = getDb();
    const sub = db.prepare('SELECT * FROM subtasks WHERE id = ?').get(req.params.id);
    if (!sub) return res.status(404).json({ error: 'Subtask not found' });
    db.prepare('UPDATE subtasks SET is_done = ? WHERE id = ?').run(sub.is_done ? 0 : 1, req.params.id);
    const updated = db.prepare('SELECT * FROM subtasks WHERE id = ?').get(req.params.id);
    res.json({ subtask: updated });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Update subtask title
router.put('/:id', (req, res) => {
  try {
    const { title } = req.body;
    if (!title) return res.status(400).json({ error: 'title required' });
    const db = getDb();
    db.prepare('UPDATE subtasks SET title = ? WHERE id = ?').run(title.trim(), req.params.id);
    const updated = db.prepare('SELECT * FROM subtasks WHERE id = ?').get(req.params.id);
    res.json({ subtask: updated });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Delete subtask
router.delete('/:id', (req, res) => {
  try {
    const db = getDb();
    db.prepare('DELETE FROM subtasks WHERE id = ?').run(req.params.id);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
