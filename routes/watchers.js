const express = require('express');
const { getDb } = require('../config/database');
const { authenticate } = require('../middleware/auth');

const router = express.Router();
router.use(authenticate);

// Get watchers for a task
router.get('/:taskId', (req, res) => {
  try {
    const db = getDb();
    const watchers = db.prepare(`
      SELECT u.id, u.full_name, u.avatar
      FROM task_watchers tw JOIN users u ON tw.user_id = u.id
      WHERE tw.task_id = ?
    `).all(req.params.taskId);
    const isWatching = watchers.some(w => w.id === req.user.id);
    res.json({ watchers, isWatching });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Watch a task
router.post('/:taskId', (req, res) => {
  try {
    const db = getDb();
    db.prepare('INSERT OR IGNORE INTO task_watchers (task_id, user_id) VALUES (?, ?)').run(req.params.taskId, req.user.id);
    res.json({ success: true, isWatching: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Unwatch a task
router.delete('/:taskId', (req, res) => {
  try {
    const db = getDb();
    db.prepare('DELETE FROM task_watchers WHERE task_id = ? AND user_id = ?').run(req.params.taskId, req.user.id);
    res.json({ success: true, isWatching: false });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
