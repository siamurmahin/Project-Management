const jwt = require('jsonwebtoken');
const { getDb } = require('../config/database');

function setupSocket(io) {
  // Auth middleware for socket
  io.use((socket, next) => {
    const token = socket.handshake.auth?.token;
    if (!token) return next(new Error('Authentication required'));
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET || 'secret');
      socket.userId = decoded.id;
      next();
    } catch {
      next(new Error('Invalid token'));
    }
  });

  io.on('connection', (socket) => {
    const userId = socket.userId;
    socket.join(`user:${userId}`);
    console.log(`[Socket] User ${userId} connected`);

    // Join project rooms
    socket.on('join:project', (projectId) => {
      socket.join(`project:${projectId}`);
    });

    socket.on('leave:project', (projectId) => {
      socket.leave(`project:${projectId}`);
    });

    // Task updated — broadcast to project room
    socket.on('task:update', ({ projectId, task }) => {
      socket.to(`project:${projectId}`).emit('task:updated', { task });
    });

    // Task detail room — for real-time comments and typing
    socket.on('join:task', (taskId) => {
      socket.join(`task:${taskId}`);
      socket._currentTaskId = taskId;
    });

    socket.on('leave:task', (taskId) => {
      socket.leave(`task:${taskId}`);
      if (socket._currentTaskId === taskId) socket._currentTaskId = null;
    });

    // Typing indicators
    socket.on('typing:start', ({ taskId, name }) => {
      socket.to(`task:${taskId}`).emit('typing:update', { userId, name, typing: true });
    });

    socket.on('typing:stop', ({ taskId }) => {
      socket.to(`task:${taskId}`).emit('typing:update', { userId, typing: false });
    });

    // Chat channel rooms
    socket.on('join:channel', (channelId) => {
      socket.join(`channel:${channelId}`);
    });

    socket.on('leave:channel', (channelId) => {
      socket.leave(`channel:${channelId}`);
    });

    // Typing in channel
    socket.on('channel:typing:start', ({ channelId, name }) => {
      socket.to(`channel:${channelId}`).emit('channel:typing', { userId, name, typing: true });
    });

    socket.on('channel:typing:stop', ({ channelId }) => {
      socket.to(`channel:${channelId}`).emit('channel:typing', { userId, typing: false });
    });

    // Timer broadcast
    socket.on('timer:tick', ({ taskId, seconds }) => {
      socket.to(`user:${userId}`).emit('timer:tick', { taskId, seconds });
    });

    socket.on('disconnect', () => {
      // Clean up typing indicator if user disconnects mid-type
      if (socket._currentTaskId) {
        socket.to(`task:${socket._currentTaskId}`).emit('typing:update', { userId, typing: false });
      }
      console.log(`[Socket] User ${userId} disconnected`);
    });
  });

  return io;
}

module.exports = setupSocket;
