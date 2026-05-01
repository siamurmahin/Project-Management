const express = require('express');
const { getDb } = require('../config/database');
const { authenticate } = require('../middleware/auth');

const router = express.Router();
router.use(authenticate);

// Start timer
router.post('/start', (req, res) => {
  try {
    const { task_id } = req.body;
    if (!task_id) return res.status(400).json({ error: 'task_id required' });
    const db = getDb();

    // Stop any running timer for this user first
    const running = db.prepare('SELECT * FROM time_logs WHERE user_id = ? AND end_time IS NULL').get(req.user.id);
    if (running) {
      const now = new Date().toISOString();
      const duration = Math.floor((Date.now() - new Date(running.start_time).getTime()) / 1000);
      db.prepare('UPDATE time_logs SET end_time = ?, duration_seconds = ? WHERE id = ?').run(now, duration, running.id);
    }

    const startTime = new Date().toISOString();
    const result = db.prepare('INSERT INTO time_logs (task_id, user_id, start_time) VALUES (?, ?, ?)').run(task_id, req.user.id, startTime);
    const log = db.prepare('SELECT * FROM time_logs WHERE id = ?').get(result.lastInsertRowid);
    res.status(201).json({ log });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Stop timer
router.post('/stop', (req, res) => {
  try {
    const db = getDb();
    const running = db.prepare('SELECT * FROM time_logs WHERE user_id = ? AND end_time IS NULL').get(req.user.id);
    if (!running) return res.status(404).json({ error: 'No running timer' });

    const now = new Date().toISOString();
    const duration = Math.floor((Date.now() - new Date(running.start_time).getTime()) / 1000);
    db.prepare('UPDATE time_logs SET end_time = ?, duration_seconds = ? WHERE id = ?').run(now, duration, running.id);
    const log = db.prepare('SELECT * FROM time_logs WHERE id = ?').get(running.id);
    res.json({ log });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get active timer
router.get('/active', (req, res) => {
  try {
    const db = getDb();
    const running = db.prepare(`
      SELECT tl.*, t.title as task_title, p.name as project_name
      FROM time_logs tl
      JOIN tasks t ON tl.task_id = t.id
      JOIN projects p ON t.project_id = p.id
      WHERE tl.user_id = ? AND tl.end_time IS NULL
    `).get(req.user.id);
    res.json({ timer: running || null });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get time logs for task
router.get('/task/:taskId', (req, res) => {
  try {
    const db = getDb();
    const logs = db.prepare(`
      SELECT tl.*, u.full_name FROM time_logs tl
      JOIN users u ON tl.user_id = u.id
      WHERE tl.task_id = ? ORDER BY tl.start_time DESC
    `).all(req.params.taskId);
    const total = logs.reduce((sum, l) => sum + (l.duration_seconds || 0), 0);
    res.json({ logs, total_seconds: total });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get user's time logs
router.get('/mine', (req, res) => {
  try {
    const db = getDb();
    // Clamp to a valid integer 1-365 to prevent injection via string interpolation
    const days = Math.min(365, Math.max(1, parseInt(req.query.days) || 7));
    const logs = db.prepare(`
      SELECT tl.*, t.title as task_title, p.name as project_name
      FROM time_logs tl
      JOIN tasks t ON tl.task_id = t.id
      JOIN projects p ON t.project_id = p.id
      WHERE tl.user_id = ? AND tl.end_time IS NOT NULL
        AND tl.start_time >= datetime('now', '-${days} days')
      ORDER BY tl.start_time DESC
    `).all(req.user.id);
    const total = logs.reduce((sum, l) => sum + (l.duration_seconds || 0), 0);
    res.json({ logs, total_seconds: total });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Delete time log — only the owner can delete
router.delete('/:id', (req, res) => {
  try {
    const db = getDb();
    const log = db.prepare('SELECT id FROM time_logs WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
    if (!log) return res.status(404).json({ error: 'Time log not found' });
    db.prepare('DELETE FROM time_logs WHERE id = ? AND user_id = ?').run(req.params.id, req.user.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
