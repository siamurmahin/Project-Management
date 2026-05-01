const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const path = require('path');
const crypto = require('crypto');
const rateLimit = require('express-rate-limit');
require('dotenv').config();

// Ensure JWT_SECRET is always defined; warn if missing from env
if (!process.env.JWT_SECRET) {
  process.env.JWT_SECRET = crypto.randomBytes(32).toString('hex');
  console.warn('⚠️  JWT_SECRET not set in .env — generated a random secret. Sessions will be lost on restart. Set JWT_SECRET for production.');
}

const { initDb, getDb } = require('./config/database');
const { authenticate } = require('./middleware/auth');
const authRoutes = require('./routes/auth');
const projectRoutes = require('./routes/projects');
const taskRoutes = require('./routes/tasks');
const adminRoutes = require('./routes/admin');
const timeLogRoutes = require('./routes/timeLogs');
const notifRoutes = require('./routes/notifications');
const searchRoutes = require('./routes/search');
const labelRoutes = require('./routes/labels');
const subtaskRoutes = require('./routes/subtasks');
const watcherRoutes = require('./routes/watchers');
const dependencyRoutes = require('./routes/dependencies');
const attachmentRoutes = require('./routes/attachments');
const templateRoutes = require('./routes/templates');
const statusRoutes = require('./routes/statuses');
const reportRoutes = require('./routes/reports');
const userRoutes = require('./routes/users');
const adminProjectsRoutes = require('./routes/adminProjects');
const adminTasksRoutes = require('./routes/adminTasks');
const adminSystemRoutes = require('./routes/adminSystem');
const adminContentRoutes = require('./routes/adminContent');
const adminImportRoutes = require('./routes/adminImport');
const chatRoutes = require('./routes/chat');
const setupSocket = require('./socket/handlers');

const app = express();
const server = http.createServer(app);

const allowedOrigin = process.env.ALLOWED_ORIGIN || 'http://localhost:3000';

const io = socketIo(server, {
  cors: { origin: allowedOrigin, methods: ['GET', 'POST'] }
});

// Rate limiting
const limiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 200 });
app.use('/api/', limiter);

// Stricter rate limit on auth endpoints
const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 20, message: { error: 'Too many attempts, try again later' } });
app.use('/api/auth/login', authLimiter);
app.use('/api/auth/register', authLimiter);

// Middleware
app.use(cors({ origin: allowedOrigin }));
app.use(express.json({ limit: '5mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// Initialize DB
initDb();

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/projects', projectRoutes);
app.use('/api/tasks', taskRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/time-logs', timeLogRoutes);
app.use('/api/notifications', notifRoutes);
app.use('/api/search', searchRoutes);
app.use('/api/labels', labelRoutes);
app.use('/api/subtasks', subtaskRoutes);
app.use('/api/watchers', watcherRoutes);
app.use('/api/dependencies', dependencyRoutes);
app.use('/api/attachments', attachmentRoutes);
app.use('/api/templates', templateRoutes);
app.use('/api/statuses', statusRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/users', userRoutes);
app.use('/api/admin/projects', adminProjectsRoutes);
app.use('/api/admin/tasks', adminTasksRoutes);
app.use('/api/admin/system', adminSystemRoutes);
app.use('/api/admin/content', adminContentRoutes);
app.use('/api/admin/import', adminImportRoutes);
app.use('/api/chat', chatRoutes);

// Active announcements (public authenticated)
app.get('/api/announcements/active', authenticate, (req, res) => {
  try {
    const db = getDb();
    const announcements = db.prepare(`
      SELECT * FROM announcements
      WHERE is_active=1 AND (expires_at IS NULL OR expires_at > datetime('now'))
      ORDER BY created_at DESC
    `).all();
    res.json({ announcements });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// 404 for unmatched /api/* routes — must return JSON, not the SPA HTML
app.use('/api', (req, res) => {
  res.status(404).json({ error: `API route not found: ${req.method} ${req.path}` });
});

// Serve SPA for all other routes
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Global error handler — always JSON (must be last, after SPA route)
app.use((err, req, res, next) => {
  console.error(err.stack || err.message || err);
  const status = err.status || err.statusCode || 500;
  res.status(status).json({ error: err.message || 'Internal server error' });
});

// Socket setup
setupSocket(io);

// Attach io to app for use in routes
app.set('io', io);

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`\n🚀 ProjectFlow running at http://localhost:${PORT}\n`);
});
