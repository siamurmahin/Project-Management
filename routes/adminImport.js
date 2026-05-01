const express = require('express');
const multer = require('multer');
const bcrypt = require('bcryptjs');
const { getDb } = require('../config/database');
const { authenticate, requireAdmin } = require('../middleware/auth');

const router = express.Router();
router.use(authenticate, requireAdmin);

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

function parseCSV(text) {
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
  if (lines.length < 2) return [];
  const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, '').toLowerCase());
  return lines.slice(1).map(line => {
    const vals = []; let inQ = false, cur = '';
    for (const ch of line + ',') {
      if (ch === '"') inQ = !inQ;
      else if (ch === ',' && !inQ) { vals.push(cur.trim().replace(/^"|"$/g, '')); cur = ''; }
      else cur += ch;
    }
    const row = {};
    headers.forEach((h, i) => { row[h] = vals[i] || ''; });
    return row;
  });
}

// POST /import/users
router.post('/users', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    const text = req.file.buffer.toString('utf-8');
    const rows = parseCSV(text);
    if (!rows.length) return res.status(400).json({ error: 'CSV is empty or has no data rows' });

    const db = getDb();
    let created = 0;
    const skipped = [];
    const errors = [];

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const full_name = (row['full_name'] || row['name'] || '').trim();
      const email = (row['email'] || '').trim().toLowerCase();
      const role = (row['role'] || 'staff').trim();
      const password = (row['password'] || '').trim();

      if (!full_name || !email) {
        errors.push(`Row ${i + 2}: missing name or email`);
        continue;
      }
      if (!['admin', 'staff'].includes(role)) {
        errors.push(`Row ${i + 2}: invalid role "${role}" — must be admin or staff`);
        continue;
      }

      try {
        const existing = db.prepare('SELECT id FROM users WHERE email=?').get(email);
        if (existing) {
          skipped.push(`${email} (already exists)`);
          continue;
        }
        const tempPass = password || Math.random().toString(36).slice(-8) + 'A1!';
        const hash = await bcrypt.hash(tempPass, 10);
        db.prepare('INSERT INTO users (full_name, email, password, role) VALUES (?, ?, ?, ?)').run(full_name, email, hash, role);
        created++;
      } catch (err) {
        errors.push(`Row ${i + 2} (${email}): ${err.message}`);
      }
    }

    res.json({ created, skipped: skipped.length, skipped_list: skipped, errors });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /import/tasks
router.post('/tasks', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    const text = req.file.buffer.toString('utf-8');
    const rows = parseCSV(text);
    if (!rows.length) return res.status(400).json({ error: 'CSV is empty or has no data rows' });

    const db = getDb();
    let created = 0;
    const skipped = [];
    const errors = [];

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const title = (row['title'] || '').trim();
      const project_id = (row['project_id'] || '').trim();
      const description = (row['description'] || '').trim();
      const status = (row['status'] || 'todo').trim();
      const priority = (row['priority'] || 'medium').trim();
      const assigned_to_email = (row['assigned_to_email'] || '').trim();
      const due_date = (row['due_date'] || '').trim();

      if (!title) {
        errors.push(`Row ${i + 2}: missing title`);
        continue;
      }
      if (!project_id) {
        errors.push(`Row ${i + 2}: missing project_id`);
        continue;
      }

      try {
        const project = db.prepare('SELECT id FROM projects WHERE id=?').get(project_id);
        if (!project) {
          skipped.push(`Row ${i + 2}: project ${project_id} not found`);
          continue;
        }

        let assigned_to = null;
        if (assigned_to_email) {
          const assignee = db.prepare('SELECT id FROM users WHERE email=?').get(assigned_to_email.toLowerCase());
          if (assignee) assigned_to = assignee.id;
        }

        const validStatuses = ['todo', 'in_progress', 'review', 'done', 'blocked'];
        const validPriorities = ['low', 'medium', 'high', 'urgent'];
        const finalStatus = validStatuses.includes(status) ? status : 'todo';
        const finalPriority = validPriorities.includes(priority) ? priority : 'medium';

        db.prepare(
          'INSERT INTO tasks (project_id, title, description, status, priority, assigned_to, created_by, due_date) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
        ).run(project_id, title, description || null, finalStatus, finalPriority, assigned_to, req.user.id, due_date || null);
        created++;
      } catch (err) {
        errors.push(`Row ${i + 2} (${title}): ${err.message}`);
      }
    }

    res.json({ created, skipped: skipped.length, skipped_list: skipped, errors });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
