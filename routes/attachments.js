const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { getDb } = require('../config/database');
const { authenticate } = require('../middleware/auth');

const router = express.Router();
router.use(authenticate);

const storage = multer.diskStorage({
  destination(req, file, cb) {
    const dir = path.join(__dirname, '..', 'public', 'uploads', String(req.params.taskId));
    fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename(req, file, cb) {
    const safe = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
    cb(null, `${Date.now()}_${safe}`);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB
  fileFilter(req, file, cb) {
    const blocked = ['.exe', '.sh', '.bat', '.cmd', '.ps1'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (blocked.includes(ext)) return cb(new Error('File type not allowed'));
    cb(null, true);
  }
});

// Get attachments for a task
router.get('/:taskId', (req, res) => {
  try {
    const db = getDb();
    const attachments = db.prepare(`
      SELECT ta.*, u.full_name FROM task_attachments ta
      JOIN users u ON ta.user_id = u.id
      WHERE ta.task_id = ? ORDER BY ta.created_at DESC
    `).all(req.params.taskId);
    res.json({ attachments });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Upload attachment
router.post('/:taskId', (req, res) => {
  upload.single('file')(req, res, (err) => {
    if (err) return res.status(400).json({ error: err.message });
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

    try {
      const db = getDb();
      const result = db.prepare(
        'INSERT INTO task_attachments (task_id, user_id, filename, original_name, mime_type, size_bytes) VALUES (?, ?, ?, ?, ?, ?)'
      ).run(req.params.taskId, req.user.id, req.file.filename, req.file.originalname, req.file.mimetype, req.file.size);

      const attachment = db.prepare(`
        SELECT ta.*, u.full_name FROM task_attachments ta
        JOIN users u ON ta.user_id = u.id WHERE ta.id = ?
      `).get(result.lastInsertRowid);
      res.status(201).json({ attachment });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });
});

// Delete attachment
router.delete('/:id', (req, res) => {
  try {
    const db = getDb();
    const att = db.prepare('SELECT * FROM task_attachments WHERE id = ?').get(req.params.id);
    if (!att) return res.status(404).json({ error: 'Not found' });
    if (att.user_id !== req.user.id && req.user.role !== 'admin') return res.status(403).json({ error: 'Forbidden' });

    const filePath = path.join(__dirname, '..', 'public', 'uploads', String(att.task_id), att.filename);
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);

    db.prepare('DELETE FROM task_attachments WHERE id = ?').run(req.params.id);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
