const express = require('express');
const crypto = require('crypto');
const { getDb } = require('../config/database');
const { authenticate, requireAdmin } = require('../middleware/auth');
const { sendEmail, emailTemplate } = require('../services/emailService');
const { deliverWebhook } = require('../services/webhookService');

const router = express.Router();
router.use(authenticate, requireAdmin);

// ─── Announcements ────────────────────────────────────────────────────────────

router.get('/announcements', (req, res) => {
  try {
    const db = getDb();
    const announcements = db.prepare(`
      SELECT a.*, u.full_name as creator_name
      FROM announcements a JOIN users u ON a.created_by=u.id
      ORDER BY a.created_at DESC
    `).all();
    res.json({ announcements });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/announcements', (req, res) => {
  try {
    const { title, message, type = 'info', expires_at } = req.body;
    if (!title || !message) return res.status(400).json({ error: 'title and message required' });
    const db = getDb();
    const result = db.prepare(
      'INSERT INTO announcements (title, message, type, expires_at, created_by) VALUES (?, ?, ?, ?, ?)'
    ).run(title, message, type, expires_at || null, req.user.id);
    const ann = db.prepare('SELECT * FROM announcements WHERE id=?').get(result.lastInsertRowid);
    res.status(201).json({ announcement: ann });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.put('/announcements/:id', (req, res) => {
  try {
    const { title, message, type, expires_at, is_active } = req.body;
    const db = getDb();
    const fields = []; const values = [];
    if (title !== undefined) { fields.push('title=?'); values.push(title); }
    if (message !== undefined) { fields.push('message=?'); values.push(message); }
    if (type !== undefined) { fields.push('type=?'); values.push(type); }
    if (expires_at !== undefined) { fields.push('expires_at=?'); values.push(expires_at || null); }
    if (is_active !== undefined) { fields.push('is_active=?'); values.push(is_active ? 1 : 0); }
    if (!fields.length) return res.status(400).json({ error: 'Nothing to update' });
    values.push(req.params.id);
    db.prepare(`UPDATE announcements SET ${fields.join(', ')} WHERE id=?`).run(...values);
    res.json({ announcement: db.prepare('SELECT * FROM announcements WHERE id=?').get(req.params.id) });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete('/announcements/:id', (req, res) => {
  try {
    getDb().prepare('DELETE FROM announcements WHERE id=?').run(req.params.id);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── Labels ───────────────────────────────────────────────────────────────────

router.get('/labels', (req, res) => {
  try {
    const db = getDb();
    const labels = db.prepare(`
      SELECT tl.*, p.name as project_name, u.full_name as creator_name,
        COUNT(tlm.task_id) as usage_count
      FROM task_labels tl
      LEFT JOIN projects p ON tl.project_id=p.id
      LEFT JOIN users u ON tl.created_by=u.id
      LEFT JOIN task_label_map tlm ON tlm.label_id=tl.id
      GROUP BY tl.id ORDER BY tl.id DESC
    `).all();
    res.json({ labels });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete('/labels/:id', (req, res) => {
  try {
    getDb().prepare('DELETE FROM task_labels WHERE id=?').run(req.params.id);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── Templates ────────────────────────────────────────────────────────────────

router.get('/templates', (req, res) => {
  try {
    const db = getDb();
    const templates = db.prepare(`
      SELECT tt.*, p.name as project_name, u.full_name as creator_name
      FROM task_templates tt
      LEFT JOIN projects p ON tt.project_id=p.id
      JOIN users u ON tt.created_by=u.id
      ORDER BY tt.id DESC
    `).all();
    res.json({ templates });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete('/templates/:id', (req, res) => {
  try {
    getDb().prepare('DELETE FROM task_templates WHERE id=?').run(req.params.id);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── Invites ──────────────────────────────────────────────────────────────────

router.get('/invites', (req, res) => {
  try {
    const db = getDb();
    const invites = db.prepare(`
      SELECT i.*, u.full_name as creator_name, ub.full_name as used_by_name
      FROM invites i
      JOIN users u ON i.created_by=u.id
      LEFT JOIN users ub ON i.used_by=ub.id
      ORDER BY i.created_at DESC
    `).all();
    res.json({ invites });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/invites', async (req, res) => {
  try {
    const { email, role = 'staff', expires_in_days = 7, send_email: doSendEmail = false } = req.body;
    const token = crypto.randomBytes(24).toString('hex');
    const expiresAt = new Date(Date.now() + (expires_in_days * 24 * 60 * 60 * 1000)).toISOString();
    const db = getDb();
    const result = db.prepare(
      'INSERT INTO invites (email, role, token, created_by, expires_at) VALUES (?, ?, ?, ?, ?)'
    ).run(email || null, role, token, req.user.id, expiresAt);

    const invite = db.prepare('SELECT * FROM invites WHERE id=?').get(result.lastInsertRowid);

    // Optionally send invite email
    if (doSendEmail && email) {
      try {
        const settings = db.prepare('SELECT key, value FROM app_settings').all();
        const s = {}; settings.forEach(r => { s[r.key] = r.value; });
        const appUrl = s.app_url || process.env.APP_URL || 'http://localhost:3000';
        const appName = s.app_name || process.env.APP_NAME || 'ProjectFlow';
        const inviteUrl = `${appUrl}/?invite=${token}`;
        const html = emailTemplate(
          `You're invited to ${appName}`,
          `<h2>You've been invited!</h2>
          <p>You've been invited to join <strong>${appName}</strong> as a <strong>${role}</strong>.</p>
          <p>This invite expires on ${new Date(expiresAt).toLocaleDateString()}.</p>
          <a href="${inviteUrl}" class="btn">Accept Invite &rarr;</a>
          <p style="font-size:.8rem;color:#888;margin-top:16px;">Or copy this link: ${inviteUrl}</p>`
        );
        await sendEmail(email, `You're invited to ${appName}`, html);
      } catch {}
    }

    res.status(201).json({ invite });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete('/invites/:id', (req, res) => {
  try {
    getDb().prepare('DELETE FROM invites WHERE id=?').run(req.params.id);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── Webhooks ─────────────────────────────────────────────────────────────────

router.get('/webhooks', (req, res) => {
  try {
    const db = getDb();
    const webhooks = db.prepare(`
      SELECT w.*, u.full_name as creator_name,
        COUNT(wl.id) as delivery_count,
        SUM(CASE WHEN wl.response_status >= 200 AND wl.response_status < 300 THEN 1 ELSE 0 END) as success_count
      FROM webhooks w
      JOIN users u ON w.created_by=u.id
      LEFT JOIN webhook_logs wl ON wl.webhook_id=w.id
      GROUP BY w.id ORDER BY w.created_at DESC
    `).all();
    res.json({ webhooks });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/webhooks', (req, res) => {
  try {
    const { name, url, events = [], secret } = req.body;
    if (!name || !url) return res.status(400).json({ error: 'name and url required' });
    const db = getDb();
    const result = db.prepare(
      'INSERT INTO webhooks (name, url, events, secret, created_by) VALUES (?, ?, ?, ?, ?)'
    ).run(name, url, JSON.stringify(Array.isArray(events) ? events : [events]), secret || null, req.user.id);
    const wh = db.prepare('SELECT * FROM webhooks WHERE id=?').get(result.lastInsertRowid);
    res.status(201).json({ webhook: wh });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.put('/webhooks/:id', (req, res) => {
  try {
    const { name, url, events, secret, is_active } = req.body;
    const db = getDb();
    const fields = []; const values = [];
    if (name !== undefined) { fields.push('name=?'); values.push(name); }
    if (url !== undefined) { fields.push('url=?'); values.push(url); }
    if (events !== undefined) { fields.push('events=?'); values.push(JSON.stringify(Array.isArray(events) ? events : [events])); }
    if (secret !== undefined) { fields.push('secret=?'); values.push(secret || null); }
    if (is_active !== undefined) { fields.push('is_active=?'); values.push(is_active ? 1 : 0); }
    if (!fields.length) return res.status(400).json({ error: 'Nothing to update' });
    values.push(req.params.id);
    db.prepare(`UPDATE webhooks SET ${fields.join(', ')} WHERE id=?`).run(...values);
    res.json({ webhook: db.prepare('SELECT * FROM webhooks WHERE id=?').get(req.params.id) });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete('/webhooks/:id', (req, res) => {
  try {
    getDb().prepare('DELETE FROM webhooks WHERE id=?').run(req.params.id);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/webhooks/:id/logs', (req, res) => {
  try {
    const db = getDb();
    const logs = db.prepare('SELECT * FROM webhook_logs WHERE webhook_id=? ORDER BY created_at DESC LIMIT 50').all(req.params.id);
    res.json({ logs });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/webhooks/:id/test', async (req, res) => {
  try {
    const db = getDb();
    const wh = db.prepare('SELECT * FROM webhooks WHERE id=?').get(req.params.id);
    if (!wh) return res.status(404).json({ error: 'Webhook not found' });
    const result = await deliverWebhook(wh, 'test', { message: 'This is a test delivery from ProjectFlow', timestamp: new Date().toISOString() });
    res.json({ success: true, result });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
