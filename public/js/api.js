const API_BASE = '/api';

class Api {
  constructor() {
    this.token = localStorage.getItem('pf_token');
  }

  setToken(token) {
    this.token = token;
    if (token) localStorage.setItem('pf_token', token);
    else localStorage.removeItem('pf_token');
  }

  async request(method, path, data = null) {
    const headers = { 'Content-Type': 'application/json' };
    if (this.token) headers['Authorization'] = `Bearer ${this.token}`;

    const options = { method, headers };
    if (data) options.body = JSON.stringify(data);

    let res;
    try {
      res = await fetch(`${API_BASE}${path}`, options);
    } catch (networkErr) {
      throw new Error('Network error — server unreachable');
    }

    const contentType = res.headers.get('content-type') || '';
    let json = null;
    if (contentType.includes('application/json')) {
      try { json = await res.json(); } catch { json = null; }
    } else if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`Server error ${res.status}${text ? ': ' + text.slice(0, 120) : ''}`);
    }

    if (!res.ok) {
      const msg = (json && (json.error || json.errors?.[0]?.msg)) || `Request failed (${res.status})`;
      throw new Error(msg);
    }
    return json ?? {};
  }

  get(path) { return this.request('GET', path); }
  post(path, data) { return this.request('POST', path, data); }
  put(path, data) { return this.request('PUT', path, data); }
  patch(path, data) { return this.request('PATCH', path, data); }
  delete(path) { return this.request('DELETE', path); }

  // Auth
  login(email, password) { return this.post('/auth/login', { email, password }); }
  verifyOtp(email, code) { return this.post('/auth/verify-otp', { email, code }); }
  register(data) { return this.post('/auth/register', data); }
  getMe() { return this.get('/auth/me'); }
  updateProfile(data) { return this.put('/auth/profile', data); }
  cookieConsent() { return this.post('/auth/cookie-consent', {}); }

  // Projects
  getProjects() { return this.get('/projects'); }
  createProject(data) { return this.post('/projects', data); }
  getProject(id) { return this.get(`/projects/${id}`); }
  updateProject(id, data) { return this.put(`/projects/${id}`, data); }
  deleteProject(id) { return this.delete(`/projects/${id}`); }
  addMember(projectId, userId) { return this.post(`/projects/${projectId}/members`, { user_id: userId }); }
  removeMember(projectId, userId) { return this.delete(`/projects/${projectId}/members/${userId}`); }

  // Tasks
  getProjectTasks(projectId) { return this.get(`/tasks/project/${projectId}`); }
  getMyTasks() { return this.get('/tasks/mine'); }
  getTask(id) { return this.get(`/tasks/${id}`); }
  createTask(data) { return this.post('/tasks', data); }
  updateTask(id, data) { return this.put(`/tasks/${id}`, data); }
  updateTaskStatus(id, status) { return this.patch(`/tasks/${id}/status`, { status }); }
  addComment(taskId, content) { return this.post(`/tasks/${taskId}/comments`, { content }); }
  editComment(taskId, commentId, content) { return this.put(`/tasks/${taskId}/comments/${commentId}`, { content }); }
  deleteComment(taskId, commentId) { return this.delete(`/tasks/${taskId}/comments/${commentId}`); }
  toggleReaction(taskId, commentId, emoji) { return this.post(`/tasks/${taskId}/comments/${commentId}/reactions`, { emoji }); }
  pinComment(taskId, commentId) { return this.patch(`/tasks/${taskId}/comments/${commentId}/pin`, {}); }
  deleteTask(id) { return this.delete(`/tasks/${id}`); }

  // Time logs
  startTimer(taskId) { return this.post('/time-logs/start', { task_id: taskId }); }
  stopTimer() { return this.post('/time-logs/stop', {}); }
  getActiveTimer() { return this.get('/time-logs/active'); }
  getMyTimeLogs(days = 7) { return this.get(`/time-logs/mine?days=${days}`); }
  getTaskTimeLogs(taskId) { return this.get(`/time-logs/task/${taskId}`); }

  // Notifications
  getNotifications() { return this.get('/notifications'); }
  markRead(id) { return this.patch(`/notifications/${id}/read`, {}); }
  markAllRead() { return this.patch('/notifications/read-all', {}); }
  deleteNotification(id) { return this.delete(`/notifications/${id}`); }
  clearReadNotifications() { return this.delete('/notifications/read'); }

  // Admin
  getAdminDashboard() { return this.get('/admin/dashboard'); }
  getAdminUsers() { return this.get('/admin/users'); }
  createUser(data) { return this.post('/admin/users', data); }
  getUserDetails(id) { return this.get(`/admin/users/${id}`); }
  updateUser(id, data) { return this.put(`/admin/users/${id}`, data); }
  deleteUser(id) { return this.delete(`/admin/users/${id}`); }
  getReports() { return this.get('/admin/reports'); }
  getActivity() { return this.get('/admin/activity'); }
  getSettings() { return this.get('/admin/settings'); }
  saveSettings(data) { return this.put('/admin/settings', data); }
  testEmail(to) { return this.post('/admin/settings/test-email', to ? { to } : {}); }
  getAdminNotifications(params = '') { return this.get(`/admin/notifications${params}`); }
  broadcastNotification(data) { return this.post('/admin/notifications/broadcast', data); }
  adminDeleteNotification(id) { return this.delete(`/admin/notifications/${id}`); }
  adminClearNotifications(all = false) { return this.delete(`/admin/notifications${all ? '?all=1' : ''}`); }

  // Search
  search(q, projectId) { return this.get(`/search?q=${encodeURIComponent(q)}${projectId ? '&projectId='+projectId : ''}`); }

  // Labels
  getProjectLabels(projectId) { return this.get(`/labels/project/${projectId}`); }
  createLabel(data) { return this.post('/labels', data); }
  deleteLabel(id) { return this.delete(`/labels/${id}`); }
  getTaskLabels(taskId) { return this.get(`/labels/task/${taskId}`); }
  addTaskLabel(taskId, labelId) { return this.post(`/labels/task/${taskId}`, { label_id: labelId }); }
  removeTaskLabel(taskId, labelId) { return this.delete(`/labels/task/${taskId}/${labelId}`); }

  // Subtasks
  getSubtasks(taskId) { return this.get(`/subtasks/${taskId}`); }
  createSubtask(taskId, title) { return this.post(`/subtasks/${taskId}`, { title }); }
  toggleSubtask(id) { return this.patch(`/subtasks/${id}/toggle`, {}); }
  updateSubtask(id, title) { return this.put(`/subtasks/${id}`, { title }); }
  deleteSubtask(id) { return this.delete(`/subtasks/${id}`); }

  // Watchers
  getWatchers(taskId) { return this.get(`/watchers/${taskId}`); }
  watchTask(taskId) { return this.post(`/watchers/${taskId}`, {}); }
  unwatchTask(taskId) { return this.delete(`/watchers/${taskId}`); }

  // Dependencies
  getDependencies(taskId) { return this.get(`/dependencies/${taskId}`); }
  addDependency(taskId, dependsOn) { return this.post(`/dependencies/${taskId}`, { depends_on: dependsOn }); }
  removeDependency(taskId, dependsOnId) { return this.delete(`/dependencies/${taskId}/${dependsOnId}`); }

  // Attachments
  getAttachments(taskId) { return this.get(`/attachments/${taskId}`); }
  deleteAttachment(id) { return this.delete(`/attachments/${id}`); }
  uploadAttachment(taskId, formData) {
    return fetch(`/api/attachments/${taskId}`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${this.token}` },
      body: formData
    }).then(async r => {
      const ct = r.headers.get('content-type') || '';
      const json = ct.includes('application/json') ? await r.json().catch(() => ({})) : {};
      if (!r.ok) throw new Error(json.error || `Upload failed (${r.status})`);
      return json;
    });
  }

  // Templates
  getTemplates(projectId) { return this.get(`/templates${projectId ? '?project_id='+projectId : ''}`); }
  createTemplate(data) { return this.post('/templates', data); }
  deleteTemplate(id) { return this.delete(`/templates/${id}`); }

  // Custom statuses
  getStatuses(projectId) { return this.get(`/statuses/${projectId}`); }
  createStatus(projectId, data) { return this.post(`/statuses/${projectId}`, data); }
  deleteStatus(id) { return this.delete(`/statuses/${id}`); }

  // Reports
  getMyStats() { return this.get('/reports/my-stats'); }
  getBurndown(projectId) { return this.get(`/reports/burndown/${projectId}`); }
  getOverdue() { return this.get('/reports/overdue'); }
  getProjectActivity(projectId) { return this.get(`/reports/activity/${projectId}`); }
  exportCSV(type, projectId) {
    const url = `/api/reports/csv?type=${type}${projectId ? '&projectId='+projectId : ''}`;
    const a = document.createElement('a');
    a.href = url;
    a.setAttribute('download', '');
    a.click();
  }

  // Projects extended
  restoreProject(id) { return this.patch(`/projects/${id}/restore`, {}); }

  // Users (available to all authenticated users)
  getUsers() { return this.get('/users'); }

  // Admin - Projects
  getAdminProjects() { return this.get('/admin/projects'); }
  updateAdminProject(id, data) { return this.put(`/admin/projects/${id}`, data); }
  archiveAdminProject(id) { return this.patch(`/admin/projects/${id}/archive`, {}); }
  restoreAdminProject(id) { return this.patch(`/admin/projects/${id}/restore`, {}); }
  deleteAdminProject(id) { return this.delete(`/admin/projects/${id}`); }
  getProjectMembers(id) { return this.get(`/admin/projects/${id}/members`); }
  addProjectMember(id, user_id) { return this.post(`/admin/projects/${id}/members`, { user_id }); }
  removeProjectMember(id, userId) { return this.delete(`/admin/projects/${id}/members/${userId}`); }

  // Admin - Tasks
  getAdminTasks(params = '') { return this.get(`/admin/tasks${params}`); }
  updateAdminTask(id, data) { return this.put(`/admin/tasks/${id}`, data); }
  deleteAdminTask(id) { return this.delete(`/admin/tasks/${id}`); }
  bulkTaskAction(action, task_ids, data) { return this.post('/admin/tasks/bulk', { action, task_ids, data }); }

  // Admin - System
  getSystemHealth() { return this.get('/admin/system/health'); }
  getAdminTimeLogs(params = '') { return this.get(`/admin/system/time-logs${params}`); }
  deleteAdminTimeLog(id) { return this.delete(`/admin/system/time-logs/${id}`); }
  getAdminAttachments() { return this.get('/admin/system/attachments'); }
  deleteAdminAttachment(id) { return this.delete(`/admin/system/attachments/${id}`); }
  getEmailLogs(params = '') { return this.get(`/admin/system/email-logs${params}`); }
  getLoginHistory(params = '') { return this.get(`/admin/system/login-history${params}`); }
  clearLoginHistory(days = 30) { return this.delete(`/admin/system/login-history?days=${days}`); }
  downloadBackup() { window.location.href = '/api/admin/system/backup'; }

  // Admin - Content
  getAnnouncements() { return this.get('/admin/content/announcements'); }
  createAnnouncement(data) { return this.post('/admin/content/announcements', data); }
  updateAnnouncement(id, data) { return this.put(`/admin/content/announcements/${id}`, data); }
  deleteAnnouncement(id) { return this.delete(`/admin/content/announcements/${id}`); }
  getActiveAnnouncements() { return this.get('/announcements/active'); }
  getAdminLabels() { return this.get('/admin/content/labels'); }
  deleteAdminLabel(id) { return this.delete(`/admin/content/labels/${id}`); }
  getAdminTemplates() { return this.get('/admin/content/templates'); }
  deleteAdminTemplate(id) { return this.delete(`/admin/content/templates/${id}`); }
  getInvites() { return this.get('/admin/content/invites'); }
  createInvite(data) { return this.post('/admin/content/invites', data); }
  deleteInvite(id) { return this.delete(`/admin/content/invites/${id}`); }
  getWebhooks() { return this.get('/admin/content/webhooks'); }
  createWebhook(data) { return this.post('/admin/content/webhooks', data); }
  updateWebhook(id, data) { return this.put(`/admin/content/webhooks/${id}`, data); }
  deleteWebhook(id) { return this.delete(`/admin/content/webhooks/${id}`); }
  getWebhookLogs(id) { return this.get(`/admin/content/webhooks/${id}/logs`); }
  testWebhook(id) { return this.post(`/admin/content/webhooks/${id}/test`, {}); }

  // Admin - Import
  importUsers(formData) {
    return fetch('/api/admin/import/users', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${this.token}` },
      body: formData
    }).then(async r => {
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || 'Import failed');
      return j;
    });
  }

  importTasks(formData) {
    return fetch('/api/admin/import/tasks', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${this.token}` },
      body: formData
    }).then(async r => {
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || 'Import failed');
      return j;
    });
  }

  getInviteInfo(token) { return this.get(`/auth/invite/${token}`); }

  // Chat
  getChannels() { return this.get('/chat/channels'); }
  openDm(userId) { return this.post('/chat/channels/dm', { user_id: userId }); }
  createGroup(name, memberIds) { return this.post('/chat/channels/group', { name, member_ids: memberIds }); }
  addChannelMember(channelId, userId) { return this.post(`/chat/channels/${channelId}/members`, { user_id: userId }); }
  getMessages(channelId, before) { return this.get(`/chat/channels/${channelId}/messages${before ? '?before=' + encodeURIComponent(before) : ''}`); }
  sendMessage(channelId, content) { return this.post(`/chat/channels/${channelId}/messages`, { content }); }
  editMessage(channelId, msgId, content) { return this.put(`/chat/channels/${channelId}/messages/${msgId}`, { content }); }
  deleteMessage(channelId, msgId) { return this.delete(`/chat/channels/${channelId}/messages/${msgId}`); }

  // Multi-assignees
  updateAssignees(taskId, assigneeIds) { return this.put(`/tasks/${taskId}`, { assignee_ids: assigneeIds }); }
}

window.api = new Api();
