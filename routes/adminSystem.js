const express = require('express');
const fs = require('fs');
const path = require('path');
const os = require('os');
const multer = require('multer');
const { getDb } = require('../config/database');
const { authenticate, requireAdmin } = require('../middleware/auth');

const router = express.Router();
router.use(authenticate, requireAdmin);

// System health
router.get('/health', (req, res) => {
  try {
    const db = getDb();
    const mem = process.memoryUsage();
    const DB_PATH = path.resolve(process.env.DB_PATH || './database.sqlite');
    let dbSize = 0;
    try { dbSize = fs.statSync(DB_PATH).size; } catch {}
    function getDirSize(dir) {
      let sz = 0;
      if (!fs.existsSync(dir)) return sz;
      try {
        for (const f of fs.readdirSync(dir)) {
          const fp = path.join(dir, f);
          try { const s = fs.statSync(fp); sz += s.isDirectory() ? getDirSize(fp) : s.size; } catch {}
        }
      } catch {}
      return sz;
    }
    const uploadsSize = getDirSize(path.join(__dirname, '..', 'public', 'uploads'));
    const tables = ['users','projects','tasks','time_logs','notifications','activity_log','task_comments','task_attachments','email_logs','login_history','announcements','webhooks','invites'];
    const tableCounts = {};
    tables.forEach(t => { try { tableCounts[t] = db.prepare(`SELECT COUNT(*) as c FROM ${t}`).get().c; } catch (e) { tableCounts[t] = 0; } });
    res.json({
      uptime_seconds: Math.floor(process.uptime()),
      node_version: process.version,
      platform: process.platform,
      memory: { used_mb: Math.round(mem.heapUsed / 1024 / 1024), total_mb: Math.round(mem.heapTotal / 1024 / 1024), rss_mb: Math.round(mem.rss / 1024 / 1024) },
      os_memory: { free_mb: Math.round(os.freemem() / 1024 / 1024), total_mb: Math.round(os.totalmem() / 1024 / 1024) },
      database: { size_bytes: dbSize },
      uploads: { size_bytes: uploadsSize },
      table_counts: tableCounts,
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Download DB backup
router.get('/backup', (req, res) => {
  try {
    const DB_PATH = path.resolve(process.env.DB_PATH || './database.sqlite');
    if (!fs.existsSync(DB_PATH)) return res.status(404).json({ error: 'DB not found' });
    const filename = `projectflow-backup-${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.sqlite`;
    res.download(DB_PATH, filename);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Email logs
router.get('/email-logs', (req, res) => {
  try {
    const db = getDb();
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(100, parseInt(req.query.limit) || 30);
    const offset = (page - 1) * limit;
    const where = req.query.status ? 'WHERE status=?' : '';
    const params = req.query.status ? [req.query.status] : [];
    const total = db.prepare(`SELECT COUNT(*) as c FROM email_logs ${where}`).get(...params).c;
    const logs = db.prepare(`SELECT * FROM email_logs ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`).all(...params, limit, offset);
    const stats = {
      total: db.prepare('SELECT COUNT(*) as c FROM email_logs').get().c,
      sent: db.prepare("SELECT COUNT(*) as c FROM email_logs WHERE status='sent'").get().c,
      failed: db.prepare("SELECT COUNT(*) as c FROM email_logs WHERE status='failed'").get().c,
    };
    res.json({ logs, stats, total, page, limit });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Login history
router.get('/login-history', (req, res) => {
  try {
    const db = getDb();
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(100, parseInt(req.query.limit) || 30);
    const offset = (page - 1) * limit;
    const conds = []; const params = [];
    if (req.query.user_id) { conds.push('lh.user_id=?'); params.push(req.query.user_id); }
    if (req.query.success !== undefined && req.query.success !== '') { conds.push('lh.success=?'); params.push(parseInt(req.query.success)); }
    const where = conds.length ? 'WHERE ' + conds.join(' AND ') : '';
    const total = db.prepare(`SELECT COUNT(*) as c FROM login_history lh ${where}`).get(...params).c;
    const history = db.prepare(`
      SELECT lh.*, u.full_name FROM login_history lh
      LEFT JOIN users u ON lh.user_id=u.id
      ${where} ORDER BY lh.created_at DESC LIMIT ? OFFSET ?
    `).all(...params, limit, offset);
    const stats = {
      total: db.prepare('SELECT COUNT(*) as c FROM login_history').get().c,
      success: db.prepare('SELECT COUNT(*) as c FROM login_history WHERE success=1').get().c,
      failed: db.prepare('SELECT COUNT(*) as c FROM login_history WHERE success=0').get().c,
      today: db.prepare("SELECT COUNT(*) as c FROM login_history WHERE date(created_at)=date('now')").get().c,
    };
    res.json({ history, stats, total, page, limit });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete('/login-history', (req, res) => {
  try {
    const days = parseInt(req.query.days) || 30;
    getDb().prepare(`DELETE FROM login_history WHERE created_at < datetime('now','-${days} days')`).run();
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// All time logs
router.get('/time-logs', (req, res) => {
  try {
    const db = getDb();
    const conds = []; const params = [];
    if (req.query.user_id) { conds.push('tl.user_id=?'); params.push(req.query.user_id); }
    if (req.query.project_id) { conds.push('tk.project_id=?'); params.push(req.query.project_id); }
    if (req.query.from) { conds.push('date(tl.start_time)>=?'); params.push(req.query.from); }
    if (req.query.to) { conds.push('date(tl.start_time)<=?'); params.push(req.query.to); }
    const where = conds.length ? 'WHERE ' + conds.join(' AND ') : '';
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(100, parseInt(req.query.limit) || 30);
    const offset = (page - 1) * limit;
    const total = db.prepare(`SELECT COUNT(*) as c FROM time_logs tl JOIN tasks tk ON tl.task_id=tk.id ${where}`).get(...params).c;
    const logs = db.prepare(`
      SELECT tl.*, u.full_name as user_name, tk.title as task_title, p.name as project_name, p.id as proj_id
      FROM time_logs tl
      JOIN users u ON tl.user_id=u.id JOIN tasks tk ON tl.task_id=tk.id JOIN projects p ON tk.project_id=p.id
      ${where} ORDER BY tl.start_time DESC LIMIT ? OFFSET ?
    `).all(...params, limit, offset);
    const stats = {
      total_seconds: db.prepare('SELECT COALESCE(SUM(duration_seconds),0) as s FROM time_logs WHERE end_time IS NOT NULL').get().s,
      by_user: db.prepare(`SELECT u.full_name, COALESCE(SUM(tl.duration_seconds),0) as seconds FROM time_logs tl JOIN users u ON tl.user_id=u.id WHERE tl.end_time IS NOT NULL GROUP BY tl.user_id ORDER BY seconds DESC LIMIT 10`).all(),
    };
    res.json({ logs, stats, total, page, limit });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete('/time-logs/:id', (req, res) => {
  try {
    getDb().prepare('DELETE FROM time_logs WHERE id=?').run(req.params.id);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// All attachments
router.get('/attachments', (req, res) => {
  try {
    const db = getDb();
    const atts = db.prepare(`
      SELECT a.*, u.full_name as uploader_name, tk.title as task_title, p.name as project_name
      FROM task_attachments a JOIN users u ON a.user_id=u.id JOIN tasks tk ON a.task_id=tk.id JOIN projects p ON tk.project_id=p.id
      ORDER BY a.created_at DESC
    `).all();
    const total_bytes = atts.reduce((s, a) => s + (a.size_bytes || 0), 0);
    res.json({ attachments: atts, total_bytes });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete('/attachments/:id', (req, res) => {
  try {
    const db = getDb();
    const att = db.prepare('SELECT * FROM task_attachments WHERE id=?').get(req.params.id);
    if (!att) return res.status(404).json({ error: 'Not found' });
    try {
      require('fs').unlinkSync(require('path').join(__dirname, '..', 'public', 'uploads', String(att.task_id), att.filename));
    } catch {}
    db.prepare('DELETE FROM task_attachments WHERE id=?').run(req.params.id);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Restore database from uploaded backup
const restoreUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 100 * 1024 * 1024 } });
router.post('/restore', restoreUpload.single('file'), (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    const DB_PATH = path.resolve(process.env.DB_PATH || './database.sqlite');
    fs.writeFileSync(DB_PATH, req.file.buffer);
    res.json({ success: true, message: 'Database restored. Server will restart.' });
    setTimeout(() => process.exit(0), 500);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
