const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { body, validationResult } = require('express-validator');
const { getDb } = require('../config/database');
const { authenticate } = require('../middleware/auth');
const { sendLoginOtp } = require('../services/emailService');

const router = express.Router();

function getClientIp(req) {
  return (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.ip || (req.connection && req.connection.remoteAddress) || '';
}

router.post('/register', [
  body('full_name').trim().isLength({ min: 2 }).withMessage('Name must be at least 2 characters'),
  body('email').isEmail().normalizeEmail().withMessage('Valid email required'),
  body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters')
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

  const { full_name, email, password, invite_token } = req.body;
  const db = getDb();

  try {
    const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
    if (existing) return res.status(409).json({ error: 'Email already in use' });

    // Handle invite token
    let role = 'staff';
    let invite = null;
    if (invite_token) {
      invite = db.prepare("SELECT * FROM invites WHERE token = ? AND used = 0 AND expires_at > datetime('now')").get(invite_token);
      if (!invite) return res.status(400).json({ error: 'Invalid or expired invite link' });
      role = invite.role || 'staff';
    }

    const hash = await bcrypt.hash(password, 10);
    const result = db.prepare(
      'INSERT INTO users (full_name, email, password, role) VALUES (?, ?, ?, ?)'
    ).run(full_name, email, hash, role);

    // Mark invite as used
    if (invite) {
      try {
        db.prepare('UPDATE invites SET used = 1, used_by = ? WHERE token = ?').run(result.lastInsertRowid, invite_token);
      } catch {}
    }

    const user = db.prepare('SELECT id, full_name, email, role, avatar FROM users WHERE id = ?').get(result.lastInsertRowid);
    const token = jwt.sign({ id: user.id }, process.env.JWT_SECRET, { expiresIn: process.env.JWT_EXPIRES_IN || '7d' });

    res.status(201).json({ token, user });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/login', [
  body('email').isEmail().normalizeEmail(),
  body('password').notEmpty()
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

  const { email, password } = req.body;
  const db = getDb();
  const ip = getClientIp(req);
  const ua = req.headers['user-agent'] || '';

  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
  if (!user || !user.is_active) {
    try {
      db.prepare('INSERT INTO login_history (user_id, email, ip, user_agent, success, fail_reason) VALUES (?, ?, ?, ?, 0, ?)').run(
        user ? user.id : null, email, ip, ua, !user ? 'User not found' : 'Account inactive'
      );
    } catch {}
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  const valid = await bcrypt.compare(password, user.password);
  if (!valid) {
    try {
      db.prepare('INSERT INTO login_history (user_id, email, ip, user_agent, success, fail_reason) VALUES (?, ?, ?, ?, 0, ?)').run(
        user.id, email, ip, ua, 'Wrong password'
      );
    } catch {}
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  // Check if OTP is enabled
  const otpSetting = db.prepare("SELECT value FROM app_settings WHERE key = 'otp_enabled'").get();
  const otpEnabled = otpSetting?.value === '1';

  if (otpEnabled) {
    const code = String(Math.floor(100000 + Math.random() * 900000));
    const codeHash = crypto.createHash('sha256').update(code).digest('hex');
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();
    // Invalidate previous unused OTPs for this user
    db.prepare('UPDATE login_otps SET used = 1 WHERE user_id = ? AND used = 0').run(user.id);
    db.prepare('INSERT INTO login_otps (user_id, code_hash, expires_at) VALUES (?, ?, ?)').run(user.id, codeHash, expiresAt);
    sendLoginOtp(user.email, user.full_name, code).catch(() => {});
    return res.json({ otp_required: true, email: user.email });
  }

  // Log successful login
  try {
    db.prepare('INSERT INTO login_history (user_id, email, ip, user_agent, success) VALUES (?, ?, ?, ?, 1)').run(
      user.id, email, ip, ua
    );
  } catch {}

  const token = jwt.sign({ id: user.id }, process.env.JWT_SECRET, { expiresIn: process.env.JWT_EXPIRES_IN || '7d' });
  const { password: _, ...safeUser } = user;
  res.json({ token, user: safeUser });
});

router.post('/verify-otp', [
  body('email').isEmail().normalizeEmail(),
  body('code').isLength({ min: 6, max: 6 }).isNumeric()
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ error: 'Invalid code format' });

  const { email, code } = req.body;
  const db = getDb();
  const ip = getClientIp(req);
  const ua = req.headers['user-agent'] || '';

  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
  if (!user || !user.is_active) return res.status(401).json({ error: 'Invalid request' });

  const codeHash = crypto.createHash('sha256').update(code).digest('hex');
  const otp = db.prepare(
    "SELECT * FROM login_otps WHERE user_id = ? AND code_hash = ? AND used = 0 AND expires_at > datetime('now') ORDER BY id DESC LIMIT 1"
  ).get(user.id, codeHash);

  if (!otp) return res.status(401).json({ error: 'Invalid or expired code' });

  db.prepare('UPDATE login_otps SET used = 1 WHERE id = ?').run(otp.id);

  // Log successful OTP login
  try {
    db.prepare('INSERT INTO login_history (user_id, email, ip, user_agent, success) VALUES (?, ?, ?, ?, 1)').run(
      user.id, email, ip, ua
    );
  } catch {}

  const token = jwt.sign({ id: user.id }, process.env.JWT_SECRET, { expiresIn: process.env.JWT_EXPIRES_IN || '7d' });
  const { password: _, ...safeUser } = user;
  res.json({ token, user: safeUser });
});

router.get('/me', authenticate, (req, res) => {
  res.json({ user: req.user });
});

router.put('/profile', authenticate, [
  body('full_name').optional().trim().isLength({ min: 2 }),
  body('password').optional().isLength({ min: 6 })
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

  const { full_name, password, avatar, theme } = req.body;
  const db = getDb();

  try {
    if (full_name) db.prepare('UPDATE users SET full_name = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(full_name, req.user.id);
    if (password) {
      const hash = await bcrypt.hash(password, 10);
      db.prepare('UPDATE users SET password = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(hash, req.user.id);
    }
    if (avatar !== undefined) db.prepare('UPDATE users SET avatar = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(avatar, req.user.id);
    if (theme) db.prepare('UPDATE users SET theme = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(theme, req.user.id);

    const updated = db.prepare('SELECT id, full_name, email, role, avatar, theme FROM users WHERE id = ?').get(req.user.id);
    res.json({ user: updated });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/cookie-consent', authenticate, (req, res) => {
  const db = getDb();
  db.prepare('UPDATE users SET cookie_consent = 1 WHERE id = ?').run(req.user.id);
  res.json({ success: true });
});

// Look up an invite token
router.get('/invite/:token', (req, res) => {
  try {
    const db = getDb();
    const invite = db.prepare("SELECT id, email, role, expires_at FROM invites WHERE token = ? AND used = 0 AND expires_at > datetime('now')").get(req.params.token);
    if (!invite) return res.status(404).json({ valid: false, error: 'Invalid or expired invite' });
    res.json({ valid: true, email: invite.email, role: invite.role, expires_at: invite.expires_at });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
