const express = require('express');
const bcrypt = require('bcryptjs');
const { body, validationResult } = require('express-validator');
const { getDb } = require('../config/database');
const { authenticate, requireAdmin } = require('../middleware/auth');
const { sendWelcomeEmail, sendBroadcastNotification } = require('../services/emailService');

const router = express.Router();
router.use(authenticate, requireAdmin);

// Dashboard stats
router.get('/dashboard', (req, res) => {
  try {
    const db = getDb();
    const stats = {
      total_users: db.prepare('SELECT COUNT(*) as c FROM users').get().c,
      total_projects: db.prepare('SELECT COUNT(*) as c FROM projects').get().c,
      total_tasks: db.prepare('SELECT COUNT(*) as c FROM tasks').get().c,
      tasks_done: db.prepare("SELECT COUNT(*) as c FROM tasks WHERE status = 'done'").get().c,
      tasks_in_progress: db.prepare("SELECT COUNT(*) as c FROM tasks WHERE status = 'in_progress'").get().c,
      tasks_blocked: db.prepare("SELECT COUNT(*) as c FROM tasks WHERE status = 'blocked'").get().c,
      total_time_seconds: db.prepare('SELECT COALESCE(SUM(duration_seconds), 0) as c FROM time_logs WHERE end_time IS NOT NULL').get().c,
    };

    const recent_activity = db.prepare(`
      SELECT al.*, u.full_name, u.avatar
      FROM activity_log al
      JOIN users u ON al.user_id = u.id
      ORDER BY al.created_at DESC LIMIT 20
    `).all();

    const top_users = db.prepare(`
      SELECT u.id, u.full_name, u.avatar, u.role,
        COUNT(DISTINCT t.id) as task_count,
        COALESCE(SUM(tl.duration_seconds), 0) as total_seconds
      FROM users u
      LEFT JOIN tasks t ON t.assigned_to = u.id
      LEFT JOIN time_logs tl ON tl.user_id = u.id AND tl.end_time IS NOT NULL
      GROUP BY u.id ORDER BY total_seconds DESC LIMIT 5
    `).all();

    res.json({ stats, recent_activity, top_users });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// List all users
router.get('/users', (req, res) => {
  try {
    const db = getDb();
    const users = db.prepare(`
      SELECT u.id, u.full_name, u.email, u.role, u.avatar, u.is_active, u.created_at,
        COUNT(DISTINCT t.id) as task_count
      FROM users u
      LEFT JOIN tasks t ON t.assigned_to = u.id
      GROUP BY u.id ORDER BY u.created_at DESC
    `).all();
    res.json({ users });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Create user
router.post('/users', [
  body('full_name').trim().isLength({ min: 2 }),
  body('email').isEmail().normalizeEmail(),
  body('role').isIn(['admin', 'staff']),
  body('password').optional().isLength({ min: 6 })
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

  try {
    const { full_name, email, role, password } = req.body;
    const db = getDb();

    const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
    if (existing) return res.status(409).json({ error: 'Email already in use' });

    const tempPass = password || Math.random().toString(36).slice(-8) + 'A1!';
    const hash = await bcrypt.hash(tempPass, 10);

    const result = db.prepare('INSERT INTO users (full_name, email, password, role) VALUES (?, ?, ?, ?)').run(full_name, email, hash, role);
    const user = db.prepare('SELECT id, full_name, email, role, avatar, is_active, created_at FROM users WHERE id = ?').get(result.lastInsertRowid);

    sendWelcomeEmail(email, full_name, tempPass).catch(() => {});

    res.status(201).json({ user });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get user details
router.get('/users/:id', (req, res) => {
  try {
    const db = getDb();
    const user = db.prepare('SELECT id, full_name, email, role, avatar, is_active, created_at FROM users WHERE id = ?').get(req.params.id);
    if (!user) return res.status(404).json({ error: 'User not found' });

    const tasks = db.prepare(`
      SELECT t.*, p.name as project_name FROM tasks t
      JOIN projects p ON t.project_id = p.id
      WHERE t.assigned_to = ? ORDER BY t.updated_at DESC LIMIT 10
    `).all(req.params.id);

    const time_today = db.prepare(`
      SELECT COALESCE(SUM(duration_seconds), 0) as seconds FROM time_logs
      WHERE user_id = ? AND date(start_time) = date('now') AND end_time IS NOT NULL
    `).get(req.params.id);

    res.json({ user, tasks, time_today: time_today.seconds });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Update user — single batched query
router.put('/users/:id', async (req, res) => {
  try {
    const { full_name, email, role, is_active, password } = req.body;
    const db = getDb();

    const user = db.prepare('SELECT id FROM users WHERE id = ?').get(req.params.id);
    if (!user) return res.status(404).json({ error: 'User not found' });

    // Build dynamic SET clause to avoid multiple round trips
    const fields = [];
    const values = [];

    if (full_name !== undefined) { fields.push('full_name = ?'); values.push(full_name); }
    if (email !== undefined) { fields.push('email = ?'); values.push(email); }
    if (role !== undefined) { fields.push('role = ?'); values.push(role); }
    if (is_active !== undefined) { fields.push('is_active = ?'); values.push(is_active ? 1 : 0); }
    if (password) {
      const hash = await bcrypt.hash(password, 10);
      fields.push('password = ?');
      values.push(hash);
    }

    if (fields.length > 0) {
      fields.push('updated_at = CURRENT_TIMESTAMP');
      values.push(req.params.id);
      db.prepare(`UPDATE users SET ${fields.join(', ')} WHERE id = ?`).run(...values);
    }

    const updated = db.prepare('SELECT id, full_name, email, role, avatar, is_active FROM users WHERE id = ?').get(req.params.id);
    res.json({ user: updated });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Delete user
router.delete('/users/:id', (req, res) => {
  try {
    if (parseInt(req.params.id) === req.user.id) return res.status(400).json({ error: 'Cannot delete yourself' });
    const db = getDb();
    const user = db.prepare('SELECT id FROM users WHERE id = ?').get(req.params.id);
    if (!user) return res.status(404).json({ error: 'User not found' });
    db.prepare('DELETE FROM users WHERE id = ?').run(req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get all activity
router.get('/activity', (req, res) => {
  try {
    const db = getDb();
    const activity = db.prepare(`
      SELECT al.*, u.full_name, u.avatar
      FROM activity_log al JOIN users u ON al.user_id = u.id
      ORDER BY al.created_at DESC LIMIT 50
    `).all();
    res.json({ activity });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Reports
router.get('/reports', (req, res) => {
  try {
    const db = getDb();
    const tasksByStatus = db.prepare('SELECT status, COUNT(*) as count FROM tasks GROUP BY status').all();
    const tasksByPriority = db.prepare('SELECT priority, COUNT(*) as count FROM tasks GROUP BY priority').all();
    const timeByUser = db.prepare(`
      SELECT u.full_name, COALESCE(SUM(tl.duration_seconds), 0) as seconds
      FROM users u LEFT JOIN time_logs tl ON tl.user_id = u.id AND tl.end_time IS NOT NULL
      GROUP BY u.id ORDER BY seconds DESC
    `).all();
    const projectProgress = db.prepare(`
      SELECT p.name, p.color,
        COUNT(t.id) as total,
        COUNT(CASE WHEN t.status = 'done' THEN 1 END) as done
      FROM projects p LEFT JOIN tasks t ON t.project_id = p.id
      WHERE p.status = 'active' GROUP BY p.id
    `).all();

    res.json({ tasksByStatus, tasksByPriority, timeByUser, projectProgress });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Notification stats + paginated list
router.get('/notifications', (req, res) => {
  try {
    const db = getDb();
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(100, parseInt(req.query.limit) || 30);
    const offset = (page - 1) * limit;

    const conditions = [];
    const params = [];
    if (req.query.type) { conditions.push('n.type = ?'); params.push(req.query.type); }
    if (req.query.user_id) { conditions.push('n.user_id = ?'); params.push(req.query.user_id); }
    if (req.query.is_read === '0') { conditions.push('n.is_read = 0'); }
    else if (req.query.is_read === '1') { conditions.push('n.is_read = 1'); }

    const where = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';

    const total = db.prepare(`SELECT COUNT(*) as c FROM notifications n ${where}`).get(...params).c;
    const notifications = db.prepare(`
      SELECT n.*, u.full_name, u.email, u.avatar FROM notifications n
      JOIN users u ON n.user_id = u.id
      ${where} ORDER BY n.created_at DESC LIMIT ? OFFSET ?
    `).all(...params, limit, offset);

    const stats = {
      total: db.prepare('SELECT COUNT(*) as c FROM notifications').get().c,
      unread: db.prepare('SELECT COUNT(*) as c FROM notifications WHERE is_read = 0').get().c,
      by_type: db.prepare('SELECT type, COUNT(*) as count FROM notifications GROUP BY type').all(),
      by_user: db.prepare(`
        SELECT u.id, u.full_name, u.avatar, COUNT(n.id) as count
        FROM notifications n JOIN users u ON n.user_id = u.id
        GROUP BY n.user_id ORDER BY count DESC LIMIT 10
      `).all(),
    };

    res.json({ notifications, stats, total, page, limit });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Broadcast notification to all or specific users
router.post('/notifications/broadcast', async (req, res) => {
  try {
    const { title, message, type = 'broadcast', user_ids, send_email = false } = req.body;
    if (!title || !message) return res.status(400).json({ error: 'title and message required' });

    const db = getDb();
    const io = req.app.get('io');

    let targets;
    if (!user_ids || user_ids === 'all') {
      targets = db.prepare('SELECT id, full_name, email FROM users WHERE is_active = 1').all();
    } else {
      const ids = Array.isArray(user_ids) ? user_ids : [user_ids];
      targets = ids.map(id => db.prepare('SELECT id, full_name, email FROM users WHERE id = ?').get(id)).filter(Boolean);
    }

    let sent = 0;
    for (const u of targets) {
      db.prepare('INSERT INTO notifications (user_id, type, title, message) VALUES (?, ?, ?, ?)').run(u.id, type, title, message);
      if (io) io.to(`user:${u.id}`).emit('notification:new', { type, title, message });
      if (send_email) sendBroadcastNotification(u.email, u.full_name, title, message).catch(() => {});
      sent++;
    }

    res.json({ success: true, sent });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Delete a single notification
router.delete('/notifications/:id', (req, res) => {
  try {
    const db = getDb();
    db.prepare('DELETE FROM notifications WHERE id = ?').run(req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Clear all read notifications (or all)
router.delete('/notifications', (req, res) => {
  try {
    const db = getDb();
    if (req.query.all === '1') {
      db.prepare('DELETE FROM notifications').run();
    } else {
      db.prepare('DELETE FROM notifications WHERE is_read = 1').run();
    }
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get app settings
router.get('/settings', (req, res) => {
  try {
    const db = getDb();
    const rows = db.prepare('SELECT key, value FROM app_settings').all();
    const settings = {};
    rows.forEach(r => { settings[r.key] = r.value; });
    res.json({ settings });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Save app settings
router.put('/settings', (req, res) => {
  const allowed = ['smtp_host','smtp_port','smtp_secure','smtp_user','smtp_pass',
                   'smtp_from_name','smtp_from_email','app_name','app_url','otp_enabled'];
  try {
    const db = getDb();
    allowed.forEach(key => {
      if (key in req.body) {
        const val = req.body[key] == null ? '' : String(req.body[key]);
        db.prepare('INSERT OR REPLACE INTO app_settings (key, value, updated_at) VALUES (?, ?, datetime("now"))').run(key, val);
      }
    });
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Test SMTP
router.post('/settings/test-email', async (req, res) => {
  try {
    const { sendEmailOrThrow, emailTemplate } = require('../services/emailService');
    const recipient = (req.body.to || '').trim() || req.user.email;
    const html = emailTemplate('SMTP Test', '<h2>✅ SMTP is working!</h2><p>Your email settings are configured correctly.</p>');
    await sendEmailOrThrow(recipient, '✅ SMTP Test — ProjectFlow', html);
    res.json({ success: true, message: `Test email sent to ${recipient}` });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
