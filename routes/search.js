const express = require('express');
const { getDb } = require('../config/database');
const { authenticate } = require('../middleware/auth');

const router = express.Router();
router.use(authenticate);

router.get('/', (req, res) => {
  try {
    const { q, projectId } = req.query;
    if (!q || q.trim().length < 2) return res.json({ tasks: [], projects: [], comments: [] });

    const term = `%${q.trim()}%`;
    const db = getDb();

    const projectFilter = req.user.role === 'admin'
      ? ''
      : 'AND (p.owner_id = ' + req.user.id + ' OR p.id IN (SELECT project_id FROM project_members WHERE user_id = ' + req.user.id + '))';

    const projectIdFilter = projectId ? `AND t.project_id = ${parseInt(projectId)}` : '';

    const tasks = db.prepare(`
      SELECT t.id, t.title, t.status, t.priority, t.due_date,
        p.name as project_name, p.color as project_color,
        u.full_name as assigned_name
      FROM tasks t
      LEFT JOIN projects p ON t.project_id = p.id
      LEFT JOIN users u ON t.assigned_to = u.id
      WHERE (t.title LIKE ? OR t.description LIKE ?)
        ${projectIdFilter}
        ${projectFilter}
      ORDER BY t.updated_at DESC LIMIT 20
    `).all(term, term);

    const projects = req.user.role === 'admin'
      ? db.prepare(`SELECT id, name, color, description, status FROM projects WHERE name LIKE ? LIMIT 10`).all(term)
      : db.prepare(`SELECT id, name, color, description, status FROM projects WHERE name LIKE ? AND (owner_id = ? OR id IN (SELECT project_id FROM project_members WHERE user_id = ?)) LIMIT 10`).all(term, req.user.id, req.user.id);

    const comments = db.prepare(`
      SELECT tc.id, tc.content, tc.task_id, tc.created_at,
        t.title as task_title, u.full_name
      FROM task_comments tc
      JOIN tasks t ON tc.task_id = t.id
      JOIN users u ON tc.user_id = u.id
      WHERE tc.content LIKE ?
      ORDER BY tc.created_at DESC LIMIT 10
    `).all(term);

    res.json({ tasks, projects, comments });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
