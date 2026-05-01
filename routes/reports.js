const express = require('express');
const { getDb } = require('../config/database');
const { authenticate } = require('../middleware/auth');

const router = express.Router();
router.use(authenticate);

// Personal productivity stats
router.get('/my-stats', (req, res) => {
  try {
    const db = getDb();
    const completedThisWeek = db.prepare(`
      SELECT COUNT(*) as c FROM tasks WHERE assigned_to = ? AND status = 'done'
      AND updated_at >= datetime('now', '-7 days')
    `).get(req.user.id).c;

    const completedThisMonth = db.prepare(`
      SELECT COUNT(*) as c FROM tasks WHERE assigned_to = ? AND status = 'done'
      AND updated_at >= datetime('now', '-30 days')
    `).get(req.user.id).c;

    const timeThisWeek = db.prepare(`
      SELECT COALESCE(SUM(duration_seconds),0) as s FROM time_logs
      WHERE user_id = ? AND end_time IS NOT NULL AND start_time >= datetime('now', '-7 days')
    `).get(req.user.id).s;

    const timeThisMonth = db.prepare(`
      SELECT COALESCE(SUM(duration_seconds),0) as s FROM time_logs
      WHERE user_id = ? AND end_time IS NOT NULL AND start_time >= datetime('now', '-30 days')
    `).get(req.user.id).s;

    const tasksByStatus = db.prepare(`
      SELECT status, COUNT(*) as count FROM tasks WHERE assigned_to = ? GROUP BY status
    `).all(req.user.id);

    const dailyTime = db.prepare(`
      SELECT date(start_time) as day, SUM(duration_seconds) as seconds
      FROM time_logs WHERE user_id = ? AND end_time IS NOT NULL
      AND start_time >= datetime('now', '-30 days')
      GROUP BY date(start_time) ORDER BY day
    `).all(req.user.id);

    const overdue = db.prepare(`
      SELECT COUNT(*) as c FROM tasks WHERE assigned_to = ? AND status != 'done'
      AND due_date IS NOT NULL AND due_date < date('now')
    `).get(req.user.id).c;

    res.json({ completedThisWeek, completedThisMonth, timeThisWeek, timeThisMonth, tasksByStatus, dailyTime, overdue });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Project burndown data
router.get('/burndown/:projectId', (req, res) => {
  try {
    const db = getDb();
    const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(req.params.projectId);
    if (!project) return res.status(404).json({ error: 'Project not found' });

    const tasks = db.prepare(`
      SELECT id, status, created_at, updated_at, due_date FROM tasks WHERE project_id = ?
    `).all(req.params.projectId);

    const totalTasks = tasks.length;
    const doneTasks = tasks.filter(t => t.status === 'done').length;

    // Build daily completion data for last 30 days
    const daily = db.prepare(`
      SELECT date(updated_at) as day, COUNT(*) as done_count
      FROM tasks WHERE project_id = ? AND status = 'done'
      AND updated_at >= datetime('now', '-30 days')
      GROUP BY date(updated_at) ORDER BY day
    `).all(req.params.projectId);

    res.json({ totalTasks, doneTasks, daily, project: { name: project.name, color: project.color } });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// CSV export
router.get('/csv', (req, res) => {
  try {
    const { projectId, type = 'tasks' } = req.query;
    const db = getDb();

    let rows = [], headers = [];

    if (type === 'tasks') {
      headers = ['ID', 'Title', 'Status', 'Priority', 'Assigned To', 'Due Date', 'Project', 'Created', 'Updated'];
      const q = projectId
        ? `SELECT t.id, t.title, t.status, t.priority, u.full_name as assigned, t.due_date, p.name as project, t.created_at, t.updated_at
           FROM tasks t LEFT JOIN users u ON t.assigned_to = u.id LEFT JOIN projects p ON t.project_id = p.id
           WHERE t.project_id = ? ORDER BY t.created_at DESC`
        : `SELECT t.id, t.title, t.status, t.priority, u.full_name as assigned, t.due_date, p.name as project, t.created_at, t.updated_at
           FROM tasks t LEFT JOIN users u ON t.assigned_to = u.id LEFT JOIN projects p ON t.project_id = p.id
           ORDER BY t.created_at DESC`;
      const data = projectId ? db.prepare(q).all(projectId) : db.prepare(q).all();
      rows = data.map(r => [r.id, r.title, r.status, r.priority, r.assigned || '', r.due_date || '', r.project, r.created_at, r.updated_at]);
    } else if (type === 'time') {
      headers = ['ID', 'Task', 'Project', 'User', 'Start', 'End', 'Duration (min)'];
      const data = db.prepare(`
        SELECT tl.id, t.title, p.name as project, u.full_name, tl.start_time, tl.end_time, tl.duration_seconds
        FROM time_logs tl JOIN tasks t ON tl.task_id = t.id JOIN projects p ON t.project_id = p.id JOIN users u ON tl.user_id = u.id
        WHERE tl.end_time IS NOT NULL ORDER BY tl.start_time DESC LIMIT 1000
      `).all();
      rows = data.map(r => [r.id, r.title, r.project, r.full_name, r.start_time, r.end_time, Math.round((r.duration_seconds || 0) / 60)]);
    }

    const escape = v => `"${String(v || '').replace(/"/g, '""')}"`;
    const csv = [headers.map(escape).join(','), ...rows.map(r => r.map(escape).join(','))].join('\n');

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${type}-export-${Date.now()}.csv"`);
    res.send(csv);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Overdue tasks
router.get('/overdue', (req, res) => {
  try {
    const db = getDb();
    const tasks = db.prepare(`
      SELECT t.*, u.full_name as assigned_name, p.name as project_name, p.color as project_color
      FROM tasks t
      LEFT JOIN users u ON t.assigned_to = u.id
      LEFT JOIN projects p ON t.project_id = p.id
      WHERE t.status != 'done' AND t.due_date IS NOT NULL AND t.due_date < date('now')
      AND (t.assigned_to = ? OR t.created_by = ? OR t.project_id IN (SELECT project_id FROM project_members WHERE user_id = ?))
      ORDER BY t.due_date ASC LIMIT 50
    `).all(req.user.id, req.user.id, req.user.id);
    res.json({ tasks });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Project activity feed
router.get('/activity/:projectId', (req, res) => {
  try {
    const db = getDb();
    const activity = db.prepare(`
      SELECT al.*, u.full_name, u.avatar FROM activity_log al
      JOIN users u ON al.user_id = u.id
      WHERE al.entity_type IN ('task', 'project') AND (
        (al.entity_type = 'project' AND al.entity_id = ?) OR
        (al.entity_type = 'task' AND al.entity_id IN (SELECT id FROM tasks WHERE project_id = ?))
      )
      ORDER BY al.created_at DESC LIMIT 30
    `).all(req.params.projectId, req.params.projectId);
    res.json({ activity });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
