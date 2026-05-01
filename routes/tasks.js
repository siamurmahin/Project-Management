const express = require('express');
const { body, validationResult } = require('express-validator');
const { getDb } = require('../config/database');
const { authenticate } = require('../middleware/auth');
const { sendTaskAssigned, sendStatusChanged } = require('../services/emailService');

const router = express.Router();
router.use(authenticate);

function getTaskWithDetails(db, taskId) {
  return db.prepare(`
    SELECT t.*,
      u1.full_name as assigned_name, u1.email as assigned_email, u1.avatar as assigned_avatar,
      u2.full_name as creator_name,
      p.name as project_name
    FROM tasks t
    LEFT JOIN users u1 ON t.assigned_to = u1.id
    LEFT JOIN users u2 ON t.created_by = u2.id
    LEFT JOIN projects p ON t.project_id = p.id
    WHERE t.id = ?
  `).get(taskId);
}

function isProjectMember(db, projectId, userId) {
  return !!db.prepare('SELECT id FROM project_members WHERE project_id = ? AND user_id = ?').get(projectId, userId);
}

function attachAssigneesToTasks(db, tasks) {
  if (!tasks.length) return tasks;
  const ids = tasks.map(t => parseInt(t.id, 10)).filter(n => Number.isInteger(n));
  if (!ids.length) return tasks.map(t => ({ ...t, assignees: [] }));
  const placeholders = ids.map(() => '?').join(',');
  const rows = db.prepare(`
    SELECT ta.task_id, u.id, u.full_name, u.avatar
    FROM task_assignees ta JOIN users u ON ta.user_id=u.id
    WHERE ta.task_id IN (${placeholders})
  `).all(...ids);
  const map = {};
  tasks.forEach(t => { map[t.id] = []; });
  rows.forEach(r => { if (map[r.task_id]) map[r.task_id].push({ id: r.id, full_name: r.full_name, avatar: r.avatar }); });
  return tasks.map(t => ({ ...t, assignees: map[t.id] }));
}

