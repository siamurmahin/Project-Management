const express = require('express');
const { getDb } = require('../config/database');
const { authenticate } = require('../middleware/auth');

const router = express.Router();
router.use(authenticate);

// List channels the user belongs to
router.get('/channels', (req, res) => {
  try {
    const db = getDb();
    const channels = db.prepare(`
      SELECT c.*, cm.last_read_at,
        (SELECT COUNT(*) FROM messages m WHERE m.channel_id=c.id
           AND m.created_at > COALESCE(cm.last_read_at, '1970-01-01')) as unread_count,
        (SELECT m.content FROM messages m WHERE m.channel_id=c.id ORDER BY m.created_at DESC LIMIT 1) as last_message,
        (SELECT m.created_at FROM messages m WHERE m.channel_id=c.id ORDER BY m.created_at DESC LIMIT 1) as last_message_at
      FROM channels c
      JOIN channel_members cm ON c.id=cm.channel_id
      WHERE cm.user_id=?
      ORDER BY COALESCE(last_message_at, c.created_at) DESC
    `).all(req.user.id);

    // Attach member info for each channel
    channels.forEach(ch => {
      ch.members = db.prepare(`
        SELECT u.id, u.full_name, u.avatar FROM channel_members cm
        JOIN users u ON cm.user_id=u.id WHERE cm.channel_id=?
      `).all(ch.id);
    });

    res.json({ channels });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Create or open DM
router.post('/channels/dm', (req, res) => {
  try {
    const { user_id } = req.body;
    if (!user_id || user_id === req.user.id) return res.status(400).json({ error: 'Invalid user' });
    const db = getDb();

    // Check if DM already exists between these two users
    const existing = db.prepare(`
      SELECT c.id FROM channels c
      JOIN channel_members cm1 ON c.id=cm1.channel_id AND cm1.user_id=?
      JOIN channel_members cm2 ON c.id=cm2.channel_id AND cm2.user_id=?
      WHERE c.type='direct'
      LIMIT 1
    `).get(req.user.id, user_id);

    if (existing) {
      const ch = db.prepare('SELECT * FROM channels WHERE id=?').get(existing.id);
      ch.members = db.prepare(`SELECT u.id, u.full_name, u.avatar FROM channel_members cm JOIN users u ON cm.user_id=u.id WHERE cm.channel_id=?`).all(ch.id);
      return res.json({ channel: ch });
    }

    const other = db.prepare('SELECT id, full_name FROM users WHERE id=?').get(user_id);
    if (!other) return res.status(404).json({ error: 'User not found' });

    const { lastInsertRowid } = db.prepare('INSERT INTO channels (name, type, created_by) VALUES (?,?,?)').run(null, 'direct', req.user.id);
    db.prepare('INSERT INTO channel_members (channel_id, user_id) VALUES (?,?)').run(lastInsertRowid, req.user.id);
    db.prepare('INSERT INTO channel_members (channel_id, user_id) VALUES (?,?)').run(lastInsertRowid, user_id);

    const ch = db.prepare('SELECT * FROM channels WHERE id=?').get(lastInsertRowid);
    ch.members = db.prepare(`SELECT u.id, u.full_name, u.avatar FROM channel_members cm JOIN users u ON cm.user_id=u.id WHERE cm.channel_id=?`).all(ch.id);
    res.status(201).json({ channel: ch });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Create group channel
router.post('/channels/group', (req, res) => {
  try {
    const { name, member_ids = [] } = req.body;
    if (!name?.trim()) return res.status(400).json({ error: 'Channel name required' });
    const db = getDb();

    const { lastInsertRowid } = db.prepare('INSERT INTO channels (name, type, created_by) VALUES (?,?,?)').run(name.trim(), 'group', req.user.id);
    const allMembers = [req.user.id, ...member_ids.filter(id => id !== req.user.id)];
    allMembers.forEach(uid => {
      try { db.prepare('INSERT OR IGNORE INTO channel_members (channel_id, user_id) VALUES (?,?)').run(lastInsertRowid, uid); } catch {}
    });

    const ch = db.prepare('SELECT * FROM channels WHERE id=?').get(lastInsertRowid);
    ch.members = db.prepare(`SELECT u.id, u.full_name, u.avatar FROM channel_members cm JOIN users u ON cm.user_id=u.id WHERE cm.channel_id=?`).all(ch.id);
    res.status(201).json({ channel: ch });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Add member to group
router.post('/channels/:id/members', (req, res) => {
  try {
    const { user_id } = req.body;
    const db = getDb();
    const ch = db.prepare('SELECT * FROM channels WHERE id=?').get(req.params.id);
    if (!ch) return res.status(404).json({ error: 'Channel not found' });
    if (ch.type === 'direct') return res.status(400).json({ error: 'Cannot add to DM' });
    db.prepare('INSERT OR IGNORE INTO channel_members (channel_id, user_id) VALUES (?,?)').run(req.params.id, user_id);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Get messages
router.get('/channels/:id/messages', (req, res) => {
  try {
    const db = getDb();
    const member = db.prepare('SELECT 1 FROM channel_members WHERE channel_id=? AND user_id=?').get(req.params.id, req.user.id);
    if (!member) return res.status(403).json({ error: 'Not a member' });

    const limit = Math.min(100, parseInt(req.query.limit) || 50);
    const before = req.query.before; // cursor pagination
    const where = before ? 'AND m.created_at < ?' : '';
    const params = before ? [req.params.id, before, limit] : [req.params.id, limit];

    const messages = db.prepare(`
      SELECT m.*, u.full_name, u.avatar FROM messages m
      JOIN users u ON m.user_id=u.id
      WHERE m.channel_id=? ${where}
      ORDER BY m.created_at DESC LIMIT ?
    `).all(...params).reverse();

    // Mark as read
    db.prepare('UPDATE channel_members SET last_read_at=datetime(\'now\') WHERE channel_id=? AND user_id=?').run(req.params.id, req.user.id);

    res.json({ messages });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Send message
router.post('/channels/:id/messages', (req, res) => {
  try {
    const { content } = req.body;
    if (!content?.trim()) return res.status(400).json({ error: 'Content required' });
    const db = getDb();
    const member = db.prepare('SELECT 1 FROM channel_members WHERE channel_id=? AND user_id=?').get(req.params.id, req.user.id);
    if (!member) return res.status(403).json({ error: 'Not a member' });

    const { lastInsertRowid } = db.prepare('INSERT INTO messages (channel_id, user_id, content) VALUES (?,?,?)').run(req.params.id, req.user.id, content.trim());
    db.prepare('UPDATE channel_members SET last_read_at=datetime(\'now\') WHERE channel_id=? AND user_id=?').run(req.params.id, req.user.id);

    const message = db.prepare(`SELECT m.*, u.full_name, u.avatar FROM messages m JOIN users u ON m.user_id=u.id WHERE m.id=?`).get(lastInsertRowid);

    const io = req.app.get('io');

    // Emit to channel room
    if (io) io.to(`channel:${req.params.id}`).emit('message:new', { message, channel_id: parseInt(req.params.id) });

    // Notify @mentioned users
    const channelMembers = db.prepare('SELECT u.id, u.full_name FROM channel_members cm JOIN users u ON cm.user_id=u.id WHERE cm.channel_id=? AND cm.user_id!=?').all(req.params.id, req.user.id);
    const sorted = channelMembers.sort((a, b) => b.full_name.length - a.full_name.length);
    const notified = new Set();
    for (const u of sorted) {
      const esc = u.full_name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      if (new RegExp(`@${esc}(?=\\s|$|[,!?.])`, 'i').test(content.trim())) {
        if (!notified.has(u.id)) {
          notified.add(u.id);
          db.prepare('INSERT INTO notifications (user_id, type, title, message, link) VALUES (?,?,?,?,?)').run(
            u.id, 'mention', 'You were mentioned in a message',
            `${req.user.full_name}: ${content.slice(0, 100)}`,
            null
          );
          if (io) io.to(`user:${u.id}`).emit('notification:new');
        }
      }
    }

    // For DM channels: also notify the other member of a new message (if not mentioned)
    const ch = db.prepare('SELECT type FROM channels WHERE id=?').get(req.params.id);
    if (ch?.type === 'direct') {
      const other = channelMembers.find(u => !notified.has(u.id));
      if (other) {
        db.prepare('INSERT INTO notifications (user_id, type, title, message, link) VALUES (?,?,?,?,?)').run(
          other.id, 'message', `New message from ${req.user.full_name}`,
          content.slice(0, 120),
          null
        );
        if (io) io.to(`user:${other.id}`).emit('notification:new');
      }
    }

    res.status(201).json({ message });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Edit message
router.put('/channels/:id/messages/:msgId', (req, res) => {
  try {
    const { content } = req.body;
    if (!content?.trim()) return res.status(400).json({ error: 'Content required' });
    const db = getDb();
    const msg = db.prepare('SELECT * FROM messages WHERE id=? AND channel_id=?').get(req.params.msgId, req.params.id);
    if (!msg) return res.status(404).json({ error: 'Not found' });
    if (msg.user_id !== req.user.id) return res.status(403).json({ error: 'Not yours' });
    db.prepare('UPDATE messages SET content=?, edited_at=datetime(\'now\') WHERE id=?').run(content.trim(), req.params.msgId);
    const message = db.prepare(`SELECT m.*, u.full_name, u.avatar FROM messages m JOIN users u ON m.user_id=u.id WHERE m.id=?`).get(req.params.msgId);
    const io = req.app.get('io');
    if (io) io.to(`channel:${req.params.id}`).emit('message:edited', { message, channel_id: parseInt(req.params.id) });
    res.json({ message });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Delete message
router.delete('/channels/:id/messages/:msgId', (req, res) => {
  try {
    const db = getDb();
    const msg = db.prepare('SELECT * FROM messages WHERE id=? AND channel_id=?').get(req.params.msgId, req.params.id);
    if (!msg) return res.status(404).json({ error: 'Not found' });
    const isAdmin = req.user.role === 'admin';
    if (msg.user_id !== req.user.id && !isAdmin) return res.status(403).json({ error: 'Not authorized' });
    db.prepare('DELETE FROM messages WHERE id=?').run(req.params.msgId);
    const io = req.app.get('io');
    if (io) io.to(`channel:${req.params.id}`).emit('message:deleted', { message_id: parseInt(req.params.msgId), channel_id: parseInt(req.params.id) });
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
