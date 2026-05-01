const express = require('express');
const { getDb } = require('../config/database');
const { authenticate, requireAdmin } = require('../middleware/auth');

const router = express.Router();
router.use(authenticate, requireAdmin);

router.get('/', (req, res) => {
  try {
    const db = getDb();
    const conds = []; const params = [];
    if (req.query.status) { conds.push('t.status=?'); params.push(req.query.status); }
    if (req.query.priority) { conds.push('t.priority=?'); params.push(req.query.priority); }
    if (req.query.project_id) { conds.push('t.project_id=?'); params.push(req.query.project_id); }
    if (req.query.assigned_to) { conds.push('t.assigned_to=?'); params.push(req.query.assigned_to); }
    if (req.query.unassigned === '1') conds.push('t.assigned_to IS NULL');
    if (req.query.overdue === '1') conds.push("t.due_date < date('now') AND t.status != 'done'");
    const where = conds.length ? 'WHERE ' + conds.join(' AND ') : '';
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(100, parseInt(req.query.limit) || 30);
    const offset = (page - 1) * limit;
    const total = db.prepare(`SELECT COUNT(*) as c FROM tasks t ${where}`).get(...params).c;
    const tasks = db.prepare(`
      SELECT t.*, p.name as project_name, p.color as project_color,
        u.full_name as assignee_name, c.full_name as creator_name
      FROM tasks t
      JOIN projects p ON t.project_id=p.id
      LEFT JOIN users u ON t.assigned_to=u.id
      JOIN users c ON t.created_by=c.id
      ${where} ORDER BY t.updated_at DESC LIMIT ? OFFSET ?
    `).all(...params, limit, offset);
    const stats = {
      total: db.prepare('SELECT COUNT(*) as c FROM tasks').get().c,
      overdue: db.prepare("SELECT COUNT(*) as c FROM tasks WHERE due_date < date('now') AND status != 'done'").get().c,
      unassigned: db.prepare('SELECT COUNT(*) as c FROM tasks WHERE assigned_to IS NULL').get().c,
      by_status: db.prepare('SELECT status, COUNT(*) as count FROM tasks GROUP BY status').all(),
      by_priority: db.prepare('SELECT priority, COUNT(*) as count FROM tasks GROUP BY priority').all(),
    };
    res.json({ tasks, stats, total, page, limit });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.put('/:id', (req, res) => {
  try {
    const { title, status, priority, assigned_to, due_date } = req.body;
    const db = getDb();
    const fields = []; const values = [];
    if (title) { fields.push('title=?'); values.push(title); }
    if (status) { fields.push('status=?'); values.push(status); }
    if (priority) { fields.push('priority=?'); values.push(priority); }
    if (assigned_to !== undefined) { fields.push('assigned_to=?'); values.push(assigned_to || null); }
    if (due_date !== undefined) { fields.push('due_date=?'); values.push(due_date || null); }
    if (!fields.length) return res.status(400).json({ error: 'Nothing to update' });
    fields.push('updated_at=CURRENT_TIMESTAMP');
    values.push(req.params.id);
    db.prepare(`UPDATE tasks SET ${fields.join(', ')} WHERE id=?`).run(...values);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete('/:id', (req, res) => {
  try {
    getDb().prepare('DELETE FROM tasks WHERE id=?').run(req.params.id);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/bulk', (req, res) => {
  try {
    const { action, task_ids, data } = req.body;
    if (!task_ids || !task_ids.length) return res.status(400).json({ error: 'No tasks selected' });
    const db = getDb();
    const ph = task_ids.map(() => '?').join(',');
    if (action === 'delete') {
      db.prepare(`DELETE FROM tasks WHERE id IN (${ph})`).run(...task_ids);
    } else if (action === 'status' && data && data.status) {
      db.prepare(`UPDATE tasks SET status=?,updated_at=CURRENT_TIMESTAMP WHERE id IN (${ph})`).run(data.status, ...task_ids);
    } else if (action === 'priority' && data && data.priority) {
      db.prepare(`UPDATE tasks SET priority=?,updated_at=CURRENT_TIMESTAMP WHERE id IN (${ph})`).run(data.priority, ...task_ids);
    } else if (action === 'assign') {
      db.prepare(`UPDATE tasks SET assigned_to=?,updated_at=CURRENT_TIMESTAMP WHERE id IN (${ph})`).run((data && data.assigned_to) || null, ...task_ids);
    } else {
      return res.status(400).json({ error: 'Unknown action' });
    }
    res.json({ success: true, count: task_ids.length });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