// Get tasks for project — member or admin only
router.get('/project/:projectId', (req, res) => {
  try {
    const db = getDb();
    if (req.user.role !== 'admin' && !isProjectMember(db, req.params.projectId, req.user.id)) {
      return res.status(403).json({ error: 'Access denied' });
    }
    let tasks = db.prepare(`
      SELECT t.*,
        u1.full_name as assigned_name, u1.avatar as assigned_avatar,
        u2.full_name as creator_name,
        COALESCE((SELECT SUM(duration_seconds) FROM time_logs WHERE task_id = t.id), 0) as total_seconds
      FROM tasks t
      LEFT JOIN users u1 ON t.assigned_to = u1.id
      LEFT JOIN users u2 ON t.created_by = u2.id
      WHERE t.project_id = ?
      ORDER BY t.created_at DESC
    `).all(req.params.projectId);
    tasks = attachAssigneesToTasks(db, tasks);
    res.json({ tasks });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get my tasks (assigned via task_assignees or legacy assigned_to)
router.get('/mine', (req, res) => {
  try {
    const db = getDb();
    let tasks = db.prepare(`
      SELECT DISTINCT t.*,
        u.full_name as assigned_name, u.avatar as assigned_avatar,
        p.name as project_name, p.color as project_color,
        COALESCE((SELECT SUM(duration_seconds) FROM time_logs WHERE task_id = t.id), 0) as total_seconds
      FROM tasks t
      LEFT JOIN users u ON t.assigned_to = u.id
      LEFT JOIN projects p ON t.project_id = p.id
      LEFT JOIN task_assignees ta ON ta.task_id = t.id
      WHERE t.assigned_to = ? OR ta.user_id = ?
      ORDER BY t.updated_at DESC
    `).all(req.user.id, req.user.id);
    tasks = attachAssigneesToTasks(db, tasks);
    res.json({ tasks });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get single task — project member or admin only
router.get('/:id', (req, res) => {
  try {
    const db = getDb();
    const task = getTaskWithDetails(db, req.params.id);
    if (!task) return res.status(404).json({ error: 'Task not found' });

    if (req.user.role !== 'admin' &&
        task.assigned_to !== req.user.id &&
        task.created_by !== req.user.id &&
        !isProjectMember(db, task.project_id, req.user.id)) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const comments = db.prepare(`
      SELECT tc.*, u.full_name, u.avatar FROM task_comments tc
      JOIN users u ON tc.user_id = u.id
      WHERE tc.task_id = ? ORDER BY tc.is_pinned DESC, tc.created_at ASC
    `).all(req.params.id);

    // Attach reactions to each comment
    comments.forEach(c => {
      c.reactions = db.prepare(`
        SELECT emoji, COUNT(*) as count,
          MAX(CASE WHEN user_id = ? THEN 1 ELSE 0 END) as reacted
        FROM comment_reactions WHERE comment_id = ? GROUP BY emoji
      `).all(req.user.id, c.id);
    });

    const timeLogs = db.prepare(`
      SELECT tl.*, u.full_name FROM time_logs tl
      JOIN users u ON tl.user_id = u.id
      WHERE tl.task_id = ? ORDER BY tl.start_time DESC
    `).all(req.params.id);

    const activity = db.prepare(`
      SELECT al.*, u.full_name, u.avatar FROM activity_log al
      JOIN users u ON al.user_id = u.id
      WHERE al.entity_type = 'task' AND al.entity_id = ?
      ORDER BY al.created_at ASC
    `).all(req.params.id);

    const assignees = db.prepare(`
      SELECT u.id, u.full_name, u.avatar FROM task_assignees ta
      JOIN users u ON ta.user_id=u.id WHERE ta.task_id=?
    `).all(req.params.id);

    res.json({ task, comments, timeLogs, activity, assignees });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Create task
router.post('/', [
  body('title').trim().isLength({ min: 1 }).withMessage('Title required'),
  body('project_id').isInt().withMessage('Valid project_id required')
], (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

  try {
    const { title, description, project_id, priority, assigned_to, assignee_ids, due_date, status } = req.body;
    const db = getDb();

    if (req.user.role !== 'admin' && !isProjectMember(db, project_id, req.user.id)) {
      return res.status(403).json({ error: 'You are not a member of this project' });
    }

    // Resolve primary assignee: first from assignee_ids, else assigned_to
    const primaryAssignee = (assignee_ids && assignee_ids.length) ? assignee_ids[0] : (assigned_to || null);

    const result = db.prepare(`
      INSERT INTO tasks (title, description, project_id, priority, assigned_to, due_date, status, created_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(title, description || null, project_id, priority || 'medium', primaryAssignee, due_date || null, status || 'todo', req.user.id);

    const taskId = result.lastInsertRowid;

    // Insert all assignees into junction table
    const allAssigneeIds = assignee_ids && assignee_ids.length ? assignee_ids : (assigned_to ? [assigned_to] : []);
    allAssigneeIds.forEach(uid => {
      try { db.prepare('INSERT OR IGNORE INTO task_assignees (task_id, user_id) VALUES (?,?)').run(taskId, uid); } catch {}
    });

    const task = getTaskWithDetails(db, taskId);

    if (primaryAssignee && primaryAssignee !== req.user.id) {
      const assignee = db.prepare('SELECT * FROM users WHERE id = ?').get(primaryAssignee);
      if (assignee) {
        sendTaskAssigned(assignee.email, assignee.full_name, title, task.project_name, req.user.full_name, task.id).catch(() => {});
      }
      pushNotification(req, primaryAssignee, 'task_assigned', 'New task assigned to you',
        `${req.user.full_name} assigned "${title}" to you in ${task.project_name}`,
        JSON.stringify({ task_id: task.id, project_id: task.project_id }));
    }

    db.prepare('INSERT INTO activity_log (user_id, action, entity_type, entity_id, details) VALUES (?, ?, ?, ?, ?)').run(
      req.user.id, 'created', 'task', task.id, JSON.stringify({ title })
    );

    res.status(201).json({ task });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Update task — project member, assignee, creator, or admin
router.put('/:id', (req, res) => {
  try {
    const { title, description, priority, due_date, assigned_to, assignee_ids } = req.body;
    const db = getDb();
    const oldTask = db.prepare('SELECT * FROM tasks WHERE id = ?').get(req.params.id);
    if (!oldTask) return res.status(404).json({ error: 'Task not found' });

    const canEdit = req.user.role === 'admin' ||
      oldTask.assigned_to === req.user.id ||
      oldTask.created_by === req.user.id ||
      isProjectMember(db, oldTask.project_id, req.user.id);

    if (!canEdit) return res.status(403).json({ error: 'Not authorized to update this task' });

    // Resolve primary assignee
    let primaryAssignee = oldTask.assigned_to;
    if (assignee_ids !== undefined) {
      primaryAssignee = (assignee_ids && assignee_ids.length) ? assignee_ids[0] : null;
    } else if (assigned_to !== undefined) {
      primaryAssignee = assigned_to || null;
    }

    db.prepare(`
      UPDATE tasks SET
        title = COALESCE(?, title),
        description = COALESCE(?, description),
        priority = COALESCE(?, priority),
        due_date = COALESCE(?, due_date),
        assigned_to = ?,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(title || null, description || null, priority || null, due_date || null,
      primaryAssignee, req.params.id);

    // Update junction table if assignee_ids provided
    if (assignee_ids !== undefined) {
      db.prepare('DELETE FROM task_assignees WHERE task_id=?').run(req.params.id);
      (assignee_ids || []).forEach(uid => {
        try { db.prepare('INSERT OR IGNORE INTO task_assignees (task_id, user_id) VALUES (?,?)').run(req.params.id, uid); } catch {}
      });
    } else if (assigned_to !== undefined) {
      // Legacy single-assignee update: sync junction table
      db.prepare('DELETE FROM task_assignees WHERE task_id=?').run(req.params.id);
      if (assigned_to) {
        try { db.prepare('INSERT OR IGNORE INTO task_assignees (task_id, user_id) VALUES (?,?)').run(req.params.id, assigned_to); } catch {}
      }
    }

    const task = getTaskWithDetails(db, req.params.id);

    if (primaryAssignee && primaryAssignee !== oldTask.assigned_to && primaryAssignee !== req.user.id) {
      const assignee = db.prepare('SELECT * FROM users WHERE id = ?').get(primaryAssignee);
      if (assignee) {
        sendTaskAssigned(assignee.email, assignee.full_name, task.title, task.project_name, req.user.full_name, task.id).catch(() => {});
      }
      pushNotification(req, primaryAssignee, 'task_assigned', 'Task assigned to you',
        `${req.user.full_name} assigned "${task.title}" to you`,
        JSON.stringify({ task_id: task.id, project_id: task.project_id }));
    }

    db.prepare('INSERT INTO activity_log (user_id, action, entity_type, entity_id, details) VALUES (?, ?, ?, ?, ?)').run(
      req.user.id, 'updated', 'task', task.id, JSON.stringify({ title: task.title })
    );

    res.json({ task });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Update status
router.patch('/:id/status', (req, res) => {
  try {
    const { status } = req.body;
    const validStatuses = ['todo', 'in_progress', 'review', 'done', 'blocked'];
    if (!validStatuses.includes(status)) return res.status(400).json({ error: 'Invalid status' });

    const db = getDb();
    const oldTask = db.prepare('SELECT * FROM tasks WHERE id = ?').get(req.params.id);
    if (!oldTask) return res.status(404).json({ error: 'Task not found' });

    if (req.user.role !== 'admin' &&
        oldTask.assigned_to !== req.user.id &&
        oldTask.created_by !== req.user.id &&
        !isProjectMember(db, oldTask.project_id, req.user.id)) {
      return res.status(403).json({ error: 'Not authorized' });
    }

    const oldStatus = oldTask.status;
    db.prepare('UPDATE tasks SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(status, req.params.id);

    const task = getTaskWithDetails(db, req.params.id);

    if (task.assigned_to && task.assigned_to !== req.user.id) {
      const assignee = db.prepare('SELECT * FROM users WHERE id = ?').get(task.assigned_to);
      if (assignee) {
        sendStatusChanged(assignee.email, assignee.full_name, task.title, oldStatus, status, req.user.full_name).catch(() => {});
      }
      pushNotification(req, task.assigned_to, 'status_changed', 'Task status updated',
        `"${task.title}" moved to ${status.replace('_', ' ')} by ${req.user.full_name}`,
        JSON.stringify({ task_id: task.id, project_id: task.project_id }));
    }

    db.prepare('INSERT INTO activity_log (user_id, action, entity_type, entity_id, details) VALUES (?, ?, ?, ?, ?)').run(
      req.user.id, 'status_changed', 'task', task.id, JSON.stringify({ from: oldStatus, to: status })
    );

    // Spawn next recurrence when task is completed
    if (status === 'done' && task.recurrence && oldStatus !== 'done') {
      try {
        const rec = JSON.parse(task.recurrence);
        if (rec && rec.type && task.due_date) {
          let nextDate = new Date(task.due_date);
          if (rec.type === 'daily') nextDate.setDate(nextDate.getDate() + 1);
          else if (rec.type === 'weekly') nextDate.setDate(nextDate.getDate() + 7);
          else if (rec.type === 'monthly') nextDate.setMonth(nextDate.getMonth() + 1);

          const endDate = task.recurrence_end ? new Date(task.recurrence_end) : null;
          if (!endDate || nextDate <= endDate) {
            const nextDue = nextDate.toISOString().split('T')[0];
            db.prepare(`
              INSERT INTO tasks (project_id, title, description, priority, assigned_to, due_date, status, created_by, recurrence, recurrence_end, estimated_minutes)
              VALUES (?, ?, ?, ?, ?, ?, 'todo', ?, ?, ?, ?)
            `).run(task.project_id, task.title, task.description, task.priority, task.assigned_to, nextDue, task.created_by, task.recurrence, task.recurrence_end, task.estimated_minutes);
          }
        }
      } catch {} // Malformed recurrence JSON — skip silently
    }

    res.json({ task });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

function pushNotification(req, userId, type, title, message, link = null) {
  const db = getDb();
  const result = db.prepare('INSERT INTO notifications (user_id, type, title, message, link) VALUES (?, ?, ?, ?, ?)').run(userId, type, title, message, link);
  const io = req.app.get('io');
  if (io) io.to(`user:${userId}`).emit('notification:new', { id: result.lastInsertRowid, type, title, message, link });
}

// Add comment — assignee, creator, project member, or admin
router.post('/:id/comments', (req, res) => {
  try {
    const { content } = req.body;
    if (!content || !content.trim()) return res.status(400).json({ error: 'Content required' });

    const db = getDb();
    const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(req.params.id);
    if (!task) return res.status(404).json({ error: 'Task not found' });

    if (req.user.role !== 'admin' &&
        task.assigned_to !== req.user.id &&
        task.created_by !== req.user.id &&
        !isProjectMember(db, task.project_id, req.user.id)) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const result = db.prepare('INSERT INTO task_comments (task_id, user_id, content) VALUES (?, ?, ?)').run(req.params.id, req.user.id, content.trim());
    const comment = db.prepare('SELECT tc.*, u.full_name, u.avatar FROM task_comments tc JOIN users u ON tc.user_id = u.id WHERE tc.id = ?').get(result.lastInsertRowid);

    // Parse @mentions — match full names (longest first to avoid partial matches)
    const allUsers = db.prepare('SELECT id, full_name FROM users WHERE id != ?').all(req.user.id)
      .sort((a, b) => b.full_name.length - a.full_name.length);
    const notified = new Set();
    for (const u of allUsers) {
      const esc = u.full_name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      if (new RegExp(`@${esc}(?=\\s|$|[,!?.])`, 'i').test(content.trim())) {
        if (!notified.has(u.id)) {
          notified.add(u.id);
          const mentionLink = JSON.stringify({ task_id: task.id, project_id: task.project_id });
          const result = db.prepare('INSERT INTO notifications (user_id, type, title, message, link) VALUES (?,?,?,?,?)').run(
            u.id, 'mention', `${req.user.full_name} mentioned you`,
            `In "${task.title}": ${content.slice(0, 100)}`,
            mentionLink
          );
          const io = req.app.get('io');
          if (io) io.to(`user:${u.id}`).emit('notification:new', {
            id: result.lastInsertRowid, type: 'mention',
            title: `${req.user.full_name} mentioned you`,
            message: `In "${task.title}": ${content.slice(0, 100)}`,
            link: mentionLink
          });
        }
      }
    }

    // Notify watchers
    db.prepare('SELECT user_id FROM task_watchers WHERE task_id = ? AND user_id != ?').all(req.params.id, req.user.id).forEach(w => {
      pushNotification(req, w.user_id, 'comment', 'New comment on watched task',
        `${req.user.full_name} commented on "${task.title}"`,
        JSON.stringify({ task_id: task.id, project_id: task.project_id }));
    });

    // Real-time broadcast to task room
    const io = req.app.get('io');
    if (io) io.to(`task:${req.params.id}`).emit('comment:new', { comment });

    res.status(201).json({ comment });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Edit comment — own comment or admin
router.put('/:id/comments/:commentId', (req, res) => {
  try {
    const { content } = req.body;
    if (!content || !content.trim()) return res.status(400).json({ error: 'Content required' });
    const db = getDb();
    const comment = db.prepare('SELECT * FROM task_comments WHERE id = ?').get(req.params.commentId);
    if (!comment || comment.task_id !== Number(req.params.id)) return res.status(404).json({ error: 'Comment not found' });
    if (req.user.role !== 'admin' && comment.user_id !== req.user.id) return res.status(403).json({ error: 'Cannot edit this comment' });
    db.prepare('UPDATE task_comments SET content = ?, edited_at = datetime("now") WHERE id = ?').run(content.trim(), req.params.commentId);
    const updated = db.prepare('SELECT tc.*, u.full_name, u.avatar FROM task_comments tc JOIN users u ON tc.user_id = u.id WHERE tc.id = ?').get(req.params.commentId);
    res.json({ comment: updated });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Delete comment — own comment or admin
router.delete('/:id/comments/:commentId', (req, res) => {
  try {
    const db = getDb();
    const comment = db.prepare('SELECT * FROM task_comments WHERE id = ?').get(req.params.commentId);
    if (!comment || comment.task_id !== Number(req.params.id)) return res.status(404).json({ error: 'Comment not found' });
    if (req.user.role !== 'admin' && comment.user_id !== req.user.id) return res.status(403).json({ error: 'Cannot delete this comment' });
    db.prepare('DELETE FROM task_comments WHERE id = ?').run(req.params.commentId);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Toggle reaction on a comment
router.post('/:id/comments/:commentId/reactions', (req, res) => {
  try {
    const { emoji } = req.body;
    const allowed = ['👍','❤️','🎉','😂','🚀','👀','😮','🙌'];
    if (!allowed.includes(emoji)) return res.status(400).json({ error: 'Invalid emoji' });
    const db = getDb();
    const existing = db.prepare('SELECT id FROM comment_reactions WHERE comment_id=? AND user_id=? AND emoji=?').get(req.params.commentId, req.user.id, emoji);
    if (existing) {
      db.prepare('DELETE FROM comment_reactions WHERE id=?').run(existing.id);
    } else {
      db.prepare('INSERT INTO comment_reactions (comment_id, user_id, emoji) VALUES (?,?,?)').run(req.params.commentId, req.user.id, emoji);
    }
    const reactions = db.prepare(`
      SELECT emoji, COUNT(*) as count, MAX(CASE WHEN user_id=? THEN 1 ELSE 0 END) as reacted
      FROM comment_reactions WHERE comment_id=? GROUP BY emoji
    `).all(req.user.id, req.params.commentId);
    const io = req.app.get('io');
    if (io) io.to(`task:${req.params.id}`).emit('reactions:update', { commentId: req.params.commentId, reactions });
    res.json({ reactions });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Toggle pin on a comment (admin or task creator)
router.patch('/:id/comments/:commentId/pin', (req, res) => {
  try {
    const db = getDb();
    const task = db.prepare('SELECT * FROM tasks WHERE id=?').get(req.params.id);
    if (!task) return res.status(404).json({ error: 'Task not found' });
    if (req.user.role !== 'admin' && task.created_by !== req.user.id)
      return res.status(403).json({ error: 'Only admins and task creators can pin' });
    const comment = db.prepare('SELECT * FROM task_comments WHERE id=?').get(req.params.commentId);
    if (!comment) return res.status(404).json({ error: 'Comment not found' });
    const newPin = comment.is_pinned ? 0 : 1;
    db.prepare('UPDATE task_comments SET is_pinned=? WHERE id=?').run(newPin, req.params.commentId);
    res.json({ is_pinned: newPin });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Delete task — creator or admin only
router.delete('/:id', (req, res) => {
  try {
    const db = getDb();
    const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(req.params.id);
    if (!task) return res.status(404).json({ error: 'Task not found' });

    if (req.user.role !== 'admin' && task.created_by !== req.user.id) {
      return res.status(403).json({ error: 'Only the task creator or an admin can delete this task' });
    }

    db.prepare('DELETE FROM tasks WHERE id = ?').run(req.params.id);

    db.prepare('INSERT INTO activity_log (user_id, action, entity_type, entity_id, details) VALUES (?, ?, ?, ?, ?)').run(
      req.user.id, 'deleted', 'task', req.params.id, JSON.stringify({ title: task.title })
    );

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
