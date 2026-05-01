const initSqlJs = require('sql.js');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const DB_PATH = path.resolve(process.env.DB_PATH || './database.sqlite');

let _db = null;        // sql.js Database instance
let _wrapper = null;   // cached wrapper (avoids re-creating closures per request)
let _saveTimeout = null;

// ─── Disk persistence ────────────────────────────────────────────────────────
function scheduleSave() {
  if (_saveTimeout) clearTimeout(_saveTimeout);
  _saveTimeout = setTimeout(() => {
    if (_db) {
      const data = _db.export();
      fs.writeFileSync(DB_PATH, Buffer.from(data));
    }
  }, 300);
}

// ─── Compatibility wrapper (matches better-sqlite3 API used in routes) ────────
function makeWrapper(db) {
  function resolveParams(params) {
    // Accept (val1, val2, …) or ([val1, val2]) – normalise to flat array
    if (params.length === 1 && Array.isArray(params[0])) return params[0];
    return params;
  }

  return {
    pragma(str) {
      try { db.run(`PRAGMA ${str}`); } catch {}
    },

    // exec() is used for DDL/multi-statement blocks — use db.exec() not db.run()
    exec(sql) {
      db.exec(sql);
      scheduleSave();
    },

    prepare(sql) {
      return {
        /** Return first matching row as a plain object, or undefined */
        get(...args) {
          const p = resolveParams(args);
          const stmt = db.prepare(sql);
          // sql.js bind() takes a plain array for positional ? params
          if (p.length) stmt.bind(p);
          let row = undefined;
          if (stmt.step()) row = stmt.getAsObject();
          stmt.free();
          return row;
        },
        /** Return all matching rows as plain objects */
        all(...args) {
          const p = resolveParams(args);
          const rows = [];
          const stmt = db.prepare(sql);
          if (p.length) stmt.bind(p);
          while (stmt.step()) rows.push(stmt.getAsObject());
          stmt.free();
          return rows;
        },
        /** Execute an INSERT/UPDATE/DELETE, returns {lastInsertRowid} */
        run(...args) {
          const p = resolveParams(args);
          db.run(sql, p.length ? p : undefined);
          // Get last inserted rowid via a separate statement
          const stmt = db.prepare('SELECT last_insert_rowid() as id');
          stmt.step();
          const { id } = stmt.getAsObject();
          stmt.free();
          scheduleSave();
          return { lastInsertRowid: id };
        },
      };
    },
  };
}

// ─── Public API ───────────────────────────────────────────────────────────────
function getDb() {
  if (!_db) throw new Error('DB not initialised. Call initDb() first.');
  if (!_wrapper) _wrapper = makeWrapper(_db);
  return _wrapper;
}

async function initDb() {
  const SQL = await initSqlJs();

  if (fs.existsSync(DB_PATH)) {
    const buf = fs.readFileSync(DB_PATH);
    _db = new SQL.Database(buf);
  } else {
    _db = new SQL.Database();
  }
  _wrapper = null; // reset cached wrapper on re-init

  const db = makeWrapper(_db);

  db.pragma('foreign_keys = ON');

  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      full_name TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'staff' CHECK(role IN ('admin', 'staff')),
      avatar TEXT,
      is_active INTEGER DEFAULT 1,
      cookie_consent INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT (datetime('now')),
      updated_at DATETIME DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS projects (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      description TEXT,
      color TEXT DEFAULT '#6C5CE7',
      owner_id INTEGER NOT NULL,
      status TEXT DEFAULT 'active' CHECK(status IN ('active', 'archived')),
      created_at DATETIME DEFAULT (datetime('now')),
      updated_at DATETIME DEFAULT (datetime('now')),
      FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS project_members (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      UNIQUE(project_id, user_id),
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS tasks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id INTEGER NOT NULL,
      title TEXT NOT NULL,
      description TEXT,
      status TEXT NOT NULL DEFAULT 'todo' CHECK(status IN ('todo','in_progress','review','done','blocked')),
      priority TEXT DEFAULT 'medium' CHECK(priority IN ('low','medium','high','urgent')),
      assigned_to INTEGER,
      created_by INTEGER NOT NULL,
      due_date TEXT,
      created_at DATETIME DEFAULT (datetime('now')),
      updated_at DATETIME DEFAULT (datetime('now')),
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
      FOREIGN KEY (assigned_to) REFERENCES users(id) ON DELETE SET NULL,
      FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS time_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      task_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      start_time DATETIME NOT NULL,
      end_time DATETIME,
      duration_seconds INTEGER DEFAULT 0,
      note TEXT,
      created_at DATETIME DEFAULT (datetime('now')),
      FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS task_comments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      task_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      content TEXT NOT NULL,
      created_at DATETIME DEFAULT (datetime('now')),
      FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS notifications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      type TEXT NOT NULL,
      title TEXT NOT NULL,
      message TEXT NOT NULL,
      link TEXT,
      is_read INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS activity_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      action TEXT NOT NULL,
      entity_type TEXT NOT NULL,
      entity_id INTEGER NOT NULL,
      details TEXT,
      created_at DATETIME DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_tasks_project  ON tasks(project_id);
    CREATE INDEX IF NOT EXISTS idx_tasks_assigned ON tasks(assigned_to);
    CREATE INDEX IF NOT EXISTS idx_tasks_status   ON tasks(status);
    CREATE INDEX IF NOT EXISTS idx_timelogs_user  ON time_logs(user_id);
    CREATE INDEX IF NOT EXISTS idx_timelogs_task  ON time_logs(task_id);
    CREATE INDEX IF NOT EXISTS idx_notifs_user    ON notifications(user_id, is_read);
    CREATE INDEX IF NOT EXISTS idx_activity_time  ON activity_log(created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_proj_members   ON project_members(user_id);
  `);

  // ── New feature tables ────────────────────────────────────────────────────
  db.exec(`
    CREATE TABLE IF NOT EXISTS task_labels (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id INTEGER,
      name TEXT NOT NULL,
      color TEXT DEFAULT '#6C5CE7',
      created_by INTEGER NOT NULL,
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
      FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS task_label_map (
      task_id INTEGER NOT NULL,
      label_id INTEGER NOT NULL,
      PRIMARY KEY (task_id, label_id),
      FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE,
      FOREIGN KEY (label_id) REFERENCES task_labels(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS subtasks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      task_id INTEGER NOT NULL,
      title TEXT NOT NULL,
      is_done INTEGER DEFAULT 0,
      position INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT (datetime('now')),
      FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS task_watchers (
      task_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      PRIMARY KEY (task_id, user_id),
      FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS task_dependencies (
      task_id INTEGER NOT NULL,
      depends_on INTEGER NOT NULL,
      PRIMARY KEY (task_id, depends_on),
      FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE,
      FOREIGN KEY (depends_on) REFERENCES tasks(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS task_attachments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      task_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      filename TEXT NOT NULL,
      original_name TEXT NOT NULL,
      mime_type TEXT,
      size_bytes INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT (datetime('now')),
      FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS task_templates (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      description TEXT,
      priority TEXT DEFAULT 'medium',
      project_id INTEGER,
      created_by INTEGER NOT NULL,
      created_at DATETIME DEFAULT (datetime('now')),
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
      FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS custom_statuses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      color TEXT DEFAULT '#6C5CE7',
      base_status TEXT DEFAULT 'todo',
      position INTEGER DEFAULT 0,
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_subtasks_task     ON subtasks(task_id);
    CREATE INDEX IF NOT EXISTS idx_deps_task         ON task_dependencies(task_id);
    CREATE INDEX IF NOT EXISTS idx_attachments_task  ON task_attachments(task_id);
    CREATE INDEX IF NOT EXISTS idx_labelmap_task     ON task_label_map(task_id);
    CREATE INDEX IF NOT EXISTS idx_watchers_task     ON task_watchers(task_id);
  `);

  // ── Column migrations (safe: sql.js throws on duplicate, we swallow it) ──
  [
    'ALTER TABLE tasks ADD COLUMN recurrence TEXT',
    'ALTER TABLE tasks ADD COLUMN recurrence_end TEXT',
    'ALTER TABLE tasks ADD COLUMN estimated_minutes INTEGER',
    'ALTER TABLE tasks ADD COLUMN custom_status_id INTEGER',
    'ALTER TABLE tasks ADD COLUMN position INTEGER DEFAULT 0',
    'ALTER TABLE users ADD COLUMN theme TEXT DEFAULT "dark"',
    'ALTER TABLE projects ADD COLUMN archived_at DATETIME',
    'ALTER TABLE task_comments ADD COLUMN edited_at DATETIME',
    'ALTER TABLE task_comments ADD COLUMN is_pinned INTEGER DEFAULT 0',
  ].forEach(sql => { try { db.exec(sql); } catch {} });

  db.exec(`
    CREATE TABLE IF NOT EXISTS comment_reactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      comment_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      emoji TEXT NOT NULL,
      created_at DATETIME DEFAULT (datetime('now')),
      UNIQUE(comment_id, user_id, emoji),
      FOREIGN KEY (comment_id) REFERENCES task_comments(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_reactions_comment ON comment_reactions(comment_id);
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS app_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL DEFAULT '',
      updated_at DATETIME DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS login_otps (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      code_hash TEXT NOT NULL,
      expires_at DATETIME NOT NULL,
      used INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_otps_user ON login_otps(user_id, used, expires_at);
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS email_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      to_email TEXT NOT NULL,
      subject TEXT NOT NULL,
      status TEXT DEFAULT 'sent',
      error TEXT,
      created_at DATETIME DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS invites (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT,
      role TEXT DEFAULT 'staff',
      token TEXT UNIQUE NOT NULL,
      created_by INTEGER NOT NULL,
      used INTEGER DEFAULT 0,
      used_by INTEGER,
      expires_at DATETIME NOT NULL,
      created_at DATETIME DEFAULT (datetime('now')),
      FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (used_by) REFERENCES users(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS login_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER,
      email TEXT,
      ip TEXT,
      user_agent TEXT,
      success INTEGER DEFAULT 1,
      fail_reason TEXT,
      created_at DATETIME DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS announcements (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      message TEXT NOT NULL,
      type TEXT DEFAULT 'info',
      expires_at DATETIME,
      created_by INTEGER NOT NULL,
      is_active INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT (datetime('now')),
      FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS webhooks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      url TEXT NOT NULL,
      events TEXT NOT NULL DEFAULT '[]',
      secret TEXT,
      is_active INTEGER DEFAULT 1,
      created_by INTEGER NOT NULL,
      created_at DATETIME DEFAULT (datetime('now')),
      FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS webhook_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      webhook_id INTEGER NOT NULL,
      event TEXT NOT NULL,
      payload TEXT,
      response_status INTEGER,
      error TEXT,
      created_at DATETIME DEFAULT (datetime('now')),
      FOREIGN KEY (webhook_id) REFERENCES webhooks(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_email_logs_date ON email_logs(created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_login_history_user ON login_history(user_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_invites_token ON invites(token);
    CREATE INDEX IF NOT EXISTS idx_announcements_active ON announcements(is_active);
    CREATE INDEX IF NOT EXISTS idx_webhook_logs ON webhook_logs(webhook_id, created_at DESC);
  `);

  // ── Multiple assignees + Chat ─────────────────────────────────────────────
  db.exec(`
    CREATE TABLE IF NOT EXISTS task_assignees (
      task_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      PRIMARY KEY (task_id, user_id),
      FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS channels (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT,
      type TEXT NOT NULL DEFAULT 'group' CHECK(type IN ('direct','group')),
      created_by INTEGER NOT NULL,
      created_at DATETIME DEFAULT (datetime('now')),
      FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS channel_members (
      channel_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      last_read_at DATETIME,
      PRIMARY KEY (channel_id, user_id),
      FOREIGN KEY (channel_id) REFERENCES channels(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      channel_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      content TEXT NOT NULL,
      edited_at DATETIME,
      created_at DATETIME DEFAULT (datetime('now')),
      FOREIGN KEY (channel_id) REFERENCES channels(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_task_assignees ON task_assignees(task_id);
    CREATE INDEX IF NOT EXISTS idx_messages_channel ON messages(channel_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_ch_members ON channel_members(user_id);
  `);

  // Force-save tables to disk
  scheduleSave();

  // Seed default admin if no users
  const existing = db.prepare('SELECT COUNT(*) as count FROM users').get();
  if (!existing || existing.count === 0) {
    const bcrypt = require('bcryptjs');
    const hash = bcrypt.hashSync('admin123', 10);
    db.prepare(
      'INSERT INTO users (full_name, email, password, role) VALUES (?, ?, ?, ?)'
    ).run('Admin User', 'admin@projectflow.com', hash, 'admin');
    scheduleSave();
    console.log('✅ Default admin: admin@projectflow.com / admin123');
  }

  console.log('✅ Database ready');
}

module.exports = { getDb, initDb };
