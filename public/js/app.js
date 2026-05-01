/* =============================================
   ProjectFlow — Main SPA Application
   ============================================= */

const state = {
  user: null,
  token: null,
  view: 'dashboard',
  projects: [],
  currentProjectId: null,
  tasks: [],
  teamMembers: [],
  notifications: [],
  unread: 0,
  activeTimer: null,
  timerInterval: null,
  socket: null,
  _currentTaskId: null,
  _taskDetailTask: null,
  _taskDetailListeners: null,
  _typingTimeout: null,
  _chatChannelId: null,
  _chatListeners: null,
  _chatTypingTimeout: null,
};

// ──────────────────────────────────────────────
// INIT
// ──────────────────────────────────────────────
async function init() {
  // Check for invite token in URL
  const urlParams = new URLSearchParams(window.location.search);
  const inviteParam = urlParams.get('invite');
  if (inviteParam) {
    window._inviteToken = inviteParam;
    // Pre-fetch invite info (best-effort)
    try {
      const info = await api.getInviteInfo(inviteParam);
      if (info && info.valid) window._inviteInfo = info;
    } catch {}
  }

  const token = localStorage.getItem('pf_token');
  if (token) {
    try {
      api.setToken(token);
      const { user } = await api.getMe();
      state.user = user;
      state.token = token;
      await showApp();
    } catch {
      localStorage.removeItem('pf_token');
      showAuth(window._inviteToken ? 'register' : 'login');
    }
  } else {
    showAuth(window._inviteToken ? 'register' : 'login');
  }
}

// ──────────────────────────────────────────────
// AUTH
// ──────────────────────────────────────────────
function showAuth(mode = 'login') {
  document.getElementById('auth-page').classList.remove('hidden');
  document.getElementById('app').classList.add('hidden');
  renderAuthPage(mode);
}

function renderAuthPage(mode) {
  const resolvedMode = mode || (window._inviteToken ? 'register' : 'login');
  const page = document.getElementById('auth-page');
  page.innerHTML = `
    <div class="auth-bg"></div>
    <div class="auth-shapes">
      <div class="auth-shape"></div>
      <div class="auth-shape"></div>
      <div class="auth-shape"></div>
    </div>
    <div class="auth-card">
      <div class="auth-logo">
        <div class="auth-logo-icon">⚡</div>
        <div class="auth-logo-text">Project<span>Flow</span></div>
      </div>
      ${resolvedMode === 'login' ? renderLoginForm() : renderRegisterForm()}
    </div>`;
}

function renderLoginForm() {
  return `
    <h2 class="auth-title">Welcome back</h2>
    <p class="auth-subtitle">Sign in to your workspace</p>
    <form id="login-form">
      <div class="form-group">
        <label class="form-label">Email</label>
        <input class="form-control" type="email" id="login-email" placeholder="you@example.com" required autocomplete="email">
      </div>
      <div class="form-group">
        <label class="form-label">Password</label>
        <input class="form-control" type="password" id="login-password" placeholder="••••••••" required autocomplete="current-password">
      </div>
      <div id="login-error" class="form-error mb-3"></div>
      <button type="submit" class="btn btn-primary w-full btn-lg">Sign In</button>
    </form>
    <div class="auth-switch">
      Don't have an account? <a onclick="renderAuthPage('register')">Create one →</a>
    </div>`;
}

function renderOtpForm(email) {
  const page = document.getElementById('auth-page');
  page.innerHTML = `
    <div class="auth-bg"></div>
    <div class="auth-shapes">
      <div class="auth-shape"></div>
      <div class="auth-shape"></div>
      <div class="auth-shape"></div>
    </div>
    <div class="auth-card">
      <div class="auth-logo">
        <div class="auth-logo-icon">⚡</div>
        <div class="auth-logo-text">Project<span>Flow</span></div>
      </div>
      <h2 class="auth-title">Check your email</h2>
      <p class="auth-subtitle">We sent a 6-digit code to <strong>${escHtml(email)}</strong></p>
      <form id="otp-form" data-email="${escHtml(email)}">
        <div class="form-group">
          <label class="form-label">Login Code</label>
          <input class="form-control" type="text" id="otp-code" placeholder="000000" maxlength="6"
            inputmode="numeric" autocomplete="one-time-code" required
            style="font-size:1.6rem;letter-spacing:.3em;text-align:center;font-weight:700;">
        </div>
        <div id="otp-error" class="form-error mb-3"></div>
        <button type="submit" class="btn btn-primary w-full btn-lg">Verify Code</button>
      </form>
      <div class="auth-switch">
        <a onclick="renderAuthPage('login')" style="cursor:pointer;">← Back to sign in</a>
      </div>
    </div>`;
  setTimeout(() => document.getElementById('otp-code')?.focus(), 100);
}

function renderRegisterForm() {
  const inviteEmail = window._inviteInfo ? window._inviteInfo.email || '' : '';
  const inviteBanner = window._inviteToken
    ? `<div style="background:rgba(108,92,231,.15);border:1px solid rgba(108,92,231,.3);border-radius:8px;padding:10px 14px;margin-bottom:14px;font-size:.85rem;color:var(--primary-light,#a29bfe);">
        You were invited${window._inviteInfo && window._inviteInfo.role ? ` as <strong>${window._inviteInfo.role}</strong>` : ''}. Complete your registration below.
      </div>`
    : '';
  return `
    <h2 class="auth-title">Create account</h2>
    <p class="auth-subtitle">Join your team's workspace</p>
    ${inviteBanner}
    <form id="register-form">
      <div class="form-group">
        <label class="form-label">Full Name</label>
        <input class="form-control" type="text" id="reg-name" placeholder="John Doe" required>
      </div>
      <div class="form-group">
        <label class="form-label">Email</label>
        <input class="form-control" type="email" id="reg-email" placeholder="you@example.com" value="${escHtml(inviteEmail)}" required>
      </div>
      <div class="form-group">
        <label class="form-label">Password</label>
        <input class="form-control" type="password" id="reg-password" placeholder="Min. 6 characters" required>
      </div>
      <div id="reg-error" class="form-error mb-3"></div>
      <button type="submit" class="btn btn-primary w-full btn-lg">Create Account</button>
    </form>
    <div class="auth-switch">
      Already have an account? <a onclick="renderAuthPage('login')">Sign in →</a>
    </div>`;
}

document.addEventListener('submit', async (e) => {
  if (e.target.id === 'login-form') {
    e.preventDefault();
    const btn = e.target.querySelector('button');
    btn.disabled = true; btn.innerHTML = '<span class="spinner"></span> Signing in…';
    try {
      const result = await api.login(
        document.getElementById('login-email').value,
        document.getElementById('login-password').value
      );
      if (result.otp_required) {
        renderOtpForm(result.email);
        return;
      }
      api.setToken(result.token);
      state.token = result.token; state.user = result.user;
      await showApp();
    } catch (err) {
      document.getElementById('login-error').textContent = err.message;
      btn.disabled = false; btn.innerHTML = 'Sign In';
    }
  }
  if (e.target.id === 'otp-form') {
    e.preventDefault();
    const btn = e.target.querySelector('button[type=submit]');
    btn.disabled = true; btn.innerHTML = '<span class="spinner"></span> Verifying…';
    const email = e.target.dataset.email;
    const code = document.getElementById('otp-code').value.trim();
    try {
      const { token, user } = await api.verifyOtp(email, code);
      api.setToken(token);
      state.token = token; state.user = user;
      await showApp();
    } catch (err) {
      document.getElementById('otp-error').textContent = err.message;
      btn.disabled = false; btn.innerHTML = 'Verify Code';
    }
  }
  if (e.target.id === 'register-form') {
    e.preventDefault();
    const btn = e.target.querySelector('button');
    btn.disabled = true; btn.innerHTML = '<span class="spinner"></span> Creating…';
    try {
      const regData = {
        full_name: document.getElementById('reg-name').value,
        email: document.getElementById('reg-email').value,
        password: document.getElementById('reg-password').value,
      };
      if (window._inviteToken) regData.invite_token = window._inviteToken;
      const { token, user } = await api.register(regData);
      window._inviteToken = null;
      window._inviteInfo = null;
      api.setToken(token);
      state.token = token; state.user = user;
      await showApp();
    } catch (err) {
      document.getElementById('reg-error').textContent = err.message;
      btn.disabled = false; btn.innerHTML = 'Create Account';
    }
  }
});

// ──────────────────────────────────────────────
// APP SHELL
// ──────────────────────────────────────────────
async function showApp() {
  document.getElementById('auth-page').classList.add('hidden');
  document.getElementById('app').classList.remove('hidden');
  renderShell();
  await loadProjects();
  await loadNotifications();
  await checkActiveTimer();
  navigateTo(state.view);
  checkCookieConsent();
  initSocket();
  loadActiveAnnouncements();
}

async function loadActiveAnnouncements() {
  try {
    const { announcements } = await api.getActiveAnnouncements();
    if (!announcements || !announcements.length) return;
    const dismissed = JSON.parse(localStorage.getItem('pf_dismissed_announcements') || '[]');
    const toShow = announcements.filter(a => !dismissed.includes(a.id));
    if (!toShow.length) return;
    const typeColors = { info: '#74B9FF', warning: '#FDCB6E', urgent: '#FF5C7A', success: '#00B894' };
    const typeBg = { info: 'rgba(116,185,255,.1)', warning: 'rgba(253,203,110,.1)', urgent: 'rgba(255,92,122,.1)', success: 'rgba(0,184,148,.1)' };
    let container = document.getElementById('announcement-banners');
    if (!container) {
      container = document.createElement('div');
      container.id = 'announcement-banners';
      container.style.cssText = 'position:fixed;top:0;left:0;right:0;z-index:9000;display:flex;flex-direction:column;gap:0;';
      document.body.appendChild(container);
    }
    container.innerHTML = toShow.map(a => `
      <div style="background:${typeBg[a.type]||typeBg.info};border-bottom:2px solid ${typeColors[a.type]||typeColors.info};padding:10px 20px;display:flex;align-items:center;gap:12px;font-size:.875rem;">
        <span style="color:${typeColors[a.type]||typeColors.info};font-weight:700;text-transform:uppercase;font-size:.7rem;white-space:nowrap;">${escHtml(a.type)}</span>
        <span style="font-weight:600;color:#fff;">${escHtml(a.title)}</span>
        <span style="color:var(--text-muted);flex:1;">${escHtml(a.message)}</span>
        <button onclick="dismissAnnouncement(${a.id},this.closest('[data-ann-id]'))" data-ann-id="${a.id}"
          style="background:none;border:none;cursor:pointer;color:var(--text-dim);font-size:1rem;padding:2px 6px;border-radius:4px;" aria-label="Dismiss">✕</button>
      </div>`).join('');
  } catch {}
}

function dismissAnnouncement(id, el) {
  const dismissed = JSON.parse(localStorage.getItem('pf_dismissed_announcements') || '[]');
  dismissed.push(id);
  localStorage.setItem('pf_dismissed_announcements', JSON.stringify(dismissed));
  if (el) el.remove();
  const container = document.getElementById('announcement-banners');
  if (container && !container.children.length) container.remove();
}

function renderShell() {
  document.getElementById('app').innerHTML = `
    <div class="sidebar-overlay" id="sidebar-overlay" onclick="closeSidebar()"></div>
    <aside class="sidebar" id="sidebar">
      <div class="sidebar-header">
        <div class="sidebar-logo">⚡</div>
        <div class="sidebar-brand">Project<span>Flow</span></div>
      </div>
      <nav class="sidebar-nav" id="sidebar-nav">
        <div class="sidebar-section">
          <div class="sidebar-section-title">Main</div>
          ${navItem('dashboard', icon('grid'), 'Dashboard')}
          ${navItem('my-tasks', icon('check-square'), 'My Tasks')}
          ${navItem('time-tracking', icon('clock'), 'Time Tracking')}
          ${navItem('messages', icon('message-circle'), 'Messages')}
        </div>
        <div class="sidebar-section">
          <div class="sidebar-section-title">
            Boards
            <span onclick="openCreateProject()" style="cursor:pointer;color:var(--primary-light);font-size:16px;font-weight:700;" data-tooltip="New Board">+</span>
          </div>
          <div id="projects-nav"></div>
        </div>
        ${state.user?.role === 'admin' ? `
        <div class="sidebar-section">
          <div class="sidebar-section-title">Admin</div>
          ${navItem('admin', icon('settings'), 'Admin Panel')}
          ${navItem('team', icon('users'), 'Team')}
        </div>` : `
        <div class="sidebar-section">
          ${navItem('team', icon('users'), 'Team')}
        </div>`}
      </nav>
      <div class="sidebar-footer">
        <div class="user-card" onclick="navigateTo('profile')">
          ${avatarHtml(state.user, 'avatar-sm')}
          <div class="user-info">
            <div class="user-name">${state.user?.full_name || 'User'}</div>
            <div class="user-role">${state.user?.role || 'staff'}</div>
          </div>
          ${icon('chevron-right', 14, 'color:var(--text-dim)')}
        </div>
      </div>
    </aside>

    <div style="flex:1;display:flex;flex-direction:column;min-width:0;">
      <header class="header" id="header">
        <button class="btn-icon mobile-menu-btn" onclick="toggleSidebar()">${icon('menu')}</button>
        <div id="header-title" class="header-title"></div>
        <div class="header-actions">
          <div id="timer-status"></div>
          <div class="relative">
            <button class="btn-icon" id="notif-btn" onclick="toggleNotifDropdown()">
              ${icon('bell')}
              <span id="notif-badge" class="hidden notif-badge-counter"></span>
            </button>
            <div id="notif-dropdown" class="notif-dropdown hidden"></div>
          </div>
          <button class="btn-icon" onclick="toggleTheme()" data-tooltip="Toggle theme">${icon('sun')}</button>
          <button class="btn-icon" onclick="logout()" data-tooltip="Logout">${icon('log-out')}</button>
        </div>
      </header>

      <main class="main-content" id="main-content"></main>
    </div>

    <div class="toast-container" id="toast-container"></div>
  `;
}

function navItem(view, ico, label) {
  return `<div class="sidebar-item" data-view="${view}" onclick="navigateTo('${view}')">
    ${ico} <span>${label}</span>
  </div>`;
}

// ──────────────────────────────────────────────
// NAVIGATION
// ──────────────────────────────────────────────
async function navigateTo(view, projectId = null) {
  state.view = view;
  if (projectId) state.currentProjectId = projectId;

  // Update active states
  document.querySelectorAll('.sidebar-item[data-view]').forEach(el => el.classList.toggle('active', el.dataset.view === view));
  document.querySelectorAll('.project-item').forEach(el => el.classList.toggle('active', el.dataset.id == projectId));

  closeSidebar();

  const titles = { dashboard: 'Dashboard', 'my-tasks': 'My Tasks', 'time-tracking': 'Time Tracking', messages: 'Messages', board: 'Board', team: 'Team Members', admin: 'Admin Panel', profile: 'Profile', settings: 'Settings' };
  const titleEl = document.getElementById('header-title');
  if (titleEl) titleEl.textContent = titles[view] || view;

  const main = document.getElementById('main-content');
  main.innerHTML = `<div class="page-loading"><div class="spinner spinner-lg"></div></div>`;

  try {
    switch (view) {
      case 'dashboard': await renderDashboard(); break;
      case 'my-tasks': await renderMyTasks(); break;
      case 'board': await renderBoard(state.currentProjectId); break;
      case 'time-tracking': await renderTimeTracking(); break;
      case 'messages': await renderMessages(); break;
      case 'team': await renderTeam(); break;
      case 'admin': await renderAdmin(); break;
      case 'profile': await renderProfile(); break;
      default: await renderDashboard();
    }
  } catch (err) {
    main.innerHTML = `<div class="empty-state"><div class="empty-icon">⚠️</div><div class="empty-title">Something went wrong</div><p>${err.message}</p></div>`;
  }
}

// ──────────────────────────────────────────────
// DASHBOARD
// ──────────────────────────────────────────────
async function renderDashboard() {
  const [tasksRes, timerRes] = await Promise.all([api.getMyTasks(), api.getActiveTimer()]);
  const tasks = tasksRes.tasks;
  const todo = tasks.filter(t => t.status === 'todo').length;
  const inProg = tasks.filter(t => t.status === 'in_progress').length;
  const done = tasks.filter(t => t.status === 'done').length;
  const totalSecs = tasks.reduce((s, t) => s + (t.total_seconds || 0), 0);

  document.getElementById('main-content').innerHTML = `
    <div class="page-header">
      <div>
        <div class="page-title">Good ${greeting()}, ${state.user?.full_name?.split(' ')[0]} 👋</div>
        <div class="page-subtitle">Here's what's happening across your boards today</div>
      </div>
      ${state.user?.role === 'admin' ? `<button class="btn btn-primary" onclick="openCreateTask()">${icon('plus')} New Task</button>` : ''}
    </div>

    <div class="stats-grid">
      <div class="stat-card" style="--card-color:#7878A8;--card-color-2:#aaaacc">
        <div class="stat-icon" style="background:rgba(120,120,168,0.15);color:#7878A8;">📋</div>
        <div><div class="stat-value">${todo}</div><div class="stat-label">To Do</div></div>
      </div>
      <div class="stat-card" style="--card-color:var(--primary);--card-color-2:var(--primary-light)">
        <div class="stat-icon">🔄</div>
        <div><div class="stat-value">${inProg}</div><div class="stat-label">In Progress</div></div>
      </div>
      <div class="stat-card" style="--card-color:var(--success);--card-color-2:#55efc4">
        <div class="stat-icon" style="background:rgba(0,184,148,0.15);color:var(--success);">✅</div>
        <div><div class="stat-value">${done}</div><div class="stat-label">Completed</div></div>
      </div>
      <div class="stat-card" style="--card-color:var(--warning);--card-color-2:#ffeaa7">
        <div class="stat-icon" style="background:rgba(253,203,110,0.15);color:var(--warning);">⏱️</div>
        <div><div class="stat-value">${formatDuration(totalSecs)}</div><div class="stat-label">Time Tracked</div></div>
      </div>
    </div>

    ${timerRes.timer ? `
    <div class="timer-widget mb-4">
      <div>${icon('play-circle', 24, 'color:#fff;opacity:0.8')}</div>
      <div class="timer-info">
        <div class="timer-task">${timerRes.timer.task_title}</div>
        <div class="timer-project">${timerRes.timer.project_name}</div>
      </div>
      <div class="timer-display" id="dash-timer">--:--:--</div>
      <button class="btn btn-secondary btn-sm" onclick="stopTimer()">Stop</button>
    </div>` : ''}

    <div class="grid-2" style="gap:20px">
      <div class="card">
        <div class="card-header">
          <div class="card-title">My Recent Tasks</div>
          <button class="btn btn-ghost btn-sm" onclick="navigateTo('my-tasks')">View all</button>
        </div>
        ${tasks.length === 0 ? emptyState('📋', 'No tasks yet', 'Tasks assigned to you will appear here') : `
        <div style="display:flex;flex-direction:column;gap:8px;">
          ${tasks.slice(0, 6).map(t => `
            <div onclick="openTaskDetail(${t.id})" style="display:flex;align-items:center;gap:12px;padding:10px;border-radius:var(--r-md);cursor:pointer;transition:background var(--t-fast);" onmouseover="this.style.background='var(--bg-elevated)'" onmouseout="this.style.background=''">
              <div style="flex:1;min-width:0;">
                <div style="font-size:.875rem;font-weight:600;color:var(--text);margin-bottom:3px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${escHtml(t.title)}</div>
                <div style="font-size:.75rem;color:var(--text-muted);">${t.project_name || ''}</div>
              </div>
              ${statusBadge(t.status)}
            </div>
          `).join('')}
        </div>`}
      </div>

      <div class="card">
        <div class="card-header">
          <div class="card-title">My Boards</div>
          ${state.user?.role === 'admin' ? `<button class="btn btn-ghost btn-sm" onclick="openCreateProject()">${icon('plus')} New</button>` : ''}
        </div>
        ${state.projects.length === 0 ? emptyState('📁', 'No boards yet', 'Ask an admin to create a board') : `
        <div style="display:flex;flex-direction:column;gap:8px;">
          ${state.projects.slice(0, 5).map(p => {
            const pct = p.task_count > 0 ? Math.round((p.done_count / p.task_count) * 100) : 0;
            return `
            <div onclick="navigateTo('board',${p.id})" style="cursor:pointer;padding:10px;border-radius:var(--r-md);transition:background var(--t-fast);" onmouseover="this.style.background='var(--bg-elevated)'" onmouseout="this.style.background=''">
              <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;">
                <div style="width:10px;height:10px;border-radius:50%;background:${p.color};flex-shrink:0;"></div>
                <div style="font-size:.875rem;font-weight:600;color:var(--text);flex:1;">${escHtml(p.name)}</div>
                <div style="font-size:.75rem;color:var(--text-muted);">${pct}%</div>
              </div>
              <div class="progress"><div class="progress-bar" style="width:${pct}%"></div></div>
            </div>`}).join('')}
        </div>`}
      </div>
    </div>`;

  if (timerRes.timer) {
    startDashTimer(timerRes.timer.start_time);
  }
}

function startDashTimer(startTime) {
  const el = document.getElementById('dash-timer');
  if (!el) return;
  if (state.timerInterval) clearInterval(state.timerInterval);
  state.timerInterval = setInterval(() => {
    const secs = Math.floor((Date.now() - new Date(startTime).getTime()) / 1000);
    if (el) el.textContent = formatDurationFull(secs);
  }, 1000);
}

// ──────────────────────────────────────────────
// MY TASKS
// ──────────────────────────────────────────────
async function renderMyTasks() {
  const { tasks } = await api.getMyTasks();
  const grouped = { todo: [], in_progress: [], review: [], done: [], blocked: [] };
  tasks.forEach(t => { if (grouped[t.status]) grouped[t.status].push(t); });

  document.getElementById('main-content').innerHTML = `
    <div class="page-header">
      <div>
        <div class="page-title">My Tasks</div>
        <div class="page-subtitle">${tasks.length} task${tasks.length !== 1 ? 's' : ''} assigned to you</div>
      </div>
    </div>
    <div class="board-container">
      <div class="board">
        ${Object.entries({ todo: 'To Do', in_progress: 'In Progress', review: 'Review', done: 'Done', blocked: 'Blocked' }).map(([status, label]) =>
          renderColumn(status, label, grouped[status] || [])
        ).join('')}
      </div>
    </div>`;
}

// ──────────────────────────────────────────────
// PROJECT BOARD
// ──────────────────────────────────────────────
async function renderBoard(projectId) {
  if (!projectId) {
    if (state.projects.length > 0) {
      state.currentProjectId = state.projects[0].id;
      return renderBoard(state.currentProjectId);
    }
    document.getElementById('main-content').innerHTML = emptyState('📁', 'No board selected', 'Create a board from the sidebar');
    return;
  }

  const [projectRes, tasksRes] = await Promise.all([api.getProject(projectId), api.getProjectTasks(projectId)]);
  const { project, members } = projectRes;
  const { tasks } = tasksRes;
  const grouped = { todo: [], in_progress: [], review: [], done: [], blocked: [] };
  tasks.forEach(t => { if (grouped[t.status]) grouped[t.status].push(t); });

  const titleEl = document.getElementById('header-title');
  if (titleEl) titleEl.textContent = project.name;

  document.getElementById('main-content').innerHTML = `
    <div class="page-header">
      <div>
        <div class="page-title" style="display:flex;align-items:center;gap:10px;">
          <div style="width:14px;height:14px;border-radius:50%;background:${project.color};flex-shrink:0;"></div>
          ${escHtml(project.name)}
        </div>
        <div class="page-subtitle">${project.description || 'No description'} · ${tasks.length} task${tasks.length !== 1 ? 's' : ''} · ${members.length} member${members.length !== 1 ? 's' : ''}</div>
      </div>
      <div style="display:flex;gap:8px;align-items:center;">
        <div class="avatar-group">
          ${members.slice(0,4).map(m => `<div class="avatar avatar-sm" data-tooltip="${escHtml(m.full_name)}">${avatarInitials(m.full_name)}</div>`).join('')}
          ${members.length > 4 ? `<div class="avatar avatar-sm" style="background:var(--bg-elevated);color:var(--text-muted);">+${members.length-4}</div>` : ''}
        </div>
        <button class="btn btn-primary btn-sm" onclick="openCreateTask(${projectId})">${icon('plus',14)} Add Task</button>
        ${state.user?.role === 'admin' ? `
          <button class="btn btn-secondary btn-sm" onclick="openShareBoard(${projectId})" data-tooltip="Share board access">${icon('users',14)} Share</button>
          <button class="btn-icon" onclick="openManageProject(${projectId})" data-tooltip="Board settings">${icon('settings',16)}</button>
        ` : ''}
      </div>
    </div>
    <div class="board-container">
      <div class="board">
        ${Object.entries({ todo: 'To Do', in_progress: 'In Progress', review: 'Review', done: 'Done', blocked: 'Blocked' }).map(([status, label]) =>
          renderColumn(status, label, grouped[status] || [], projectId)
        ).join('')}
      </div>
    </div>`;
}

function renderColumn(status, label, tasks, projectId = null) {
  const colors = { todo: 'var(--s-todo)', in_progress: 'var(--s-inprog)', review: 'var(--s-review)', done: 'var(--s-done)', blocked: 'var(--s-blocked)' };
  const statusColor = colors[status] || 'var(--border)';
  return `
    <div class="board-column col-${status}">
      <div class="column-header">
        <div class="column-dot" style="background:${statusColor};"></div>
        <div class="column-title">${label}</div>
        <div class="column-count">${tasks.length}</div>
        ${projectId ? `<button class="btn-icon" style="width:22px;height:22px;font-size:.85rem;color:var(--text-muted);" onclick="openCreateTask(${projectId},'${status}')" data-tooltip="Add task">+</button>` : ''}
      </div>
      <div class="column-body">
        ${tasks.length === 0
          ? `<div style="padding:16px 12px;text-align:center;color:var(--text-dim);font-size:.78rem;border:1px dashed var(--border);border-radius:var(--r-md);margin:4px 0;">No tasks here</div>`
          : tasks.map(t => renderTaskCard(t)).join('')}
      </div>
      ${projectId ? `
      <div class="column-add-btn" onclick="openCreateTask(${projectId}, '${status}')">
        ${icon('plus', 14)} Add item
      </div>` : ''}
    </div>`;
}

function renderTaskCard(t) {
  const prioColors = { urgent: 'var(--danger)', high: 'var(--warning)', medium: '#60a5fa', low: 'var(--success)' };
  const prioColor = prioColors[t.priority] || 'var(--border)';
  const dueBadge = t.due_date
    ? `<span style="display:inline-flex;align-items:center;gap:3px;font-size:.7rem;color:${isPastDue(t.due_date) ? 'var(--danger)' : 'var(--text-muted)'};">${icon('calendar',11)} ${formatDate(t.due_date)}</span>`
    : '';
  const priorityDot = `<span style="display:inline-block;width:7px;height:7px;border-radius:50%;background:${prioColor};flex-shrink:0;"></span>`;
  return `
    <div class="task-card prio-${t.priority}" onclick="openTaskDetail(${t.id})">
      <div class="task-card-title" style="display:flex;align-items:flex-start;gap:7px;">
        ${priorityDot}
        <span style="flex:1;">${escHtml(t.title)}</span>
      </div>
      <div class="task-card-meta">
        ${priorityBadge(t.priority)}
        ${dueBadge}
      </div>
      <div class="task-card-footer">
        <div class="avatar-group" style="gap:-4px;">
          ${(t.assignees && t.assignees.length)
            ? t.assignees.slice(0,3).map(a => avatarHtml(a, 'avatar-sm')).join('')
              + (t.assignees.length > 3 ? `<div class="avatar avatar-sm" style="background:var(--bg-elevated);color:var(--text-muted);font-size:.65rem;">+${t.assignees.length-3}</div>` : '')
            : (t.assigned_to ? avatarHtml({full_name:t.assigned_name,avatar:t.assigned_avatar,id:t.assigned_to},'avatar-sm') : '<div></div>')}
        </div>
        ${t.total_seconds > 0 ? `<div class="task-time">${icon('clock',11)} ${formatDuration(t.total_seconds)}</div>` : ''}
      </div>
    </div>`;
}

// ──────────────────────────────────────────────
// TASK DETAIL MODAL
// ──────────────────────────────────────────────
async function openTaskDetail(taskId) {
  const { task, comments = [], timeLogs = [], assignees = [] } = await api.getTask(taskId);
  const totalSecs = timeLogs.reduce((s, l) => s + (l.duration_seconds || 0), 0);
  const timerRes = await api.getActiveTimer();
  const isTimerRunning = timerRes.timer?.task_id === taskId;

  const canEdit = state.user?.role === 'admin' || task.assigned_to === state.user?.id || task.created_by === state.user?.id;

  const allMembers = await loadAllTeamForModal();

  const sortedComments = comments.slice().sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
  const commentCount = comments.length;

  const taskTitle = escHtml(task.title);
  const breadcrumbTitle = task.title.length > 48 ? escHtml(task.title.slice(0, 48)) + '…' : taskTitle;

  openModal('task-detail-modal', `
    <div class="td-header">
      <div class="td-nav">
        <span class="td-project-crumb" onclick="navigateTo('board',${task.project_id});closeTaskDetail()">${escHtml(task.project_name)}</span>
        <span class="td-crumb-sep">›</span>
        <span class="td-crumb-task">${breadcrumbTitle}</span>
      </div>
      <div style="display:flex;align-items:center;gap:8px;flex-shrink:0;">
        ${statusBadge(task.status)}
        <button class="btn-icon td-expand-btn" onclick="expandToFull(${task.id})" title="Full page view">⤢</button>
        <button class="modal-close" onclick="closeTaskDetail()">✕</button>
      </div>
    </div>

    <div class="task-detail-grid td-grid-layout">

      <!-- LEFT: main content (features.js targets this as .task-detail-grid > div:first-child) -->
      <div style="overflow-y:auto;padding:24px 28px;min-width:0;">

        <!-- Title -->
        <h2 class="td-title">${taskTitle}</h2>

        <!-- Status row -->
        <div style="margin-bottom:20px;">
          <div class="td-section-label">Status</div>
          <div style="display:flex;gap:6px;flex-wrap:wrap;">
            ${['todo','in_progress','review','done','blocked'].map(s => `
              <button class="td-status-btn ${task.status === s ? 'td-status-active-' + s : ''}"
                      onclick="${canEdit ? `changeStatus(${task.id},'${s}','task-detail-modal')` : 'return false'}"
                      ${!canEdit ? 'style="cursor:default;opacity:.6;"' : ''}>
                ${s.replace('_', ' ')}
              </button>`).join('')}
          </div>
        </div>

        <!-- Description -->
        <div style="margin-bottom:20px;">
          <div class="td-section-label">Description</div>
          ${task.description
            ? `<div class="td-description">${escHtml(task.description)}</div>`
            : `<div class="td-description td-no-desc">No description provided.</div>`}
        </div>

        <!-- features.js injects: subtasks, labels, watchers, deps, attachments HERE -->

        <!-- Comments & Activity Feed -->
        <div>
          <div class="td-section-label">Comments
            <span id="comment-count-badge" style="font-weight:400;text-transform:none;letter-spacing:0;font-size:.75rem;margin-left:4px;">(${commentCount})</span>
          </div>
          <div id="typing-indicator" class="typing-indicator" style="display:none;margin-bottom:6px;"></div>
          <div id="comments-list" style="display:flex;flex-direction:column;gap:10px;margin-bottom:14px;">
            ${sortedComments.length === 0
              ? `<div data-empty style="color:var(--text-dim);font-size:.8rem;padding:6px 0;">No comments yet — be the first!</div>`
              : sortedComments.map(c => renderCommentItem(c, task)).join('')}
          </div>
          <div style="display:flex;gap:10px;align-items:flex-start;">
            ${avatarHtml(state.user, 'avatar-sm')}
            <div style="flex:1;position:relative;" id="comment-composer-wrap">
              <div class="comment-composer">
                <div class="comment-toolbar">
                  <button class="toolbar-btn" onclick="applyFormat('bold')" title="Bold (Ctrl+B)"><b>B</b></button>
                  <button class="toolbar-btn" onclick="applyFormat('italic')" title="Italic"><i>I</i></button>
                  <span class="comment-toolbar-sep"></span>
                  <button class="toolbar-btn" onclick="applyFormat('code')" title="Inline code" style="font-family:monospace;">\`</button>
                  <button class="toolbar-btn" onclick="applyFormat('codeblock')" title="Code block" style="font-size:.7rem;">{ }</button>
                  <span class="comment-toolbar-sep"></span>
                  <button class="toolbar-btn" onclick="applyFormat('list')" title="Bullet list">≡</button>
                </div>
                <textarea class="comment-textarea" id="comment-input" placeholder="Write an update, leave feedback, or @ someone to notify them…" rows="2"></textarea>
                <div class="comment-submit-row">
                  <span class="comment-hint"><kbd>Ctrl</kbd>+<kbd>Enter</kbd> to post &nbsp;·&nbsp; <kbd>@</kbd> to mention</span>
                  <button class="btn btn-primary btn-sm" onclick="submitComment(${task.id})">${icon('play', 13)} Post</button>
                </div>
              </div>
              <div class="mention-dropdown" id="mention-dropdown" style="display:none;"></div>
            </div>
          </div>
        </div>

      </div><!-- end left column -->

      <!-- RIGHT: properties sidebar -->
      <div class="td-sidebar">
        <div class="td-sidebar-header">Details</div>

        <div class="td-prop">
          <div class="td-prop-label">Assignees</div>
          <div class="td-prop-value" id="assignees-prop">
            ${renderAssigneesProp(assignees, allMembers, task.id, canEdit)}
          </div>
        </div>

        <div class="td-prop">
          <div class="td-prop-label">Priority</div>
          <div class="td-prop-value">
            ${canEdit ? `
            <select class="form-control" style="font-size:.8rem;padding:4px 8px;height:auto;" onchange="updateTaskField(${task.id},'priority',this.value)">
              ${['low','medium','high','urgent'].map(p => `<option value="${p}" ${task.priority===p?'selected':''}>${p.charAt(0).toUpperCase()+p.slice(1)}</option>`).join('')}
            </select>` : priorityBadge(task.priority)}
          </div>
        </div>

        <div class="td-prop">
          <div class="td-prop-label">Due Date</div>
          <div class="td-prop-value">
            ${canEdit
              ? `<input class="form-control" type="date" value="${task.due_date||''}" style="font-size:.8rem;padding:4px 8px;height:auto;" onchange="updateTaskField(${task.id},'due_date',this.value)">`
              : (task.due_date
                  ? `<span style="color:${isPastDue(task.due_date)?'var(--danger)':'var(--text)'};">${formatDate(task.due_date)}</span>`
                  : `<span style="color:var(--text-dim);">No date</span>`)}
          </div>
        </div>

        <div class="td-prop">
          <div class="td-prop-label">Created by</div>
          <div class="td-prop-value">${escHtml(task.creator_name || '—')}</div>
        </div>

        <div class="td-prop">
          <div class="td-prop-label">Created</div>
          <div class="td-prop-value" style="color:var(--text-muted);">${liveTime(task.created_at)}</div>
        </div>

        <div class="td-prop">
          <div class="td-prop-label">Board</div>
          <div class="td-prop-value">
            <span style="cursor:pointer;text-decoration:underline;text-decoration-color:var(--border-focus);" onclick="navigateTo('board',${task.project_id});closeTaskDetail()">${escHtml(task.project_name)}</span>
          </div>
        </div>

        <!-- Time Tracking -->
        <div class="td-timer-box">
          <div class="td-timer-label">Time Tracking</div>
          <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
            ${isTimerRunning
              ? `<button class="btn btn-danger btn-sm" onclick="stopTimerAndRefresh(${task.id})">${icon('square',14)} Stop</button>
                 <span class="timer-display" id="modal-timer" style="font-size:.9rem;color:var(--text);">--:--:--</span>`
              : `<button class="btn btn-success btn-sm" onclick="startTimerForTask(${task.id})">${icon('play',14)} Start</button>`}
            <span class="td-total-time">Total: ${formatDurationFull(totalSecs)}</span>
          </div>
        </div>

        ${canEdit && state.user?.role === 'admin' ? `
        <div class="td-danger-zone">
          <button class="btn btn-danger btn-sm w-full" onclick="deleteTaskConfirm(${task.id})">Delete Task</button>
        </div>` : ''}
      </div>

    </div>
  `, 'modal-xl');

  if (isTimerRunning && timerRes.timer) {
    const el = document.getElementById('modal-timer');
    if (el) {
      clearInterval(state._taskTimerInterval);
      state._taskTimerInterval = setInterval(() => {
        const s = Math.floor((Date.now() - new Date(timerRes.timer.start_time).getTime()) / 1000);
        if (el) el.textContent = formatDurationFull(s);
      }, 1000);
    }
  }

  // Store task ref and join socket room
  state._taskDetailTask = task;
  state._currentTaskId = taskId;
  window._taskDetailMembers = allMembers;
  window._taskDetailAssignees = assignees;
  setupCommentComposer(taskId, allMembers);

  if (state.socket) {
    state.socket.emit('join:task', taskId);

    const onCommentNew = ({ comment }) => {
      if (comment.user_id === state.user?.id) return;
      const list = document.getElementById('comments-list');
      if (!list) return;
      list.querySelector('[data-empty]')?.remove();
      const wrapper = document.createElement('div');
      wrapper.innerHTML = renderCommentItem(comment, state._taskDetailTask);
      list.appendChild(wrapper.firstElementChild);
      list.scrollTop = list.scrollHeight;
      updateCommentCount(1);
    };

    const onTypingUpdate = ({ userId, name, typing }) => {
      if (userId === state.user?.id) return;
      const indicator = document.getElementById('typing-indicator');
      if (!indicator) return;
      if (typing) {
        indicator.style.display = 'flex';
        indicator.innerHTML = `<div class="typing-dots"><span></span><span></span><span></span></div><span>${escHtml(name || 'Someone')} is typing…</span>`;
      } else {
        indicator.style.display = 'none';
        indicator.innerHTML = '';
      }
    };

    state.socket.on('comment:new', onCommentNew);
    state.socket.on('typing:update', onTypingUpdate);
    state._taskDetailListeners = { 'comment:new': onCommentNew, 'typing:update': onTypingUpdate };
  }
}

// ──────────────────────────────────────────────
// TASK FULL PAGE VIEW
// ──────────────────────────────────────────────
async function openTaskFull(taskId) {
  state.view = 'task';
  state._fullViewTaskId = taskId;
  const main = document.getElementById('main-content');
  main.innerHTML = `<div class="page-loading"><div class="spinner spinner-lg"></div></div>`;

  const [taskRes, timerRes] = await Promise.all([api.getTask(taskId), api.getActiveTimer()]);
  const { task, comments = [], timeLogs = [], assignees = [] } = taskRes;
  const allMembers = await loadAllTeamForModal();

  const totalSecs = timeLogs.reduce((s, l) => s + (l.duration_seconds || 0), 0);
  const isTimerRunning = timerRes.timer?.task_id === taskId;
  const canEdit = state.user?.role === 'admin' || task.assigned_to === state.user?.id || task.created_by === state.user?.id;
  const sortedComments = comments.slice().sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
  const commentCount = comments.length;

  const titleEl = document.getElementById('header-title');
  if (titleEl) titleEl.textContent = task.title.length > 38 ? task.title.slice(0, 38) + '…' : task.title;
  const crumbTitle = task.title.length > 60 ? escHtml(task.title.slice(0, 60)) + '…' : escHtml(task.title);

  main.innerHTML = `
    <div class="task-fullpage">
      <div class="task-fp-header">
        <div class="td-nav">
          <button class="btn-icon td-back-btn" onclick="navigateTo('board',${task.project_id})" title="Back to board">${icon('chevron-left', 16)}</button>
          <span class="td-project-crumb" onclick="navigateTo('board',${task.project_id})">${escHtml(task.project_name)}</span>
          <span class="td-crumb-sep">›</span>
          <span class="td-crumb-task">${crumbTitle}</span>
        </div>
        <div style="display:flex;align-items:center;gap:8px;flex-shrink:0;">
          ${statusBadge(task.status)}
          <button class="btn btn-ghost btn-sm td-popup-btn" onclick="openTaskDetail(${task.id})">${icon('grid', 13)} Popup</button>
        </div>
      </div>
      <div class="task-detail-grid td-grid-layout">
        <div style="overflow-y:auto;padding:24px 28px;min-width:0;">
          <h2 class="td-title">${escHtml(task.title)}</h2>
          <div style="margin-bottom:20px;">
            <div class="td-section-label">Status</div>
            <div style="display:flex;gap:6px;flex-wrap:wrap;">
              ${['todo','in_progress','review','done','blocked'].map(s => `
                <button class="td-status-btn ${task.status === s ? 'td-status-active-' + s : ''}"
                        onclick="${canEdit ? `changeStatus(${task.id},'${s}')` : 'return false'}"
                        ${!canEdit ? 'style="cursor:default;opacity:.6;"' : ''}>
                  ${s.replace('_', ' ')}
                </button>`).join('')}
            </div>
          </div>
          <div style="margin-bottom:20px;">
            <div class="td-section-label">Description</div>
            ${task.description
              ? `<div class="td-description">${escHtml(task.description)}</div>`
              : `<div class="td-description td-no-desc">No description provided.</div>`}
          </div>
          <div>
            <div class="td-section-label">Comments
              <span id="comment-count-badge" style="font-weight:400;text-transform:none;letter-spacing:0;font-size:.75rem;margin-left:4px;">(${commentCount})</span>
            </div>
            <div id="typing-indicator" class="typing-indicator" style="display:none;margin-bottom:6px;"></div>
            <div id="comments-list" style="display:flex;flex-direction:column;gap:10px;margin-bottom:14px;">
              ${sortedComments.length === 0
                ? `<div data-empty style="color:var(--text-dim);font-size:.8rem;padding:6px 0;">No comments yet — be the first!</div>`
                : sortedComments.map(c => renderCommentItem(c, task)).join('')}
            </div>
            <div style="display:flex;gap:10px;align-items:flex-start;">
              ${avatarHtml(state.user, 'avatar-sm')}
              <div style="flex:1;position:relative;" id="comment-composer-wrap">
                <div class="comment-composer">
                  <div class="comment-toolbar">
                    <button class="toolbar-btn" onclick="applyFormat('bold')" title="Bold (Ctrl+B)"><b>B</b></button>
                    <button class="toolbar-btn" onclick="applyFormat('italic')" title="Italic"><i>I</i></button>
                    <span class="comment-toolbar-sep"></span>
                    <button class="toolbar-btn" onclick="applyFormat('code')" title="Inline code" style="font-family:monospace;">\`</button>
                    <button class="toolbar-btn" onclick="applyFormat('codeblock')" title="Code block" style="font-size:.7rem;">{ }</button>
                    <span class="comment-toolbar-sep"></span>
                    <button class="toolbar-btn" onclick="applyFormat('list')" title="Bullet list">≡</button>
                  </div>
                  <textarea class="comment-textarea" id="comment-input" placeholder="Write a comment, leave feedback, or @ someone to notify them…" rows="2"></textarea>
                  <div class="comment-submit-row">
                    <span class="comment-hint"><kbd>Ctrl</kbd>+<kbd>Enter</kbd> to post &nbsp;·&nbsp; <kbd>@</kbd> to mention</span>
                    <button class="btn btn-primary btn-sm" onclick="submitComment(${task.id})">${icon('play', 13)} Post</button>
                  </div>
                </div>
                <div class="mention-dropdown" id="mention-dropdown" style="display:none;"></div>
              </div>
            </div>
          </div>
        </div>
        <div class="td-sidebar">
          <div class="td-sidebar-header">Details</div>
          <div class="td-prop">
            <div class="td-prop-label">Assignees</div>
            <div class="td-prop-value" id="assignees-prop">
              ${renderAssigneesProp(assignees, allMembers, task.id, canEdit)}
            </div>
          </div>
          <div class="td-prop">
            <div class="td-prop-label">Priority</div>
            <div class="td-prop-value">
              ${canEdit ? `
              <select class="form-control" style="font-size:.8rem;padding:4px 8px;height:auto;" onchange="updateTaskField(${task.id},'priority',this.value)">
                ${['low','medium','high','urgent'].map(p => `<option value="${p}" ${task.priority===p?'selected':''}>${p.charAt(0).toUpperCase()+p.slice(1)}</option>`).join('')}
              </select>` : priorityBadge(task.priority)}
            </div>
          </div>
          <div class="td-prop">
            <div class="td-prop-label">Due Date</div>
            <div class="td-prop-value">
              ${canEdit
                ? `<input class="form-control" type="date" value="${task.due_date||''}" style="font-size:.8rem;padding:4px 8px;height:auto;" onchange="updateTaskField(${task.id},'due_date',this.value)">`
                : (task.due_date
                    ? `<span style="color:${isPastDue(task.due_date)?'var(--danger)':'var(--text)'};">${formatDate(task.due_date)}</span>`
                    : `<span style="color:var(--text-dim);">No date</span>`)}
            </div>
          </div>
          <div class="td-prop">
            <div class="td-prop-label">Created by</div>
            <div class="td-prop-value">${escHtml(task.creator_name || '—')}</div>
          </div>
          <div class="td-prop">
            <div class="td-prop-label">Created</div>
            <div class="td-prop-value" style="color:var(--text-muted);">${liveTime(task.created_at)}</div>
          </div>
          <div class="td-prop">
            <div class="td-prop-label">Board</div>
            <div class="td-prop-value">
              <span style="cursor:pointer;text-decoration:underline;text-decoration-color:var(--border-focus);" onclick="navigateTo('board',${task.project_id})">${escHtml(task.project_name)}</span>
            </div>
          </div>
          <div class="td-timer-box">
            <div class="td-timer-label">Time Tracking</div>
            <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
              ${isTimerRunning
                ? `<button class="btn btn-danger btn-sm" onclick="stopTimerAndRefresh(${task.id})">${icon('square',14)} Stop</button>
                   <span class="timer-display" id="modal-timer" style="font-size:.9rem;color:var(--text);">--:--:--</span>`
                : `<button class="btn btn-success btn-sm" onclick="startTimerForTask(${task.id})">${icon('play',14)} Start</button>`}
              <span class="td-total-time">Total: ${formatDurationFull(totalSecs)}</span>
            </div>
          </div>
          ${canEdit && state.user?.role === 'admin' ? `
          <div class="td-danger-zone">
            <button class="btn btn-danger btn-sm w-full" onclick="deleteTaskConfirm(${task.id})">Delete Task</button>
          </div>` : ''}
        </div>
      </div>
    </div>
  `;

  state._taskDetailTask = task;
  state._currentTaskId = taskId;
  window._taskDetailMembers = allMembers;
  window._taskDetailAssignees = assignees;
  setupCommentComposer(taskId, allMembers);

  if (isTimerRunning && timerRes.timer) {
    const el = document.getElementById('modal-timer');
    if (el) {
      clearInterval(state._taskTimerInterval);
      state._taskTimerInterval = setInterval(() => {
        const s = Math.floor((Date.now() - new Date(timerRes.timer.start_time).getTime()) / 1000);
        if (el) el.textContent = formatDurationFull(s);
      }, 1000);
    }
  }

  if (state.socket) {
    state.socket.emit('join:task', taskId);
    const onCommentNew = ({ comment }) => {
      if (comment.user_id === state.user?.id) return;
      const list = document.getElementById('comments-list');
      if (!list) return;
      list.querySelector('[data-empty]')?.remove();
      const wrapper = document.createElement('div');
      wrapper.innerHTML = renderCommentItem(comment, state._taskDetailTask);
      list.appendChild(wrapper.firstElementChild);
      list.scrollTop = list.scrollHeight;
      updateCommentCount(1);
    };
    const onTypingUpdate = ({ userId, name, typing }) => {
      if (userId === state.user?.id) return;
      const indicator = document.getElementById('typing-indicator');
      if (!indicator) return;
      if (typing) {
        indicator.style.display = 'flex';
        indicator.innerHTML = `<div class="typing-dots"><span></span><span></span><span></span></div><span>${escHtml(name || 'Someone')} is typing…</span>`;
      } else {
        indicator.style.display = 'none';
        indicator.innerHTML = '';
      }
    };
    state.socket.on('comment:new', onCommentNew);
    state.socket.on('typing:update', onTypingUpdate);
    state._taskDetailListeners = { 'comment:new': onCommentNew, 'typing:update': onTypingUpdate };
  }

  if (window._injectTaskSections) await window._injectTaskSections(taskId);
}

function expandToFull(taskId) {
  closeTaskDetail();
  openTaskFull(taskId);
}

async function changeStatus(taskId, status, modalId = null) {
  try {
    await api.updateTaskStatus(taskId, status);
    toast('Status updated', 'success');
    if (modalId) {
      closeModal(modalId);
      await navigateTo(state.view, state.currentProjectId);
    } else if (state.view === 'task') {
      await openTaskFull(taskId);
    } else {
      await navigateTo(state.view, state.currentProjectId);
    }
  } catch (err) { toast(err.message, 'error'); }
}

async function reassignTask(taskId, userId) {
  try {
    await api.updateTask(taskId, { assigned_to: userId || null });
    toast('Assignee updated', 'success');
  } catch (err) { toast(err.message, 'error'); }
}

async function updateTaskField(taskId, field, value) {
  try {
    await api.updateTask(taskId, { [field]: value });
    toast('Updated', 'success');
  } catch (err) { toast(err.message, 'error'); }
}

// ── Multi-assignee support ────────────────────────────────────────────────
function renderAssigneesProp(assignees, allMembers, taskId, canEdit) {
  const chips = assignees.map(a => `
    <div class="assignee-chip" style="display:inline-flex;align-items:center;gap:4px;background:var(--bg-card);border:1px solid var(--border);border-radius:var(--r-full);padding:2px 8px 2px 2px;margin:2px;font-size:.78rem;">
      ${avatarHtml(a, 'avatar-sm')}
      <span>${escHtml(a.full_name)}</span>
      ${canEdit ? `<span style="cursor:pointer;color:var(--text-dim);margin-left:2px;font-size:.85rem;" onclick="removeAssignee(${taskId},${a.id})">✕</span>` : ''}
    </div>`).join('');
  const addBtn = canEdit ? `
    <button class="avatar avatar-sm" style="background:var(--bg-card);border:1.5px dashed var(--border);color:var(--text-dim);font-size:1rem;cursor:pointer;flex-shrink:0;" onclick="openAssigneePicker(${taskId})" title="Add assignee">+</button>` : '';
  if (assignees.length === 0 && !canEdit) return `<span style="color:var(--text-dim);">Unassigned</span>`;
  return `<div style="display:flex;flex-wrap:wrap;align-items:center;gap:4px;">${chips}${addBtn}</div>`;
}

function openAssigneePicker(taskId) {
  const allMembers = window._taskDetailMembers || [];
  const currentAssignees = window._taskDetailAssignees || [];
  const currentIds = new Set(currentAssignees.map(a => a.id));

  const available = allMembers.filter(m => !currentIds.has(m.id));
  if (!available.length) { toast('All members already assigned', 'info'); return; }

  openModal('assignee-picker-modal', `
    <div style="padding:20px;">
      <div style="font-weight:600;margin-bottom:12px;font-size:.95rem;">Add Assignee</div>
      <div style="display:flex;flex-direction:column;gap:6px;max-height:280px;overflow-y:auto;">
        ${available.map(m => `
          <div class="mention-item" onclick="addAssignee(${taskId},${m.id})" style="cursor:pointer;padding:8px 10px;border-radius:var(--r-md);">
            ${avatarHtml(m, 'avatar-sm')} <span>${escHtml(m.full_name)}</span>
          </div>`).join('')}
      </div>
    </div>`);
}

async function addAssignee(taskId, userId) {
  closeModal('assignee-picker-modal');
  const current = (window._taskDetailAssignees || []).map(a => a.id);
  if (current.includes(userId)) return;
  const newIds = [...current, userId];
  try {
    await api.updateAssignees(taskId, newIds);
    // Refresh the prop display
    const allMembers = window._taskDetailMembers || [];
    const newAssignees = newIds.map(id => allMembers.find(m => m.id === id)).filter(Boolean);
    window._taskDetailAssignees = newAssignees;
    const prop = document.getElementById('assignees-prop');
    if (prop) prop.innerHTML = renderAssigneesProp(newAssignees, allMembers, taskId, true);
    toast('Assignee added', 'success');
  } catch (err) { toast(err.message, 'error'); }
}

async function removeAssignee(taskId, userId) {
  const current = (window._taskDetailAssignees || []).map(a => a.id).filter(id => id !== userId);
  try {
    await api.updateAssignees(taskId, current);
    const allMembers = window._taskDetailMembers || [];
    const newAssignees = current.map(id => allMembers.find(m => m.id === id)).filter(Boolean);
    window._taskDetailAssignees = newAssignees;
    const prop = document.getElementById('assignees-prop');
    if (prop) prop.innerHTML = renderAssigneesProp(newAssignees, allMembers, taskId, true);
    toast('Assignee removed', 'info');
  } catch (err) { toast(err.message, 'error'); }
}

async function startTimerForTask(taskId) {
  try {
    await api.startTimer(taskId);
    toast('Timer started ▶', 'success');
    await checkActiveTimer();
    // Update timer box in place — no redirect
    const box = document.querySelector('#task-detail-modal .td-timer-box');
    if (box) {
      const startTime = new Date().toISOString();
      box.innerHTML = `
        <div class="td-timer-label">Time Tracking</div>
        <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
          <button class="btn btn-danger btn-sm" onclick="stopTimerAndRefresh(${taskId})">${icon('square',14)} Stop</button>
          <span class="timer-display" id="modal-timer" style="font-size:.9rem;color:var(--text);">00:00:00</span>
          <span class="td-total-time">Timer running</span>
        </div>`;
      const el = document.getElementById('modal-timer');
      if (el) {
        clearInterval(state._taskTimerInterval);
        state._taskTimerInterval = setInterval(() => {
          const s = Math.floor((Date.now() - new Date(startTime).getTime()) / 1000);
          if (document.getElementById('modal-timer')) el.textContent = formatDurationFull(s);
        }, 1000);
      }
    }
  } catch (err) { toast(err.message, 'error'); }
}

async function stopTimerAndRefresh(taskId) {
  await stopTimer();
  closeTaskDetail();
  openTaskDetail(taskId);
}

async function stopTimer() {
  try {
    await api.stopTimer();
    if (state.timerInterval) { clearInterval(state.timerInterval); state.timerInterval = null; }
    state.activeTimer = null;
    updateTimerStatus();
    toast('Timer stopped', 'info');
  } catch (err) { toast(err.message, 'error'); }
}

// ──────────────────────────────────────────────
// MARKDOWN RENDERER (XSS-safe)
// ──────────────────────────────────────────────
function renderMarkdown(text) {
  const blocks = [];
  let s = text
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  // Stash code blocks
  s = s.replace(/```([\s\S]*?)```/g, (_, c) => {
    blocks.push(`<pre><code>${c.trim()}</code></pre>`);
    return `\x00${blocks.length - 1}\x00`;
  });
  s = s.replace(/`([^`\n]+)`/g, '<code>$1</code>');
  s = s.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  s = s.replace(/\*(.+?)\*/g, '<em>$1</em>');
  s = s.replace(/@([A-Za-z][a-zA-Z]*(?:\s[A-Za-z][a-zA-Z]*)?)(?=[^a-zA-Z]|$)/g, '<span class="md-mention">@$1</span>');
  s = s.replace(/^[*-] (.+)$/gm, '<li>$1</li>');
  s = s.replace(/(<li>[\s\S]*?<\/li>)/g, '<ul>$1</ul>');
  s = s.replace(/\n/g, '<br>');
  s = s.replace(/\x00(\d+)\x00/g, (_, i) => blocks[+i]);
  return s;
}

// ──────────────────────────────────────────────
// COMMENT FEED RENDERERS
// ──────────────────────────────────────────────
function renderCommentItem(c, task) {
  const isOwn = c.user_id === state.user?.id;
  const isAdmin = state.user?.role === 'admin';
  const canModify = isOwn || isAdmin;
  const canPin = isAdmin || (task && task.created_by === state.user?.id);
  const taskId = c.task_id || task?.id;
  const hasActions = canModify || canPin;

  const reactionsHtml = (c.reactions || []).map(r =>
    `<button class="reaction-badge ${r.reacted ? 'reacted' : ''}" onclick="reactToComment(${taskId},${c.id},'${r.emoji}')">${r.emoji} <span class="r-count">${r.count}</span></button>`
  ).join('');

  return `
    <div class="comment" id="comment-${c.id}">
      ${avatarHtml(c, 'avatar-sm')}
      <div class="comment-bubble ${c.is_pinned ? 'is-pinned' : ''}" style="flex:1;">
        ${c.is_pinned ? `<div class="comment-pin-badge">📌 Pinned</div>` : ''}
        <div class="comment-header">
          <span class="comment-author">${escHtml(c.full_name || '')}</span>
          <span class="comment-time">${liveTime(c.created_at)}</span>
          ${c.edited_at ? `<span class="comment-edited">(edited)</span>` : ''}
        </div>
        <div class="comment-text" id="comment-text-${c.id}">${renderMarkdown(c.content)}</div>
        <div id="comment-edit-${c.id}" style="display:none;">
          <div class="comment-edit-area">
            <textarea id="comment-edit-input-${c.id}">${escHtml(c.content)}</textarea>
            <div class="comment-edit-actions">
              <button class="btn btn-sm" onclick="cancelEditComment(${c.id})">Cancel</button>
              <button class="btn btn-primary btn-sm" onclick="saveEditComment(${taskId},${c.id})">Save</button>
            </div>
          </div>
        </div>
        <div style="position:relative;">
          <div class="reaction-bar">
            ${reactionsHtml}
            <button class="reaction-add-btn" onclick="toggleEmojiPicker(event,${taskId},${c.id})" title="Add reaction">😊</button>
          </div>
          <div id="emoji-picker-${c.id}" style="display:none;position:absolute;z-index:999;bottom:calc(100%+4px);left:0;">
            <div class="emoji-picker">
              ${['👍','❤️','🎉','😂','🚀','👀','😮','🙌'].map(e =>
                `<button class="emoji-btn" onclick="reactToComment(${taskId},${c.id},'${e}');toggleEmojiPicker(event,${taskId},${c.id})">${e}</button>`
              ).join('')}
            </div>
          </div>
        </div>
        ${hasActions ? `
        <button class="comment-menu-btn" onclick="toggleCommentMenu(event,${c.id})" title="Options">⋯</button>
        <div class="comment-dropdown" id="comment-menu-${c.id}" style="display:none;">
          ${isOwn ? `<div class="comment-dropdown-item" onclick="startEditComment(${c.id})">✏️ Edit</div>` : ''}
          ${canPin ? `<div class="comment-dropdown-item" onclick="pinCommentBtn(${taskId},${c.id})">${c.is_pinned ? '📌 Unpin' : '📌 Pin'}</div>` : ''}
          ${canModify ? `<div class="comment-dropdown-item danger" onclick="confirmDeleteComment(${taskId},${c.id})">🗑 Delete</div>` : ''}
        </div>` : ''}
      </div>
    </div>`;
}

function renderActivityItem(item) {
  let details = {};
  try { details = item.details ? JSON.parse(item.details) : {}; } catch {}
  const actionMap = {
    task_created: 'created this task',
    task_updated: `updated this task${details.field ? ' (' + escHtml(details.field) + ')' : ''}`,
    status_changed: `changed status to <em>${escHtml(details.to || '')}</em>`,
    assigned: `assigned this task to <em>${escHtml(details.to || 'someone')}</em>`,
    comment_added: 'added a comment',
    comment_deleted: 'deleted a comment',
  };
  const label = actionMap[item.action] || escHtml(item.action.replace(/_/g, ' '));
  return `
    <div class="activity-item">
      <div class="activity-icon">◎</div>
      <div>
        <div class="activity-text"><strong>${escHtml(item.full_name || 'Someone')}</strong> ${label}</div>
        <div class="activity-time">${liveTime(item.created_at)}</div>
      </div>
    </div>`;
}

// ──────────────────────────────────────────────
// COMMENT COMPOSER SETUP
// ──────────────────────────────────────────────
function setupCommentComposer(taskId, members) {
  const ta = document.getElementById('comment-input');
  if (!ta) return;

  ta.addEventListener('input', () => {
    ta.style.height = 'auto';
    ta.style.height = Math.min(ta.scrollHeight, 200) + 'px';
    handleMentionInput(ta, members);
  });

  ta.addEventListener('keydown', (e) => {
    if (isMentionDropdownVisible()) {
      if (e.key === 'ArrowDown') { e.preventDefault(); moveMentionSelection(1); return; }
      if (e.key === 'ArrowUp')   { e.preventDefault(); moveMentionSelection(-1); return; }
      if (e.key === 'Enter')     { e.preventDefault(); selectActiveMention(); return; }
      if (e.key === 'Escape')    { hideMentionDropdown(); return; }
    }
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      submitComment(taskId);
      return;
    }
    // Typing indicator
    if (state.socket && state._currentTaskId) {
      state.socket.emit('typing:start', { taskId: state._currentTaskId, name: state.user?.full_name });
      clearTimeout(state._typingTimeout);
      state._typingTimeout = setTimeout(() => {
        state.socket?.emit('typing:stop', { taskId: state._currentTaskId });
      }, 1500);
    }
  });
}

// ──────────────────────────────────────────────
// MENTION AUTOCOMPLETE
// ──────────────────────────────────────────────
function handleMentionInput(ta, members) {
  const pos = ta.selectionStart;
  const before = ta.value.slice(0, pos);
  const atMatch = before.match(/@(\w*)$/);
  if (!atMatch) { hideMentionDropdown(); return; }
  const q = atMatch[1].toLowerCase();
  const filtered = (members || []).filter(m =>
    m.full_name.toLowerCase().includes(q) || (m.email || '').toLowerCase().includes(q)
  ).slice(0, 6);
  const dropdown = document.getElementById('mention-dropdown');
  if (!dropdown || filtered.length === 0) { hideMentionDropdown(); return; }
  dropdown.innerHTML = filtered.map((m, i) =>
    `<div class="mention-item ${i === 0 ? 'active' : ''}" data-name="${escHtml(m.full_name)}" onmousedown="event.preventDefault();insertMention('${escHtml(m.full_name).replace(/'/g, "\\'")}')">
      ${avatarHtml(m, 'avatar-sm')} <span>${escHtml(m.full_name)}</span>
    </div>`
  ).join('');
  dropdown.style.display = 'block';
}

function hideMentionDropdown() {
  const d = document.getElementById('mention-dropdown');
  if (d) d.style.display = 'none';
}
function isMentionDropdownVisible() {
  return document.getElementById('mention-dropdown')?.style.display !== 'none';
}
function moveMentionSelection(dir) {
  const items = document.querySelectorAll('#mention-dropdown .mention-item');
  if (!items.length) return;
  let idx = Array.from(items).findIndex(el => el.classList.contains('active'));
  items[idx]?.classList.remove('active');
  idx = (idx + dir + items.length) % items.length;
  items[idx]?.classList.add('active');
}
function selectActiveMention() {
  document.querySelector('#mention-dropdown .mention-item.active')?.click();
}
function insertMention(name) {
  const ta = document.getElementById('comment-input');
  if (!ta) return;
  const pos = ta.selectionStart;
  const val = ta.value;
  const before = val.slice(0, pos);
  const atIdx = before.lastIndexOf('@');
  ta.value = val.slice(0, atIdx) + '@' + name + ' ' + val.slice(pos);
  const newPos = atIdx + name.length + 2;
  ta.setSelectionRange(newPos, newPos);
  ta.focus();
  hideMentionDropdown();
}

// ──────────────────────────────────────────────
// FORMAT TOOLBAR
// ──────────────────────────────────────────────
function applyFormat(type) {
  const ta = document.getElementById('comment-input');
  if (!ta) return;
  const s = ta.selectionStart, e = ta.selectionEnd;
  const sel = ta.value.slice(s, e);
  let insert = '', cursor = 0;
  switch (type) {
    case 'bold':      insert = `**${sel||'bold text'}**`;            cursor = sel ? insert.length : 2; break;
    case 'italic':    insert = `*${sel||'italic'}*`;                 cursor = sel ? insert.length : 1; break;
    case 'code':      insert = `\`${sel||'code'}\``;                 cursor = sel ? insert.length : 1; break;
    case 'codeblock': insert = `\`\`\`\n${sel||'code here'}\n\`\`\``; cursor = sel ? insert.length : 4; break;
    case 'list':      insert = `\n- ${sel||'item'}`;                 cursor = insert.length; break;
  }
  ta.value = ta.value.slice(0, s) + insert + ta.value.slice(e);
  const newPos = s + (sel ? insert.length : cursor);
  ta.setSelectionRange(newPos, newPos);
  ta.focus();
  ta.dispatchEvent(new Event('input'));
}

// ──────────────────────────────────────────────
// COMMENT ACTIONS
// ──────────────────────────────────────────────
async function submitComment(taskId) {
  const ta = document.getElementById('comment-input');
  if (!ta?.value?.trim()) return;
  const content = ta.value.trim();
  try {
    const { comment } = await api.addComment(taskId, content);
    ta.value = '';
    ta.style.height = 'auto';
    if (state.socket && state._currentTaskId) {
      state.socket.emit('typing:stop', { taskId: state._currentTaskId });
    }
    const list = document.getElementById('comments-list');
    if (list) {
      list.querySelector('[data-empty]')?.remove();
      const wrapper = document.createElement('div');
      wrapper.innerHTML = renderCommentItem(
        { ...comment, full_name: state.user.full_name, avatar: state.user.avatar, reactions: [], is_pinned: 0, edited_at: null },
        state._taskDetailTask
      );
      list.appendChild(wrapper.firstElementChild);
      list.scrollTop = list.scrollHeight;
      updateCommentCount(1);
    }
  } catch (err) { toast(err.message, 'error'); }
}

function updateCommentCount(delta) {
  const badge = document.getElementById('comment-count-badge');
  if (!badge) return;
  const m = badge.textContent.match(/\d+/);
  if (m) badge.textContent = `(${Math.max(0, parseInt(m[0]) + delta)})`;
}

function toggleCommentMenu(event, commentId) {
  event.stopPropagation();
  const menu = document.getElementById(`comment-menu-${commentId}`);
  if (!menu) return;
  const wasVisible = menu.style.display !== 'none';
  document.querySelectorAll('.comment-dropdown').forEach(m => m.style.display = 'none');
  if (!wasVisible) {
    menu.style.display = 'block';
    setTimeout(() => document.addEventListener('click', function handler(e) {
      if (!menu.contains(e.target)) { menu.style.display = 'none'; document.removeEventListener('click', handler); }
    }), 0);
  }
}

function startEditComment(commentId) {
  document.getElementById(`comment-menu-${commentId}`)?.style && (document.getElementById(`comment-menu-${commentId}`).style.display = 'none');
  const commentText = document.getElementById(`comment-text-${commentId}`);
  const commentEdit = document.getElementById(`comment-edit-${commentId}`);
  if (commentText) commentText.style.display = 'none';
  if (commentEdit) commentEdit.style.display = 'block';
  const ta = document.getElementById(`comment-edit-input-${commentId}`);
  if (ta) { ta.focus(); ta.setSelectionRange(ta.value.length, ta.value.length); }
}

function cancelEditComment(commentId) {
  const commentText = document.getElementById(`comment-text-${commentId}`);
  const commentEdit = document.getElementById(`comment-edit-${commentId}`);
  if (commentText) commentText.style.display = '';
  if (commentEdit) commentEdit.style.display = 'none';
}

async function saveEditComment(taskId, commentId) {
  const ta = document.getElementById(`comment-edit-input-${commentId}`);
  if (!ta?.value?.trim()) return;
  try {
    const { comment } = await api.editComment(taskId, commentId, ta.value.trim());
    document.getElementById(`comment-text-${commentId}`).innerHTML = renderMarkdown(comment.content);
    const header = document.querySelector(`#comment-${commentId} .comment-header`);
    if (header && !header.querySelector('.comment-edited')) {
      header.insertAdjacentHTML('beforeend', '<span class="comment-edited">(edited)</span>');
    }
    cancelEditComment(commentId);
    toast('Comment updated', 'success');
  } catch (err) { toast(err.message, 'error'); }
}

async function confirmDeleteComment(taskId, commentId) {
  const menu = document.getElementById(`comment-menu-${commentId}`);
  if (menu) menu.style.display = 'none';
  if (!confirm('Delete this comment?')) return;
  try {
    await api.deleteComment(taskId, commentId);
    document.getElementById(`comment-${commentId}`)?.remove();
    updateCommentCount(-1);
    toast('Comment deleted', 'info');
  } catch (err) { toast(err.message, 'error'); }
}

function toggleEmojiPicker(event, taskId, commentId) {
  event.stopPropagation();
  const picker = document.getElementById(`emoji-picker-${commentId}`);
  if (!picker) return;
  const wasVisible = picker.style.display !== 'none';
  document.querySelectorAll('[id^="emoji-picker-"]').forEach(p => p.style.display = 'none');
  if (!wasVisible) {
    picker.style.display = 'block';
    setTimeout(() => document.addEventListener('click', function handler(e) {
      if (!picker.contains(e.target)) { picker.style.display = 'none'; document.removeEventListener('click', handler); }
    }), 0);
  }
}

async function reactToComment(taskId, commentId, emoji) {
  try {
    const { reactions } = await api.toggleReaction(taskId, commentId, emoji);
    const bar = document.querySelector(`#comment-${commentId} .reaction-bar`);
    if (bar) {
      const addBtn = bar.querySelector('.reaction-add-btn');
      bar.innerHTML = (reactions || []).map(r =>
        `<button class="reaction-badge ${r.reacted ? 'reacted' : ''}" onclick="reactToComment(${taskId},${commentId},'${r.emoji}')">${r.emoji} <span class="r-count">${r.count}</span></button>`
      ).join('') + (addBtn ? addBtn.outerHTML : '');
    }
  } catch (err) { toast(err.message, 'error'); }
}

async function pinCommentBtn(taskId, commentId) {
  const menu = document.getElementById(`comment-menu-${commentId}`);
  if (menu) menu.style.display = 'none';
  try {
    const { comment } = await api.pinComment(taskId, commentId);
    const bubble = document.querySelector(`#comment-${commentId} .comment-bubble`);
    if (bubble) {
      bubble.classList.toggle('is-pinned', !!comment.is_pinned);
      const existing = bubble.querySelector('.comment-pin-badge');
      if (comment.is_pinned && !existing) {
        bubble.insertAdjacentHTML('afterbegin', '<div class="comment-pin-badge">📌 Pinned</div>');
      } else if (!comment.is_pinned && existing) {
        existing.remove();
      }
    }
    toast(comment.is_pinned ? 'Comment pinned' : 'Comment unpinned', 'success');
  } catch (err) { toast(err.message, 'error'); }
}

function closeTaskDetail() {
  if (state.socket) {
    if (state._currentTaskId) state.socket.emit('leave:task', state._currentTaskId);
    if (state._taskDetailListeners) {
      for (const [ev, fn] of Object.entries(state._taskDetailListeners)) {
        state.socket.off(ev, fn);
      }
    }
  }
  if (state._typingTimeout) { clearTimeout(state._typingTimeout); state._typingTimeout = null; }
  clearInterval(state._taskTimerInterval); state._taskTimerInterval = null;
  clearInterval(state._ttTimerInterval); state._ttTimerInterval = null;
  state._currentTaskId = null;
  state._taskDetailTask = null;
  state._taskDetailListeners = null;
  closeModal('task-detail-modal');
}

async function deleteTaskConfirm(taskId) {
  if (!confirm('Delete this task permanently?')) return;
  try {
    await api.deleteTask(taskId);
    closeTaskDetail();
    toast('Task deleted', 'info');
    await navigateTo(state.view, state.currentProjectId);
  } catch (err) { toast(err.message, 'error'); }
}

// ──────────────────────────────────────────────
// CREATE TASK MODAL
// ──────────────────────────────────────────────
async function openCreateTask(projectId = null, defaultStatus = 'todo') {
  const members = await loadAllTeamForModal();
  const projects = state.projects;

  openModal('create-task-modal', `
    <div class="modal-header">
      <div class="modal-title">Create New Task</div>
      <button class="modal-close" onclick="closeModal('create-task-modal')">✕</button>
    </div>
    <div class="modal-body">
      <form id="create-task-form">
        <div class="form-group">
          <label class="form-label">Title *</label>
          <input class="form-control" id="task-title" placeholder="What needs to be done?" required autofocus>
        </div>
        <div class="form-group">
          <label class="form-label">Description</label>
          <textarea class="form-control" id="task-desc" placeholder="Add more details…"></textarea>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label class="form-label">Board *</label>
            <select class="form-control" id="task-project" required>
              <option value="">Select board…</option>
              ${projects.map(p => `<option value="${p.id}" ${p.id == projectId ? 'selected' : ''}>${p.name}</option>`).join('')}
            </select>
          </div>
          <div class="form-group">
            <label class="form-label">Status</label>
            <select class="form-control" id="task-status">
              <option value="todo" ${defaultStatus==='todo'?'selected':''}>To Do</option>
              <option value="in_progress" ${defaultStatus==='in_progress'?'selected':''}>In Progress</option>
              <option value="review" ${defaultStatus==='review'?'selected':''}>Review</option>
              <option value="done" ${defaultStatus==='done'?'selected':''}>Done</option>
              <option value="blocked" ${defaultStatus==='blocked'?'selected':''}>Blocked</option>
            </select>
          </div>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label class="form-label">Priority</label>
            <select class="form-control" id="task-priority">
              <option value="low">Low</option>
              <option value="medium" selected>Medium</option>
              <option value="high">High</option>
              <option value="urgent">Urgent</option>
            </select>
          </div>
          <div class="form-group">
            <label class="form-label">Due Date</label>
            <input class="form-control" type="date" id="task-due">
          </div>
        </div>
        <div class="form-group">
          <label class="form-label">Assign To</label>
          <select class="form-control" id="task-assign">
            <option value="">Unassigned</option>
            ${members.map(m => `<option value="${m.id}">${m.full_name}</option>`).join('')}
          </select>
        </div>
        <div id="create-task-error" class="form-error mb-3"></div>
      </form>
    </div>
    <div class="modal-footer">
      <button class="btn btn-secondary" onclick="closeModal('create-task-modal')">Cancel</button>
      <button class="btn btn-primary" onclick="submitCreateTask()">Create Task</button>
    </div>`);
}

async function submitCreateTask() {
  const btn = document.querySelector('#create-task-modal .btn-primary');
  btn.disabled = true; btn.innerHTML = '<span class="spinner"></span>';
  try {
    await api.createTask({
      title: document.getElementById('task-title').value,
      description: document.getElementById('task-desc').value,
      project_id: parseInt(document.getElementById('task-project').value),
      status: document.getElementById('task-status').value,
      priority: document.getElementById('task-priority').value,
      due_date: document.getElementById('task-due').value || null,
      assigned_to: parseInt(document.getElementById('task-assign').value) || null,
    });
    closeModal('create-task-modal');
    toast('Task created!', 'success');
    await navigateTo(state.view, state.currentProjectId);
  } catch (err) {
    document.getElementById('create-task-error').textContent = err.message;
    btn.disabled = false; btn.innerHTML = 'Create Task';
  }
}

// ──────────────────────────────────────────────
// CREATE BOARD
// ──────────────────────────────────────────────
function openCreateProject() {
  const colors = ['#6C5CE7','#00CEC9','#00B894','#FDCB6E','#E17055','#74B9FF','#A29BFE','#FD79A8','#55EFC4','#636E72'];
  openModal('create-project-modal', `
    <div class="modal-header">
      <div class="modal-title">Create New Board</div>
      <button class="modal-close" onclick="closeModal('create-project-modal')">✕</button>
    </div>
    <div class="modal-body">
      <form id="create-project-form">
        <div class="form-group">
          <label class="form-label">Board Name *</label>
          <input class="form-control" id="proj-name" placeholder="e.g. Website Redesign" required autofocus>
        </div>
        <div class="form-group">
          <label class="form-label">Description</label>
          <textarea class="form-control" id="proj-desc" placeholder="What's this board about?"></textarea>
        </div>
        <div class="form-group">
          <label class="form-label">Color</label>
          <div class="color-picker" id="color-picker">
            ${colors.map((c, i) => `<div class="color-option ${i===0?'selected':''}" style="background:${c}" data-color="${c}" onclick="selectColor(this,'${c}')"></div>`).join('')}
          </div>
          <input type="hidden" id="proj-color" value="${colors[0]}">
        </div>
        <div id="create-proj-error" class="form-error mb-3"></div>
      </form>
    </div>
    <div class="modal-footer">
      <button class="btn btn-secondary" onclick="closeModal('create-project-modal')">Cancel</button>
      <button class="btn btn-primary" onclick="submitCreateProject()">Create Board</button>
    </div>`);
}

function selectColor(el, color) {
  document.querySelectorAll('.color-option').forEach(e => e.classList.remove('selected'));
  el.classList.add('selected');
  document.getElementById('proj-color').value = color;
}

async function submitCreateProject() {
  const btn = document.querySelector('#create-project-modal .btn-primary');
  btn.disabled = true; btn.innerHTML = '<span class="spinner"></span>';
  try {
    const { project } = await api.createProject({
      name: document.getElementById('proj-name').value,
      description: document.getElementById('proj-desc').value,
      color: document.getElementById('proj-color').value,
    });
    closeModal('create-project-modal');
    toast(`Board "${project.name}" created!`, 'success');
    await loadProjects();
    navigateTo('board', project.id);
  } catch (err) {
    document.getElementById('create-proj-error').textContent = err.message;
    btn.disabled = false; btn.innerHTML = 'Create Board';
  }
}

async function openManageProject(projectId) {
  const { project, members } = await api.getProject(projectId);

  openModal('manage-project-modal', `
    <div class="modal-header">
      <div class="modal-title">${icon('settings',16)} Board Settings</div>
      <button class="modal-close" onclick="closeModal('manage-project-modal')">✕</button>
    </div>
    <div class="modal-body">
      <div class="form-group">
        <label class="form-label">Board Name</label>
        <input class="form-control" id="edit-proj-name" value="${escHtml(project.name)}" autofocus>
      </div>
      <div class="form-group">
        <label class="form-label">Description</label>
        <textarea class="form-control" id="edit-proj-desc" rows="3">${escHtml(project.description||'')}</textarea>
      </div>
      <div class="divider"></div>
      <div style="display:flex;justify-content:space-between;align-items:center;">
        <button class="btn btn-danger btn-sm" onclick="deleteProjectConfirm(${projectId})">Archive Board</button>
        <div style="font-size:.78rem;color:var(--text-dim);">
          ${members.length} member${members.length !== 1 ? 's' : ''} ·
          <span style="cursor:pointer;color:var(--accent);" onclick="closeModal('manage-project-modal');openShareBoard(${projectId})">Manage access →</span>
        </div>
      </div>
    </div>
    <div class="modal-footer">
      <button class="btn btn-secondary" onclick="closeModal('manage-project-modal')">Cancel</button>
      <button class="btn btn-primary" onclick="saveProjectEdit(${projectId})">Save Changes</button>
    </div>`);
}

async function openShareBoard(projectId) {
  const { project, members } = await api.getProject(projectId);
  const allUsers = await loadAllTeamForModal();
  const memberIds = new Set(members.map(m => m.id));

  openModal('share-board-modal', `
    <div class="modal-header">
      <div style="display:flex;align-items:center;gap:10px;">
        <div style="width:10px;height:10px;border-radius:50%;background:${project.color};flex-shrink:0;"></div>
        <div class="modal-title">Share "${escHtml(project.name)}"</div>
      </div>
      <button class="modal-close" onclick="closeModal('share-board-modal')">✕</button>
    </div>
    <div class="modal-body">
      <p style="font-size:.84rem;color:var(--text-muted);margin-bottom:16px;">
        ${icon('info',14,'vertical-align:middle;margin-right:4px;')}
        Only members can view this board and its tasks. Toggle access below.
      </p>
      <div style="display:flex;flex-direction:column;gap:8px;max-height:360px;overflow-y:auto;">
        ${allUsers.map(u => {
          const has = memberIds.has(u.id);
          return `
          <div class="share-member-row ${has ? 'share-member-active' : ''}">
            ${avatarHtml(u, 'avatar-sm')}
            <div style="flex:1;min-width:0;">
              <div style="font-size:.875rem;font-weight:600;color:var(--text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${escHtml(u.full_name)}</div>
              <div style="font-size:.72rem;color:var(--text-muted);">${escHtml(u.email)}</div>
            </div>
            <span class="role-badge role-${u.role}" style="flex-shrink:0;">${u.role}</span>
            <label class="share-toggle" title="${has ? 'Remove access' : 'Grant access'}">
              <input type="checkbox" ${has ? 'checked' : ''} onchange="toggleMember(${projectId}, ${u.id}, this.checked);this.closest('.share-member-row').classList.toggle('share-member-active',this.checked)">
              <span class="share-toggle-track"></span>
            </label>
          </div>`;
        }).join('')}
      </div>
    </div>
    <div class="modal-footer">
      <button class="btn btn-primary" onclick="closeModal('share-board-modal')">Done</button>
    </div>`);
}

async function toggleMember(projectId, userId, add) {
  try {
    if (add) await api.addMember(projectId, userId);
    else await api.removeMember(projectId, userId);
  } catch (err) { toast(err.message, 'error'); }
}

async function saveProjectEdit(projectId) {
  try {
    await api.updateProject(projectId, {
      name: document.getElementById('edit-proj-name').value,
      description: document.getElementById('edit-proj-desc').value,
    });
    toast('Board updated', 'success');
    closeModal('manage-project-modal');
    await loadProjects();
    await navigateTo('board', projectId);
  } catch (err) { toast(err.message, 'error'); }
}

async function deleteProjectConfirm(projectId) {
  if (!confirm('Archive this board and all its tasks?')) return;
  try {
    await api.deleteProject(projectId);
    closeModal('manage-project-modal');
    toast('Board archived', 'info');
    await loadProjects();
    navigateTo('dashboard');
  } catch (err) { toast(err.message, 'error'); }
}

// ──────────────────────────────────────────────
// TIME TRACKING
// ──────────────────────────────────────────────
async function renderTimeTracking() {
  const [timerRes, logsRes] = await Promise.all([api.getActiveTimer(), api.getMyTimeLogs(7)]);
  const { logs, total_seconds } = logsRes;

  // Group by date
  const grouped = {};
  logs.forEach(l => {
    const d = l.start_time.split('T')[0];
    if (!grouped[d]) grouped[d] = [];
    grouped[d].push(l);
  });

  document.getElementById('main-content').innerHTML = `
    <div class="page-header">
      <div>
        <div class="page-title">Time Tracking</div>
        <div class="page-subtitle">Last 7 days · Total: ${formatDurationFull(total_seconds)}</div>
      </div>
    </div>

    ${timerRes.timer ? `
    <div class="timer-widget mb-4">
      <div>${icon('play-circle', 28, 'color:#fff;opacity:.8')}</div>
      <div class="timer-info">
        <div style="font-size:.7rem;color:rgba(255,255,255,.6);text-transform:uppercase;letter-spacing:.5px;">Currently tracking</div>
        <div class="timer-task">${timerRes.timer.task_title}</div>
        <div class="timer-project">${timerRes.timer.project_name}</div>
      </div>
      <div class="timer-display" id="tt-timer">--:--:--</div>
      <button class="btn btn-secondary" onclick="stopTimer().then(()=>navigateTo('time-tracking'))">${icon('square',16)} Stop</button>
    </div>` : `
    <div class="card mb-4">
      <div style="display:flex;align-items:center;gap:12px;">
        ${icon('clock', 20, 'color:var(--text-muted)')}
        <div style="flex:1;font-size:.875rem;color:var(--text-muted);">No active timer. Start tracking from a task.</div>
        <button class="btn btn-primary btn-sm" onclick="openStartTimerPicker()">Start Timer</button>
      </div>
    </div>`}

    <div class="card">
      <div class="card-header">
        <div class="card-title">Recent Time Logs</div>
      </div>
      ${logs.length === 0 ? emptyState('⏱️', 'No time logs yet', 'Start a timer on any task to track time') : `
      ${Object.entries(grouped).sort(([a],[b]) => b.localeCompare(a)).map(([date, dayLogs]) => {
        const dayTotal = dayLogs.reduce((s, l) => s + (l.duration_seconds || 0), 0);
        return `
        <div style="margin-bottom:20px;">
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;">
            <div style="font-size:.8rem;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:var(--text-dim);">${formatDateFull(date)}</div>
            <div style="font-size:.8rem;font-weight:700;color:var(--primary-light);">${formatDurationFull(dayTotal)}</div>
          </div>
          ${dayLogs.map(l => `
          <div style="display:flex;align-items:center;gap:12px;padding:10px 0;border-bottom:1px solid var(--border);">
            <div style="flex:1;min-width:0;">
              <div style="font-size:.875rem;font-weight:600;color:var(--text);">${escHtml(l.task_title)}</div>
              <div style="font-size:.75rem;color:var(--text-muted);">${l.project_name}</div>
            </div>
            <div style="font-size:.8rem;color:var(--text-muted);">${formatTime(l.start_time)} – ${l.end_time ? formatTime(l.end_time) : 'running'}</div>
            <div style="font-size:.875rem;font-weight:700;color:var(--text);min-width:60px;text-align:right;">${formatDurationFull(l.duration_seconds || 0)}</div>
          </div>`).join('')}
        </div>`;
      }).join('')}`}
    </div>`;

  if (timerRes.timer) {
    const el = document.getElementById('tt-timer');
    if (el) {
      clearInterval(state._ttTimerInterval);
      state._ttTimerInterval = setInterval(() => {
        const s = Math.floor((Date.now() - new Date(timerRes.timer.start_time).getTime()) / 1000);
        if (el) el.textContent = formatDurationFull(s);
      }, 1000);
    }
  }
}

async function openStartTimerPicker() {
  const { tasks } = await api.getMyTasks();
  const notDone = tasks.filter(t => t.status !== 'done');
  openModal('start-timer-modal', `
    <div class="modal-header">
      <div class="modal-title">Start Timer</div>
      <button class="modal-close" onclick="closeModal('start-timer-modal')">✕</button>
    </div>
    <div class="modal-body">
      <div class="form-group">
        <label class="form-label">Select Task</label>
        <select class="form-control" id="timer-task-select">
          <option value="">Choose a task…</option>
          ${notDone.map(t => `<option value="${t.id}">[${t.project_name}] ${t.title}</option>`).join('')}
        </select>
      </div>
    </div>
    <div class="modal-footer">
      <button class="btn btn-secondary" onclick="closeModal('start-timer-modal')">Cancel</button>
      <button class="btn btn-primary" onclick="startTimerFromPicker()">Start Timer</button>
    </div>`);
}

async function startTimerFromPicker() {
  const taskId = document.getElementById('timer-task-select').value;
  if (!taskId) { toast('Select a task', 'warning'); return; }
  await startTimerForTask(parseInt(taskId));
  closeModal('start-timer-modal');
  navigateTo('time-tracking');
}

// ──────────────────────────────────────────────
// TEAM
// ──────────────────────────────────────────────
// ──────────────────────────────────────────────
// MESSAGES / CHAT
// ──────────────────────────────────────────────
async function renderMessages(activeChannelId = null) {
  const main = document.getElementById('main-content');
  const { channels } = await api.getChannels().catch(() => ({ channels: [] }));
  let { users } = await api.getUsers().catch(() => ({ users: [] }));

  const currentChannel = activeChannelId
    ? channels.find(c => c.id === activeChannelId) || channels[0]
    : channels[0];

  main.innerHTML = `
    <div class="page-header">
      <div>
        <div class="page-title">Messages</div>
        <div class="page-subtitle">Team chat &amp; direct messages</div>
      </div>
      <div style="display:flex;gap:8px;">
        <button class="btn btn-secondary btn-sm" onclick="openNewDm()">💬 New DM</button>
        <button class="btn btn-primary btn-sm" onclick="openNewGroup()">+ New Group</button>
      </div>
    </div>
    <div class="chat-layout">
      <div class="chat-sidebar">
        <div class="chat-sidebar-header">
          <span>Channels</span>
        </div>
        <div class="channel-list" id="channel-list">
          ${channels.length === 0
            ? `<div style="padding:16px;font-size:.8rem;color:var(--text-dim);">No channels yet.<br>Start a DM or create a group.</div>`
            : channels.map(ch => {
                const isDm = ch.type === 'direct';
                const other = isDm ? ch.members?.find(m => m.id !== state.user?.id) : null;
                const displayName = isDm ? (other?.full_name || 'Unknown') : (ch.name || 'Group');
                const isActive = currentChannel && ch.id === currentChannel.id;
                return `<div class="channel-item ${isActive ? 'active' : ''}" onclick="switchChannel(${ch.id})" id="ch-item-${ch.id}">
                  ${isDm
                    ? (other ? avatarHtml(other, 'avatar-sm') : `<div class="avatar avatar-sm">?</div>`)
                    : `<div style="width:28px;height:28px;border-radius:var(--r-sm);background:var(--bg-card);display:flex;align-items:center;justify-content:center;font-size:.75rem;font-weight:700;color:var(--text-muted);flex-shrink:0;">#</div>`}
                  <span class="ch-name">${escHtml(displayName)}</span>
                  ${ch.unread_count > 0 ? `<span class="channel-unread">${ch.unread_count}</span>` : ''}
                </div>`;
              }).join('')}
        </div>
      </div>
      <div class="chat-main" id="chat-main">
        ${currentChannel ? renderChatPanel(currentChannel) : `
          <div class="chat-empty">
            <div style="font-size:2.5rem;">💬</div>
            <div>Select a channel or start a conversation</div>
            <button class="btn btn-primary" onclick="openNewDm()">Start a DM</button>
          </div>`}
      </div>
    </div>`;

  window._chatChannels = channels;
  window._chatUsers = users;

  if (currentChannel) {
    loadChannelMessages(currentChannel.id);
    setupChatSocket(currentChannel.id);
  }
}

function renderChatPanel(channel) {
  const isDm = channel.type === 'direct';
  const other = isDm ? channel.members?.find(m => m.id !== state.user?.id) : null;
  const displayName = isDm ? (other?.full_name || 'Direct Message') : (channel.name || 'Group');
  const memberCount = channel.members?.length || 0;

  return `
    <div class="chat-header">
      ${isDm && other ? avatarHtml(other, 'avatar-sm') : `<div style="font-weight:700;font-size:1.1rem;color:var(--text-muted);">#</div>`}
      <div>
        <div class="chat-channel-name">${escHtml(displayName)}</div>
        <div style="font-size:.72rem;color:var(--text-dim);">${isDm ? (other?.email || '') : memberCount + ' members'}</div>
      </div>
      ${!isDm ? `<button class="btn btn-secondary btn-sm" onclick="openAddChannelMember(${channel.id})">+ Add</button>` : ''}
    </div>
    <div class="chat-messages" id="chat-messages-${channel.id}">
      <div style="text-align:center;color:var(--text-dim);font-size:.8rem;padding:20px 0;" id="chat-loading-${channel.id}">Loading…</div>
    </div>
    <div class="chat-typing" id="chat-typing-${channel.id}"></div>
    <div class="chat-composer">
      <div style="position:relative;">
        <div class="mention-dropdown" id="chat-mention-${channel.id}" style="display:none;bottom:calc(100% + 4px);top:auto;"></div>
        <div class="chat-input-row">
          <textarea class="chat-textarea" id="chat-input-${channel.id}" placeholder="Message ${escHtml(displayName)}… (@ to mention, Enter to send)"
            rows="1"
            onkeydown="handleChatKey(event,${channel.id})"
            oninput="autogrowChat(this,${channel.id})"></textarea>
          <button class="btn btn-primary btn-sm" onclick="sendChatMessage(${channel.id})" style="align-self:flex-end;">Send</button>
        </div>
      </div>
    </div>`;
}

async function loadChannelMessages(channelId) {
  try {
    const { messages } = await api.getMessages(channelId);
    const container = document.getElementById(`chat-messages-${channelId}`);
    if (!container) return;
    if (messages.length === 0) {
      container.innerHTML = `<div style="text-align:center;color:var(--text-dim);font-size:.8rem;padding:20px 0;">No messages yet. Be the first to say something!</div>`;
      return;
    }
    container.innerHTML = messages.map(m => renderMessage(m, channelId)).join('');
    container.scrollTop = container.scrollHeight;
  } catch (err) {
    const container = document.getElementById(`chat-messages-${channelId}`);
    if (container) container.innerHTML = `<div style="color:var(--danger);padding:12px;">Failed to load messages</div>`;
  }
}

function renderMessage(m, channelId) {
  const isOwn = m.user_id === state.user?.id;
  return `
    <div class="msg-group" id="msg-${m.id}">
      ${avatarHtml(m, 'avatar-sm')}
      <div class="msg-body">
        <div class="msg-meta">
          <span class="msg-author">${escHtml(m.full_name || '')}</span>
          <span class="msg-time">${liveTime(m.created_at)}</span>
        </div>
        <div class="msg-content${m.edited_at ? ' edited' : ''}" id="msg-content-${m.id}">${renderMarkdown(m.content)}</div>
        <div id="msg-edit-${m.id}" style="display:none;margin-top:4px;">
          <textarea style="width:100%;min-height:36px;border:1.5px solid var(--border-focus);border-radius:var(--r-md);background:var(--bg-card);color:var(--text);font-family:inherit;font-size:.84rem;padding:6px 10px;" id="msg-edit-input-${m.id}">${escHtml(m.content)}</textarea>
          <div style="display:flex;gap:6px;justify-content:flex-end;margin-top:4px;">
            <button class="btn btn-sm" onclick="cancelEditMsg(${m.id})">Cancel</button>
            <button class="btn btn-primary btn-sm" onclick="saveEditMsg(${channelId},${m.id})">Save</button>
          </div>
        </div>
      </div>
      ${isOwn ? `
      <div class="msg-actions">
        <button class="msg-action-btn" onclick="startEditMsg(${m.id})" title="Edit">✏️</button>
        <button class="msg-action-btn" onclick="deleteChatMsg(${channelId},${m.id})" title="Delete">🗑</button>
      </div>` : ''}
    </div>`;
}

function setupChatSocket(channelId) {
  if (!state.socket) return;
  // Clean up previous channel socket listeners
  if (state._chatChannelId && state._chatChannelId !== channelId) {
    state.socket.emit('leave:channel', state._chatChannelId);
    if (state._chatListeners) {
      for (const [ev, fn] of Object.entries(state._chatListeners)) state.socket.off(ev, fn);
    }
  }
  state._chatChannelId = channelId;
  state.socket.emit('join:channel', channelId);

  const onMsgNew = ({ message, channel_id }) => {
    if (channel_id !== channelId) return;
    const container = document.getElementById(`chat-messages-${channelId}`);
    if (!container) return;
    container.querySelector('[data-empty]')?.remove();
    const wrapper = document.createElement('div');
    wrapper.innerHTML = renderMessage(message, channelId);
    container.appendChild(wrapper.firstElementChild);
    container.scrollTop = container.scrollHeight;
    updateChannelBadge(channel_id, 0); // mark as read since we're looking at it
  };

  const onMsgEdited = ({ message, channel_id }) => {
    if (channel_id !== channelId) return;
    const el = document.getElementById(`msg-content-${message.id}`);
    if (el) {
      el.innerHTML = renderMarkdown(message.content);
      el.classList.toggle('edited', !!message.edited_at);
    }
  };

  const onMsgDeleted = ({ message_id, channel_id }) => {
    if (channel_id !== channelId) return;
    document.getElementById(`msg-${message_id}`)?.remove();
  };

  const onTyping = ({ userId, name, typing }) => {
    if (userId === state.user?.id) return;
    const el = document.getElementById(`chat-typing-${channelId}`);
    if (!el) return;
    el.textContent = typing ? `${name || 'Someone'} is typing…` : '';
  };

  state.socket.on('message:new', onMsgNew);
  state.socket.on('message:edited', onMsgEdited);
  state.socket.on('message:deleted', onMsgDeleted);
  state.socket.on('channel:typing', onTyping);
  state._chatListeners = { 'message:new': onMsgNew, 'message:edited': onMsgEdited, 'message:deleted': onMsgDeleted, 'channel:typing': onTyping };
}

async function switchChannel(channelId) {
  const channels = window._chatChannels || [];
  const channel = channels.find(c => c.id === channelId);
  if (!channel) return;
  // Update active state in sidebar
  document.querySelectorAll('.channel-item').forEach(el => el.classList.remove('active'));
  document.getElementById(`ch-item-${channelId}`)?.classList.add('active');
  // Render chat panel
  const chatMain = document.getElementById('chat-main');
  if (chatMain) {
    chatMain.innerHTML = renderChatPanel(channel);
    loadChannelMessages(channelId);
    setupChatSocket(channelId);
  }
}

function updateChannelBadge(channelId, count) {
  const badge = document.querySelector(`#ch-item-${channelId} .channel-unread`);
  if (count === 0) { badge?.remove(); }
}

async function sendChatMessage(channelId) {
  const ta = document.getElementById(`chat-input-${channelId}`);
  if (!ta?.value.trim()) return;
  const content = ta.value.trim();
  ta.value = ''; ta.style.height = 'auto';
  if (state.socket && state._chatChannelId) {
    state.socket.emit('channel:typing:stop', { channelId: state._chatChannelId });
  }
  try {
    await api.sendMessage(channelId, content);
  } catch (err) { toast(err.message, 'error'); }
}

function handleChatKey(event, channelId) {
  const dropdown = document.getElementById(`chat-mention-${channelId}`);
  const dropdownVisible = dropdown && dropdown.style.display !== 'none';
  if (dropdownVisible) {
    if (event.key === 'ArrowDown') { event.preventDefault(); moveChatMentionSelection(channelId, 1); return; }
    if (event.key === 'ArrowUp')   { event.preventDefault(); moveChatMentionSelection(channelId, -1); return; }
    if (event.key === 'Enter')     { event.preventDefault(); document.querySelector(`#chat-mention-${channelId} .mention-item.active`)?.click(); return; }
    if (event.key === 'Escape')    { dropdown.style.display = 'none'; return; }
  }
  if (event.key === 'Enter' && !event.shiftKey) {
    event.preventDefault();
    sendChatMessage(channelId);
    return;
  }
  // Typing indicator
  if (state.socket && state._chatChannelId) {
    state.socket.emit('channel:typing:start', { channelId: state._chatChannelId, name: state.user?.full_name });
    clearTimeout(state._chatTypingTimeout);
    state._chatTypingTimeout = setTimeout(() => {
      state.socket?.emit('channel:typing:stop', { channelId: state._chatChannelId });
    }, 1500);
  }
}

function autogrowChat(ta, channelId) {
  ta.style.height = 'auto';
  ta.style.height = Math.min(ta.scrollHeight, 160) + 'px';
  // @mention support in chat
  const channels = window._chatChannels || [];
  const ch = channels.find(c => c.id === channelId);
  const members = ch?.members || window._chatUsers || [];
  handleChatMentionInput(ta, members, channelId);
}

function handleChatMentionInput(ta, members, channelId) {
  const pos = ta.selectionStart;
  const before = ta.value.slice(0, pos);
  const atMatch = before.match(/@(\w*)$/);
  const dropdown = document.getElementById(`chat-mention-${channelId}`);
  if (!dropdown) return;
  if (!atMatch) { dropdown.style.display = 'none'; return; }
  const q = atMatch[1].toLowerCase();
  const filtered = members.filter(m => m.id !== state.user?.id && m.full_name.toLowerCase().includes(q)).slice(0, 6);
  if (!filtered.length) { dropdown.style.display = 'none'; return; }
  dropdown.innerHTML = filtered.map((m, i) =>
    `<div class="mention-item ${i === 0 ? 'active' : ''}" onclick="insertChatMention('${escHtml(m.full_name).replace(/'/g, "\\'")}', ${channelId})">
      ${avatarHtml(m, 'avatar-sm')} <span>${escHtml(m.full_name)}</span>
    </div>`
  ).join('');
  dropdown.style.display = 'block';
}

function insertChatMention(name, channelId) {
  const ta = document.getElementById(`chat-input-${channelId}`);
  if (!ta) return;
  const pos = ta.selectionStart;
  const val = ta.value;
  const before = val.slice(0, pos);
  const atIdx = before.lastIndexOf('@');
  ta.value = val.slice(0, atIdx) + '@' + name + ' ' + val.slice(pos);
  const newPos = atIdx + name.length + 2;
  ta.setSelectionRange(newPos, newPos);
  ta.focus();
  const dropdown = document.getElementById(`chat-mention-${channelId}`);
  if (dropdown) dropdown.style.display = 'none';
}

function moveChatMentionSelection(channelId, dir) {
  const items = document.querySelectorAll(`#chat-mention-${channelId} .mention-item`);
  if (!items.length) return;
  let idx = Array.from(items).findIndex(el => el.classList.contains('active'));
  items[idx]?.classList.remove('active');
  idx = (idx + dir + items.length) % items.length;
  items[idx]?.classList.add('active');
}

function startEditMsg(msgId) {
  document.getElementById(`msg-content-${msgId}`).style.display = 'none';
  document.getElementById(`msg-edit-${msgId}`).style.display = 'block';
  const ta = document.getElementById(`msg-edit-input-${msgId}`);
  if (ta) { ta.focus(); ta.setSelectionRange(ta.value.length, ta.value.length); }
}

function cancelEditMsg(msgId) {
  document.getElementById(`msg-content-${msgId}`).style.display = '';
  document.getElementById(`msg-edit-${msgId}`).style.display = 'none';
}

async function saveEditMsg(channelId, msgId) {
  const ta = document.getElementById(`msg-edit-input-${msgId}`);
  if (!ta?.value.trim()) return;
  try {
    const { message } = await api.editMessage(channelId, msgId, ta.value.trim());
    const el = document.getElementById(`msg-content-${msgId}`);
    if (el) { el.innerHTML = renderMarkdown(message.content); el.classList.add('edited'); }
    cancelEditMsg(msgId);
  } catch (err) { toast(err.message, 'error'); }
}

async function deleteChatMsg(channelId, msgId) {
  if (!confirm('Delete this message?')) return;
  try {
    await api.deleteMessage(channelId, msgId);
    document.getElementById(`msg-${msgId}`)?.remove();
  } catch (err) { toast(err.message, 'error'); }
}

function openNewDm() {
  const users = (window._chatUsers || []).filter(u => u.id !== state.user?.id);
  openModal('new-dm-modal', `
    <div style="padding:20px;">
      <div style="font-weight:700;margin-bottom:14px;font-size:1rem;">New Direct Message</div>
      <div style="display:flex;flex-direction:column;gap:6px;max-height:300px;overflow-y:auto;">
        ${users.map(u => `
          <div class="mention-item" onclick="startDm(${u.id})" style="cursor:pointer;padding:8px 12px;border-radius:var(--r-md);">
            ${avatarHtml(u, 'avatar-sm')} <div><div style="font-weight:600;font-size:.84rem;">${escHtml(u.full_name)}</div><div style="font-size:.72rem;color:var(--text-dim);">${escHtml(u.email)}</div></div>
          </div>`).join('')}
      </div>
    </div>`);
}

async function startDm(userId) {
  closeModal('new-dm-modal');
  try {
    const { channel } = await api.openDm(userId);
    // Re-render messages view with this channel active
    const channels = await api.getChannels().then(r => r.channels).catch(() => []);
    window._chatChannels = channels;
    await renderMessages(channel.id);
  } catch (err) { toast(err.message, 'error'); }
}

function openNewGroup() {
  const users = (window._chatUsers || []).filter(u => u.id !== state.user?.id);
  openModal('new-group-modal', `
    <div style="padding:20px;min-width:320px;">
      <div style="font-weight:700;margin-bottom:14px;font-size:1rem;">Create Group Channel</div>
      <input class="form-control" id="group-name-input" placeholder="Channel name" style="margin-bottom:12px;">
      <div style="font-size:.78rem;color:var(--text-dim);margin-bottom:6px;">Select members:</div>
      <div style="display:flex;flex-direction:column;gap:4px;max-height:220px;overflow-y:auto;margin-bottom:14px;">
        ${users.map(u => `
          <label style="display:flex;align-items:center;gap:8px;padding:6px 10px;border-radius:var(--r-md);cursor:pointer;font-size:.84rem;">
            <input type="checkbox" value="${u.id}" class="group-member-cb">
            ${avatarHtml(u, 'avatar-sm')} ${escHtml(u.full_name)}
          </label>`).join('')}
      </div>
      <div style="display:flex;gap:8px;justify-content:flex-end;">
        <button class="btn btn-sm" onclick="closeModal('new-group-modal')">Cancel</button>
        <button class="btn btn-primary btn-sm" onclick="createGroupChannel()">Create</button>
      </div>
    </div>`);
}

async function createGroupChannel() {
  const name = document.getElementById('group-name-input')?.value.trim();
  if (!name) { toast('Channel name required', 'error'); return; }
  const memberIds = Array.from(document.querySelectorAll('.group-member-cb:checked')).map(cb => parseInt(cb.value));
  closeModal('new-group-modal');
  try {
    const { channel } = await api.createGroup(name, memberIds);
    const channels = await api.getChannels().then(r => r.channels).catch(() => []);
    window._chatChannels = channels;
    await renderMessages(channel.id);
  } catch (err) { toast(err.message, 'error'); }
}

function openAddChannelMember(channelId) {
  const channels = window._chatChannels || [];
  const ch = channels.find(c => c.id === channelId);
  const currentIds = new Set((ch?.members || []).map(m => m.id));
  const available = (window._chatUsers || []).filter(u => !currentIds.has(u.id));
  if (!available.length) { toast('All team members are already in this channel', 'info'); return; }
  openModal('add-ch-member-modal', `
    <div style="padding:20px;">
      <div style="font-weight:700;margin-bottom:12px;">Add Member</div>
      <div style="display:flex;flex-direction:column;gap:6px;max-height:280px;overflow-y:auto;">
        ${available.map(u => `
          <div class="mention-item" onclick="addMemberToChannel(${channelId},${u.id})" style="padding:8px 12px;border-radius:var(--r-md);cursor:pointer;">
            ${avatarHtml(u, 'avatar-sm')} ${escHtml(u.full_name)}
          </div>`).join('')}
      </div>
    </div>`);
}

async function addMemberToChannel(channelId, userId) {
  closeModal('add-ch-member-modal');
  try {
    await api.addChannelMember(channelId, userId);
    toast('Member added', 'success');
  } catch (err) { toast(err.message, 'error'); }
}

async function renderTeam() {
  const { users } = await api.getAdminUsers();

  document.getElementById('main-content').innerHTML = `
    <div class="page-header">
      <div>
        <div class="page-title">Team Members</div>
        <div class="page-subtitle">${users.length} members</div>
      </div>
      ${state.user?.role === 'admin' ? `<button class="btn btn-primary" onclick="openCreateUser()">${icon('user-plus')} Add Member</button>` : ''}
    </div>
    <div class="team-grid">
      ${users.map(u => `
        <div class="member-card">
          <div class="avatar avatar-xl" style="margin-bottom:4px;">${u.avatar ? `<img src="${escHtml(u.avatar)}">` : avatarInitials(u.full_name)}</div>
          <div class="member-name">${escHtml(u.full_name)}</div>
          <div class="member-email">${escHtml(u.email)}</div>
          <span class="role-badge role-${u.role}">${u.role}</span>
          <div class="member-stats">
            <div class="member-stat"><strong>${u.task_count || 0}</strong>Tasks</div>
            <div class="member-stat"><span style="width:10px;height:10px;border-radius:50%;background:${u.is_active?'var(--success)':'var(--danger)'};display:inline-block;"></span>${u.is_active ? 'Active' : 'Inactive'}</div>
          </div>
          ${state.user?.role === 'admin' && u.id !== state.user.id ? `
          <div style="display:flex;gap:6px;margin-top:4px;">
            <button class="btn btn-ghost btn-sm" onclick="openEditUser(${u.id})">${icon('edit-2',14)} Edit</button>
            <button class="btn btn-danger btn-sm" onclick="deleteUserConfirm(${u.id})">${icon('trash-2',14)}</button>
          </div>` : ''}
        </div>`).join('')}
    </div>`;
}

function openCreateUser() {
  openModal('create-user-modal', `
    <div class="modal-header">
      <div class="modal-title">Add Team Member</div>
      <button class="modal-close" onclick="closeModal('create-user-modal')">✕</button>
    </div>
    <div class="modal-body">
      <form id="create-user-form">
        <div class="form-group">
          <label class="form-label">Full Name</label>
          <input class="form-control" id="cu-name" placeholder="John Doe" required>
        </div>
        <div class="form-group">
          <label class="form-label">Email</label>
          <input class="form-control" type="email" id="cu-email" placeholder="john@example.com" required>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label class="form-label">Role</label>
            <select class="form-control" id="cu-role">
              <option value="staff">Staff</option>
              <option value="admin">Admin</option>
            </select>
          </div>
          <div class="form-group">
            <label class="form-label">Password</label>
            <input class="form-control" type="password" id="cu-password" placeholder="Min. 6 chars (auto if empty)">
          </div>
        </div>
        <div id="cu-error" class="form-error mb-3"></div>
      </form>
    </div>
    <div class="modal-footer">
      <button class="btn btn-secondary" onclick="closeModal('create-user-modal')">Cancel</button>
      <button class="btn btn-primary" onclick="submitCreateUser()">Add Member</button>
    </div>`);
}

async function submitCreateUser() {
  const btn = document.querySelector('#create-user-modal .btn-primary');
  btn.disabled = true; btn.innerHTML = '<span class="spinner"></span>';
  try {
    await api.createUser({
      full_name: document.getElementById('cu-name').value,
      email: document.getElementById('cu-email').value,
      role: document.getElementById('cu-role').value,
      password: document.getElementById('cu-password').value || undefined,
    });
    closeModal('create-user-modal');
    toast('Member added! Welcome email sent.', 'success');
    await renderTeam();
  } catch (err) {
    document.getElementById('cu-error').textContent = err.message;
    btn.disabled = false; btn.innerHTML = 'Add Member';
  }
}

async function openEditUser(userId) {
  const { user } = await api.getUserDetails(userId);
  openModal('edit-user-modal', `
    <div class="modal-header">
      <div class="modal-title">Edit Member</div>
      <button class="modal-close" onclick="closeModal('edit-user-modal')">✕</button>
    </div>
    <div class="modal-body">
      <div class="form-group">
        <label class="form-label">Full Name</label>
        <input class="form-control" id="eu-name" value="${escHtml(user.full_name)}">
      </div>
      <div class="form-group">
        <label class="form-label">Email</label>
        <input class="form-control" type="email" id="eu-email" value="${escHtml(user.email)}">
      </div>
      <div class="form-row">
        <div class="form-group">
          <label class="form-label">Role</label>
          <select class="form-control" id="eu-role">
            <option value="staff" ${user.role==='staff'?'selected':''}>Staff</option>
            <option value="admin" ${user.role==='admin'?'selected':''}>Admin</option>
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">Status</label>
          <select class="form-control" id="eu-active">
            <option value="1" ${user.is_active?'selected':''}>Active</option>
            <option value="0" ${!user.is_active?'selected':''}>Inactive</option>
          </select>
        </div>
      </div>
      <div class="form-group">
        <label class="form-label">New Password (leave blank to keep)</label>
        <input class="form-control" type="password" id="eu-password" placeholder="••••••••">
      </div>
    </div>
    <div class="modal-footer">
      <button class="btn btn-secondary" onclick="closeModal('edit-user-modal')">Cancel</button>
      <button class="btn btn-primary" onclick="submitEditUser(${userId})">Save Changes</button>
    </div>`);
}

async function submitEditUser(userId) {
  try {
    const data = {
      full_name: document.getElementById('eu-name').value,
      email: document.getElementById('eu-email').value,
      role: document.getElementById('eu-role').value,
      is_active: document.getElementById('eu-active').value === '1',
    };
    const pw = document.getElementById('eu-password').value;
    if (pw) data.password = pw;
    await api.updateUser(userId, data);
    closeModal('edit-user-modal');
    toast('Member updated', 'success');
    await renderTeam();
  } catch (err) { toast(err.message, 'error'); }
}

async function deleteUserConfirm(userId) {
  if (!confirm('Remove this team member?')) return;
  try {
    await api.deleteUser(userId);
    toast('Member removed', 'info');
    await renderTeam();
  } catch (err) { toast(err.message, 'error'); }
}

// ──────────────────────────────────────────────
// ADMIN PANEL
// ──────────────────────────────────────────────
async function renderAdmin() {
  const [dashRes, reportsRes] = await Promise.all([api.getAdminDashboard(), api.getReports()]);
  const { stats, recent_activity, top_users } = dashRes;
  const { tasksByStatus, tasksByPriority, timeByUser, projectProgress } = reportsRes;

  document.getElementById('main-content').innerHTML = `
    <div class="page-header">
      <div>
        <div class="page-title">Admin Panel</div>
        <div class="page-subtitle">Full system overview and management</div>
      </div>
      <span class="role-badge role-admin" style="padding:6px 14px;font-size:.8rem;">Admin View</span>
    </div>

    <div class="admin-tabs" id="admin-tabs" style="overflow-x:auto;white-space:nowrap;display:flex;gap:4px;padding-bottom:4px;">
      <button class="admin-tab active" onclick="showAdminTab('overview',this)">Overview</button>
      <button class="admin-tab" onclick="showAdminTab('users',this)">Users</button>
      <button class="admin-tab" onclick="showAdminTab('reports',this)">Reports</button>
      <button class="admin-tab" onclick="showAdminTab('activity',this)">Activity</button>
      <button class="admin-tab" onclick="showAdminTab('notifications',this)">Notifications</button>
      <button class="admin-tab" onclick="showAdminTab('settings',this)">Settings</button>
      <button class="admin-tab" onclick="showAdminTab('projects',this)">Projects</button>
      <button class="admin-tab" onclick="showAdminTab('admin-tasks',this)">Tasks</button>
      <button class="admin-tab" onclick="showAdminTab('time-logs',this)">Time Logs</button>
      <button class="admin-tab" onclick="showAdminTab('storage',this)">Storage</button>
      <button class="admin-tab" onclick="showAdminTab('health',this)">System Health</button>
      <button class="admin-tab" onclick="showAdminTab('backup',this)">Backup</button>
      <button class="admin-tab" onclick="showAdminTab('email-logs',this)">Email Logs</button>
      <button class="admin-tab" onclick="showAdminTab('invites',this)">Invites</button>
      <button class="admin-tab" onclick="showAdminTab('security',this)">Security</button>
      <button class="admin-tab" onclick="showAdminTab('announcements',this)">Announcements</button>
      <button class="admin-tab" onclick="showAdminTab('labels-tpl',this)">Labels &amp; Templates</button>
      <button class="admin-tab" onclick="showAdminTab('bulk-import',this)">Bulk Import</button>
      <button class="admin-tab" onclick="showAdminTab('webhooks',this)">Webhooks</button>
    </div>

    <div id="admin-tab-content">
      <!-- Overview Tab (default) -->
      <div id="tab-overview">
        <div class="stats-grid" style="grid-template-columns:repeat(auto-fit,minmax(160px,1fr));margin-bottom:24px;">
          <div class="stat-card" style="--card-color:var(--primary)">
            <div class="stat-icon">👥</div>
            <div><div class="stat-value">${stats.total_users}</div><div class="stat-label">Total Users</div></div>
          </div>
          <div class="stat-card" style="--card-color:var(--secondary)">
            <div class="stat-icon" style="background:rgba(0,206,201,.15);color:var(--secondary);">📁</div>
            <div><div class="stat-value">${stats.total_projects}</div><div class="stat-label">Boards</div></div>
          </div>
          <div class="stat-card" style="--card-color:var(--warning)">
            <div class="stat-icon" style="background:rgba(253,203,110,.15);color:var(--warning);">📋</div>
            <div><div class="stat-value">${stats.total_tasks}</div><div class="stat-label">Total Tasks</div></div>
          </div>
          <div class="stat-card" style="--card-color:var(--success)">
            <div class="stat-icon" style="background:rgba(0,184,148,.15);color:var(--success);">✅</div>
            <div><div class="stat-value">${stats.tasks_done}</div><div class="stat-label">Completed</div></div>
          </div>
          <div class="stat-card" style="--card-color:var(--danger)">
            <div class="stat-icon" style="background:rgba(255,92,122,.15);color:var(--danger);">🚫</div>
            <div><div class="stat-value">${stats.tasks_blocked}</div><div class="stat-label">Blocked</div></div>
          </div>
          <div class="stat-card" style="--card-color:#74B9FF">
            <div class="stat-icon" style="background:rgba(116,185,255,.15);color:#74B9FF;">⏱️</div>
            <div><div class="stat-value">${formatDuration(stats.total_time_seconds)}</div><div class="stat-label">Total Hours</div></div>
          </div>
        </div>

        <div class="grid-2" style="gap:20px;margin-bottom:24px;">
          <div class="card">
            <div class="card-header"><div class="card-title">Board Progress</div></div>
            ${projectProgress.length === 0 ? emptyState('📁','No boards') : `
            <div style="display:flex;flex-direction:column;gap:14px;">
              ${projectProgress.map(p => {
                const pct = p.total > 0 ? Math.round((p.done / p.total) * 100) : 0;
                return `<div>
                  <div style="display:flex;justify-content:space-between;margin-bottom:5px;">
                    <div style="display:flex;align-items:center;gap:6px;font-size:.875rem;font-weight:600;">${escHtml(p.name)}</div>
                    <span style="font-size:.8rem;color:var(--text-muted);">${p.done}/${p.total} · ${pct}%</span>
                  </div>
                  <div class="progress" style="height:8px;">
                    <div class="progress-bar" style="width:${pct}%;background:${p.color||'var(--primary)'};"></div>
                  </div>
                </div>`;}).join('')}
            </div>`}
          </div>

          <div class="card">
            <div class="card-header"><div class="card-title">Top Contributors</div></div>
            <div style="display:flex;flex-direction:column;gap:10px;">
              ${top_users.map((u, i) => `
              <div style="display:flex;align-items:center;gap:10px;">
                <div style="width:20px;font-size:.875rem;font-weight:800;color:var(--text-dim);text-align:center;">${i+1}</div>
                ${avatarHtml(u,'avatar-sm')}
                <div style="flex:1;min-width:0;">
                  <div style="font-size:.875rem;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${escHtml(u.full_name)}</div>
                  <div style="font-size:.72rem;color:var(--text-muted);">${u.task_count} tasks</div>
                </div>
                <div style="font-size:.8rem;font-weight:700;color:var(--primary-light);">${formatDuration(u.total_seconds)}</div>
              </div>`).join('')}
            </div>
          </div>
        </div>
      </div>
    </div>`;

  // Store data for tab switching
  window._adminData = { stats, recent_activity, top_users, tasksByStatus, tasksByPriority, timeByUser, projectProgress };
}

function showAdminTab(tab, btn) {
  document.querySelectorAll('.admin-tab').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');

  const { recent_activity, timeByUser, tasksByStatus, tasksByPriority } = window._adminData || {};
  const content = document.getElementById('admin-tab-content');

  if (tab === 'overview') {
    renderAdmin(); return;
  }
  if (tab === 'users') {
    api.getAdminUsers().then(({ users }) => {
      content.innerHTML = `
        <div style="display:flex;justify-content:flex-end;margin-bottom:16px;">
          <button class="btn btn-primary" onclick="openCreateUser()">${icon('user-plus')} Add Member</button>
        </div>
        <div class="card">
          <div class="table-wrap">
            <table>
              <thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Tasks</th><th>Status</th><th>Joined</th><th>Actions</th></tr></thead>
              <tbody>
                ${users.map(u => `<tr>
                  <td><div style="display:flex;align-items:center;gap:8px;">${avatarHtml(u,'avatar-sm')}<span>${escHtml(u.full_name)}</span></div></td>
                  <td style="color:var(--text-muted)">${escHtml(u.email)}</td>
                  <td><span class="role-badge role-${u.role}">${u.role}</span></td>
                  <td>${u.task_count || 0}</td>
                  <td><span style="color:${u.is_active?'var(--success)':'var(--danger)'}">● ${u.is_active?'Active':'Inactive'}</span></td>
                  <td style="color:var(--text-muted);font-size:.8rem;">${formatDate(u.created_at)}</td>
                  <td>
                    ${u.id !== state.user?.id ? `
                    <div style="display:flex;gap:4px;">
                      <button class="btn-icon" onclick="openEditUser(${u.id})" data-tooltip="Edit">${icon('edit-2',14)}</button>
                      <button class="btn-icon" onclick="deleteUserConfirm(${u.id})" data-tooltip="Delete" style="color:var(--danger)">${icon('trash-2',14)}</button>
                    </div>` : '<span style="font-size:.75rem;color:var(--text-dim);">You</span>'}
                  </td>
                </tr>`).join('')}
              </tbody>
            </table>
          </div>
        </div>`;
    });
  }
  if (tab === 'reports') {
    content.innerHTML = `
      <div class="grid-2" style="gap:20px;">
        <div class="card">
          <div class="card-header"><div class="card-title">Tasks by Status</div></div>
          ${(tasksByStatus||[]).map(s => `
          <div style="margin-bottom:12px;">
            <div style="display:flex;justify-content:space-between;margin-bottom:4px;">
              <span class="badge badge-${s.status}">${s.status.replace('_',' ')}</span>
              <span style="font-size:.8rem;font-weight:700;">${s.count}</span>
            </div>
            <div class="progress"><div class="progress-bar" style="width:${Math.min(100,(s.count/Math.max(...(tasksByStatus||[]).map(x=>x.count),1))*100)}%"></div></div>
          </div>`).join('')}
        </div>
        <div class="card">
          <div class="card-header"><div class="card-title">Time by User</div></div>
          <div class="table-wrap">
            <table>
              <thead><tr><th>Member</th><th>Time Logged</th></tr></thead>
              <tbody>
                ${(timeByUser||[]).map(u => `<tr>
                  <td>${escHtml(u.full_name)}</td>
                  <td style="font-weight:700;color:var(--primary-light);">${formatDurationFull(u.seconds)}</td>
                </tr>`).join('')}
              </tbody>
            </table>
          </div>
        </div>
      </div>`;
  }
  if (tab === 'activity') {
    api.getActivity().then(({ activity }) => {
      content.innerHTML = `
        <div class="card">
          <div class="card-header"><div class="card-title">Activity Log</div></div>
          <div style="display:flex;flex-direction:column;gap:0;">
            ${activity.map(a => `
            <div style="display:flex;align-items:flex-start;gap:12px;padding:12px 0;border-bottom:1px solid var(--border);">
              ${avatarHtml(a,'avatar-sm')}
              <div style="flex:1;">
                <span style="font-weight:600;font-size:.875rem;">${escHtml(a.full_name)}</span>
                <span style="color:var(--text-muted);font-size:.875rem;"> ${escHtml(a.action)} ${a.entity_type}</span>
                ${a.details ? `<div style="font-size:.75rem;color:var(--text-dim);margin-top:2px;">${escHtml(JSON.stringify(JSON.parse(a.details||'{}')))}</div>` : ''}
              </div>
              <div style="font-size:.72rem;color:var(--text-dim);white-space:nowrap;">${liveTime(a.created_at)}</div>
            </div>`).join('')}
          </div>
        </div>`;
    });
  }
  if (tab === 'notifications') {
    renderAdminNotifications();
  }
  if (tab === 'settings') {
    renderAdminSettings();
  }
  if (tab === 'projects') renderAdminProjects();
  if (tab === 'admin-tasks') renderAdminTasksTab();
  if (tab === 'time-logs') renderAdminTimeLogs();
  if (tab === 'storage') renderAdminStorage();
  if (tab === 'health') renderSystemHealth();
  if (tab === 'backup') renderBackupTab();
  if (tab === 'email-logs') renderEmailLogs();
  if (tab === 'invites') renderInvites();
  if (tab === 'security') renderSecurityTab();
  if (tab === 'announcements') renderAnnouncements();
  if (tab === 'labels-tpl') renderLabelsTemplates();
  if (tab === 'bulk-import') renderBulkImport();
  if (tab === 'webhooks') renderWebhooks();
}

async function renderAdminNotifications(page = 1, filters = {}) {
  const content = document.getElementById('admin-tab-content');
  const params = new URLSearchParams({ page, limit: 20, ...filters }).toString();
  const { notifications, stats, total } = await api.getAdminNotifications('?' + params);
  const { users } = await api.getAdminUsers();

  const typeColors = { task_assigned: 'var(--primary)', status_changed: 'var(--warning)', mention: 'var(--secondary)', comment: '#74B9FF', broadcast: 'var(--success)' };
  const totalPages = Math.ceil(total / 20);

  content.innerHTML = `
    <!-- Stats row -->
    <div class="stats-grid" style="grid-template-columns:repeat(auto-fit,minmax(140px,1fr));margin-bottom:20px;">
      <div class="stat-card" style="--card-color:var(--primary)">
        <div class="stat-icon">🔔</div>
        <div><div class="stat-value">${stats.total}</div><div class="stat-label">Total</div></div>
      </div>
      <div class="stat-card" style="--card-color:var(--danger)">
        <div class="stat-icon" style="background:rgba(255,92,122,.15);color:var(--danger);">📬</div>
        <div><div class="stat-value">${stats.unread}</div><div class="stat-label">Unread</div></div>
      </div>
      ${stats.by_type.map(t => `
      <div class="stat-card" style="--card-color:${typeColors[t.type]||'#aaa'}">
        <div class="stat-icon" style="background:rgba(108,92,231,.15);color:${typeColors[t.type]||'#aaa'};">📌</div>
        <div><div class="stat-value">${t.count}</div><div class="stat-label">${t.type.replace('_',' ')}</div></div>
      </div>`).join('')}
    </div>

    <!-- Broadcast panel -->
    <div class="card" style="margin-bottom:20px;">
      <div class="card-header"><div class="card-title">📢 Broadcast Notification</div></div>
      <div style="display:grid;gap:12px;">
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
          <div class="form-group" style="margin:0;">
            <label class="form-label">Title</label>
            <input class="form-control" id="bc-title" placeholder="Announcement title">
          </div>
          <div class="form-group" style="margin:0;">
            <label class="form-label">Send to</label>
            <select class="form-control" id="bc-target">
              <option value="all">All Users</option>
              ${users.map(u => `<option value="${u.id}">${escHtml(u.full_name)}</option>`).join('')}
            </select>
          </div>
        </div>
        <div class="form-group" style="margin:0;">
          <label class="form-label">Message</label>
          <textarea class="form-control" id="bc-message" rows="2" placeholder="Notification message…" style="resize:vertical;"></textarea>
        </div>
        <div style="display:flex;align-items:center;gap:16px;">
          <label style="display:flex;align-items:center;gap:8px;font-size:.875rem;cursor:pointer;">
            <input type="checkbox" id="bc-email" style="width:16px;height:16px;">
            Also send email
          </label>
          <button class="btn btn-primary" onclick="sendBroadcast()">Send Broadcast</button>
          <span id="bc-status" style="font-size:.8rem;color:var(--success);"></span>
        </div>
      </div>
    </div>

    <!-- Filter bar + actions -->
    <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin-bottom:14px;">
      <select class="form-control" id="nf-type" onchange="applyNotifFilters()" style="width:auto;padding:6px 10px;font-size:.8rem;">
        <option value="">All Types</option>
        <option value="task_assigned" ${filters.type==='task_assigned'?'selected':''}>Task Assigned</option>
        <option value="status_changed" ${filters.type==='status_changed'?'selected':''}>Status Changed</option>
        <option value="mention" ${filters.type==='mention'?'selected':''}>Mention</option>
        <option value="comment" ${filters.type==='comment'?'selected':''}>Comment</option>
        <option value="broadcast" ${filters.type==='broadcast'?'selected':''}>Broadcast</option>
      </select>
      <select class="form-control" id="nf-user" onchange="applyNotifFilters()" style="width:auto;padding:6px 10px;font-size:.8rem;">
        <option value="">All Users</option>
        ${users.map(u => `<option value="${u.id}" ${filters.user_id==u.id?'selected':''}>${escHtml(u.full_name)}</option>`).join('')}
      </select>
      <select class="form-control" id="nf-read" onchange="applyNotifFilters()" style="width:auto;padding:6px 10px;font-size:.8rem;">
        <option value="">Read & Unread</option>
        <option value="0" ${filters.is_read==='0'?'selected':''}>Unread only</option>
        <option value="1" ${filters.is_read==='1'?'selected':''}>Read only</option>
      </select>
      <div style="margin-left:auto;display:flex;gap:8px;">
        <button class="btn btn-ghost btn-sm" onclick="adminClearNotifs(false)" style="color:var(--warning);">Clear Read</button>
        <button class="btn btn-ghost btn-sm" onclick="adminClearNotifs(true)" style="color:var(--danger);">Clear All</button>
      </div>
    </div>

    <!-- Table -->
    <div class="card">
      <div class="table-wrap">
        <table>
          <thead><tr><th>Time</th><th>User</th><th>Type</th><th>Title</th><th>Message</th><th>Read</th><th></th></tr></thead>
          <tbody>
            ${notifications.length === 0 ? `<tr><td colspan="7" style="text-align:center;padding:32px;color:var(--text-dim);">No notifications</td></tr>` :
            notifications.map(n => `<tr>
              <td style="font-size:.75rem;color:var(--text-dim);white-space:nowrap;">${liveTime(n.created_at)}</td>
              <td><div style="display:flex;align-items:center;gap:6px;">${avatarHtml(n,'avatar-sm')}<span style="font-size:.8rem;">${escHtml(n.full_name)}</span></div></td>
              <td><span style="font-size:.7rem;padding:2px 8px;border-radius:20px;background:${typeColors[n.type]||'#aaa'}22;color:${typeColors[n.type]||'#aaa'};font-weight:600;">${n.type.replace('_',' ')}</span></td>
              <td style="font-weight:600;font-size:.8rem;max-width:160px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${escHtml(n.title)}</td>
              <td style="font-size:.8rem;color:var(--text-muted);max-width:220px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${escHtml(n.message)}</td>
              <td><span style="color:${n.is_read?'var(--text-dim)':'var(--success)'};">${n.is_read?'✓ Read':'● Unread'}</span></td>
              <td><button class="btn-icon" onclick="adminDeleteNotif(${n.id})" style="color:var(--danger);">${icon('trash-2',13)}</button></td>
            </tr>`).join('')}
          </tbody>
        </table>
      </div>
      ${totalPages > 1 ? `
      <div style="display:flex;justify-content:center;gap:8px;padding:16px;">
        ${page > 1 ? `<button class="btn btn-ghost btn-sm" onclick="renderAdminNotifications(${page-1}, window._notifFilters||{})">← Prev</button>` : ''}
        <span style="font-size:.8rem;color:var(--text-muted);align-self:center;">Page ${page} of ${totalPages}</span>
        ${page < totalPages ? `<button class="btn btn-ghost btn-sm" onclick="renderAdminNotifications(${page+1}, window._notifFilters||{})">Next →</button>` : ''}
      </div>` : ''}
    </div>`;

  window._notifFilters = filters;
}

function applyNotifFilters() {
  const filters = {};
  const t = document.getElementById('nf-type')?.value; if (t) filters.type = t;
  const u = document.getElementById('nf-user')?.value; if (u) filters.user_id = u;
  const r = document.getElementById('nf-read')?.value; if (r !== '' && r != null) filters.is_read = r;
  renderAdminNotifications(1, filters);
}

async function sendBroadcast() {
  const title = document.getElementById('bc-title')?.value.trim();
  const message = document.getElementById('bc-message')?.value.trim();
  const targetVal = document.getElementById('bc-target')?.value;
  const sendEmail = document.getElementById('bc-email')?.checked;
  const status = document.getElementById('bc-status');
  if (!title || !message) { if (status) status.textContent = 'Title and message required'; return; }
  try {
    const user_ids = targetVal === 'all' ? 'all' : [parseInt(targetVal)];
    const { sent } = await api.broadcastNotification({ title, message, type: 'broadcast', user_ids, send_email: sendEmail });
    if (status) status.textContent = `Sent to ${sent} user(s) ✓`;
    document.getElementById('bc-title').value = '';
    document.getElementById('bc-message').value = '';
    setTimeout(() => { if (status) status.textContent = ''; }, 3000);
  } catch (err) {
    if (status) { status.textContent = err.message; status.style.color = 'var(--danger)'; }
  }
}

async function adminDeleteNotif(id) {
  await api.adminDeleteNotification(id);
  renderAdminNotifications(1, window._notifFilters || {});
}

async function adminClearNotifs(all) {
  const msg = all ? 'Delete ALL notifications? This cannot be undone.' : 'Clear all read notifications?';
  if (!confirm(msg)) return;
  await api.adminClearNotifications(all);
  renderAdminNotifications(1, {});
}

async function renderAdminSettings() {
  const content = document.getElementById('admin-tab-content');
  const { settings } = await api.getSettings();

  content.innerHTML = `
    <div style="display:grid;gap:20px;max-width:720px;">

      <!-- SMTP -->
      <div class="card">
        <div class="card-header">
          <div class="card-title">📧 SMTP Configuration</div>
          <div style="font-size:.8rem;color:var(--text-muted);">Used for notification emails, welcome emails, and login codes</div>
        </div>
        <div style="display:grid;gap:14px;">
          <div style="display:grid;grid-template-columns:1fr 120px auto;gap:12px;align-items:end;">
            <div class="form-group" style="margin:0;">
              <label class="form-label">SMTP Host</label>
              <input class="form-control" id="s-smtp-host" value="${escHtml(settings.smtp_host||'')}" placeholder="smtp.gmail.com">
            </div>
            <div class="form-group" style="margin:0;">
              <label class="form-label">Port</label>
              <input class="form-control" id="s-smtp-port" value="${escHtml(settings.smtp_port||'587')}" placeholder="587">
            </div>
            <div class="form-group" style="margin:0;">
              <label class="form-label">TLS</label>
              <label style="display:flex;align-items:center;gap:8px;height:40px;cursor:pointer;font-size:.875rem;">
                <input type="checkbox" id="s-smtp-secure" ${settings.smtp_secure==='true'?'checked':''} style="width:16px;height:16px;">
                Secure (465)
              </label>
            </div>
          </div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
            <div class="form-group" style="margin:0;">
              <label class="form-label">Username / Email</label>
              <input class="form-control" id="s-smtp-user" value="${escHtml(settings.smtp_user||'')}" placeholder="you@gmail.com">
            </div>
            <div class="form-group" style="margin:0;">
              <label class="form-label">Password / App Password</label>
              <input class="form-control" type="password" id="s-smtp-pass" value="${escHtml(settings.smtp_pass||'')}" placeholder="••••••••••••">
            </div>
          </div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
            <div class="form-group" style="margin:0;">
              <label class="form-label">From Name</label>
              <input class="form-control" id="s-from-name" value="${escHtml(settings.smtp_from_name||settings.app_name||'ProjectFlow')}" placeholder="ProjectFlow">
            </div>
            <div class="form-group" style="margin:0;">
              <label class="form-label">From Email</label>
              <input class="form-control" id="s-from-email" value="${escHtml(settings.smtp_from_email||'')}" placeholder="noreply@example.com">
            </div>
          </div>
          <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;">
            <button class="btn btn-primary" onclick="saveSmtpSettings()">Save SMTP</button>
            <input class="form-control" id="s-test-email" placeholder="Test recipient email" style="width:220px;padding:8px 12px;font-size:.85rem;">
            <button class="btn btn-ghost" onclick="testSmtpEmail()">Send Test Email</button>
            <span id="smtp-status" style="font-size:.8rem;"></span>
          </div>
          <div style="font-size:.75rem;color:var(--text-dim);background:rgba(108,92,231,.08);border-radius:8px;padding:10px 14px;line-height:1.7;">
            <div style="margin-bottom:6px;font-weight:600;color:var(--text-muted);">Quick reference:</div>
            <div>• <strong>cPanel / shared hosting</strong> (zafielbd, namecheap, etc.) → Port <strong>587</strong>, TLS <strong>OFF</strong> (STARTTLS)</div>
            <div>• <strong>Gmail</strong> → Port <strong>587</strong>, TLS <strong>OFF</strong> + use an <strong>App Password</strong> (not your login password)</div>
            <div>• <strong>Port 465 + TLS ON</strong> = implicit SSL — only use if your host specifically requires it</div>
          </div>
        </div>
      </div>

      <!-- OTP / Login Code -->
      <div class="card">
        <div class="card-header">
          <div class="card-title">🔐 Email Login Code (OTP)</div>
          <div style="font-size:.8rem;color:var(--text-muted);">Require a 6-digit email code after password verification</div>
        </div>
        <div style="display:flex;flex-direction:column;gap:14px;">
          <label style="display:flex;align-items:center;gap:12px;cursor:pointer;padding:14px;border:1px solid var(--border);border-radius:10px;">
            <input type="checkbox" id="s-otp-enabled" ${settings.otp_enabled==='1'?'checked':''} style="width:18px;height:18px;">
            <div>
              <div style="font-weight:600;font-size:.9rem;">Enable OTP Login</div>
              <div style="font-size:.78rem;color:var(--text-muted);margin-top:2px;">Users must enter an emailed code to complete login. Requires SMTP to be configured.</div>
            </div>
          </label>
          <div style="display:flex;gap:10px;align-items:center;">
            <button class="btn btn-primary" onclick="saveOtpSettings()">Save OTP Setting</button>
            <span id="otp-status" style="font-size:.8rem;"></span>
          </div>
        </div>
      </div>

      <!-- App Branding -->
      <div class="card">
        <div class="card-header">
          <div class="card-title">🎨 App Branding</div>
        </div>
        <div style="display:grid;gap:12px;">
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
            <div class="form-group" style="margin:0;">
              <label class="form-label">App Name</label>
              <input class="form-control" id="s-app-name" value="${escHtml(settings.app_name||'ProjectFlow')}" placeholder="ProjectFlow">
            </div>
            <div class="form-group" style="margin:0;">
              <label class="form-label">App URL</label>
              <input class="form-control" id="s-app-url" value="${escHtml(settings.app_url||'')}" placeholder="https://yourapp.com">
            </div>
          </div>
          <div>
            <button class="btn btn-primary" onclick="saveBrandingSettings()">Save Branding</button>
            <span id="brand-status" style="font-size:.8rem;margin-left:10px;"></span>
          </div>
        </div>
      </div>

    </div>`;
}

async function saveSmtpSettings() {
  const status = document.getElementById('smtp-status');
  try {
    await api.saveSettings({
      smtp_host: document.getElementById('s-smtp-host').value,
      smtp_port: document.getElementById('s-smtp-port').value,
      smtp_secure: document.getElementById('s-smtp-secure').checked ? 'true' : 'false',
      smtp_user: document.getElementById('s-smtp-user').value,
      smtp_pass: document.getElementById('s-smtp-pass').value,
      smtp_from_name: document.getElementById('s-from-name').value,
      smtp_from_email: document.getElementById('s-from-email').value,
    });
    status.style.color = 'var(--success)'; status.textContent = 'Saved ✓';
  } catch (err) { status.style.color = 'var(--danger)'; status.textContent = err.message; }
  setTimeout(() => { status.textContent = ''; }, 3000);
}

async function testSmtpEmail() {
  const status = document.getElementById('smtp-status');
  const to = document.getElementById('s-test-email')?.value.trim();
  if (!to) { status.style.color = 'var(--danger)'; status.textContent = 'Enter a recipient email first'; return; }
  status.style.color = 'var(--text-muted)'; status.textContent = 'Saving settings…';
  try {
    await api.saveSettings({
      smtp_host: document.getElementById('s-smtp-host').value,
      smtp_port: document.getElementById('s-smtp-port').value,
      smtp_secure: document.getElementById('s-smtp-secure').checked ? 'true' : 'false',
      smtp_user: document.getElementById('s-smtp-user').value,
      smtp_pass: document.getElementById('s-smtp-pass').value,
      smtp_from_name: document.getElementById('s-from-name').value,
      smtp_from_email: document.getElementById('s-from-email').value,
    });
    status.textContent = 'Sending test email…';
    const { message } = await api.testEmail(to);
    status.style.color = 'var(--success)'; status.textContent = message || 'Test email sent ✓';
  } catch (err) { status.style.color = 'var(--danger)'; status.textContent = err.message; }
}

async function saveOtpSettings() {
  const status = document.getElementById('otp-status');
  try {
    await api.saveSettings({ otp_enabled: document.getElementById('s-otp-enabled').checked ? '1' : '0' });
    status.style.color = 'var(--success)'; status.textContent = 'Saved ✓';
  } catch (err) { status.style.color = 'var(--danger)'; status.textContent = err.message; }
  setTimeout(() => { status.textContent = ''; }, 3000);
}

async function saveBrandingSettings() {
  const status = document.getElementById('brand-status');
  try {
    await api.saveSettings({
      app_name: document.getElementById('s-app-name').value,
      app_url: document.getElementById('s-app-url').value,
    });
    status.style.color = 'var(--success)'; status.textContent = 'Saved ✓';
  } catch (err) { status.style.color = 'var(--danger)'; status.textContent = err.message; }
  setTimeout(() => { status.textContent = ''; }, 3000);
}

// ──────────────────────────────────────────────
// ADMIN — PROJECTS TAB
// ──────────────────────────────────────────────
async function renderAdminProjects() {
  const content = document.getElementById('admin-tab-content');
  content.innerHTML = `<div class="page-loading"><div class="spinner spinner-lg"></div></div>`;
  try {
    const [{ projects }, usersRes] = await Promise.all([api.getAdminProjects(), api.getAdminUsers()]);
    const users = usersRes.users || [];
    content.innerHTML = `
      <div class="card">
        <div class="card-header">
          <div class="card-title">All Projects (${projects.length})</div>
        </div>
        <div class="table-wrap">
          <table>
            <thead><tr><th>Name</th><th>Owner</th><th>Members</th><th>Tasks</th><th>Progress</th><th>Overdue</th><th>Status</th><th>Last Activity</th><th>Actions</th></tr></thead>
            <tbody>
              ${projects.length === 0 ? `<tr><td colspan="9" style="text-align:center;padding:32px;color:var(--text-dim);">No projects</td></tr>` :
              projects.map(p => {
                const pct = p.task_count > 0 ? Math.round((p.done_count / p.task_count) * 100) : 0;
                return `<tr>
                  <td>
                    <div style="display:flex;align-items:center;gap:8px;">
                      <span style="width:10px;height:10px;border-radius:50%;background:${escHtml(p.color||'#6C5CE7')};flex-shrink:0;"></span>
                      <span style="font-weight:600;">${escHtml(p.name)}</span>
                    </div>
                    ${p.description ? `<div style="font-size:.72rem;color:var(--text-dim);margin-top:2px;">${escHtml(p.description.slice(0,60))}${p.description.length>60?'…':''}</div>` : ''}
                  </td>
                  <td style="font-size:.85rem;">${escHtml(p.owner_name||'')}</td>
                  <td style="text-align:center;">${p.member_count||0}</td>
                  <td style="text-align:center;">${p.task_count||0}</td>
                  <td style="min-width:100px;">
                    <div style="font-size:.72rem;color:var(--text-muted);margin-bottom:3px;">${p.done_count||0}/${p.task_count||0} · ${pct}%</div>
                    <div class="progress" style="height:5px;"><div class="progress-bar" style="width:${pct}%;background:${escHtml(p.color||'var(--primary)')};"></div></div>
                  </td>
                  <td style="text-align:center;color:${(p.overdue_count||0)>0?'var(--danger)':'var(--text-dim)'};">${p.overdue_count||0}</td>
                  <td><span style="font-size:.75rem;padding:3px 8px;border-radius:20px;background:${p.status==='active'?'rgba(0,184,148,.15)':'rgba(255,92,122,.15)'};color:${p.status==='active'?'var(--success)':'var(--danger)'};">${p.status}</span></td>
                  <td style="font-size:.75rem;color:var(--text-dim);">${p.last_activity ? liveTime(p.last_activity) : '—'}</td>
                  <td>
                    <div style="display:flex;gap:4px;">
                      <button class="btn-icon" onclick="openAdminEditProject(${p.id})" data-tooltip="Edit">${icon('edit-2',14)}</button>
                      <button class="btn-icon" onclick="openAdminProjectMembers(${p.id},'${escHtml(p.name)}')" data-tooltip="Members" style="color:var(--primary-light);">${icon('users',14)}</button>
                      ${p.status==='active'
                        ? `<button class="btn-icon" onclick="adminArchiveProject(${p.id})" data-tooltip="Archive" style="color:var(--warning);">${icon('square',14)}</button>`
                        : `<button class="btn-icon" onclick="adminRestoreProject(${p.id})" data-tooltip="Restore" style="color:var(--success);">${icon('play',14)}</button>`}
                      <button class="btn-icon" onclick="adminDeleteProject(${p.id})" data-tooltip="Delete" style="color:var(--danger);">${icon('trash-2',14)}</button>
                    </div>
                  </td>
                </tr>`;
              }).join('')}
            </tbody>
          </table>
        </div>
      </div>`;
    window._adminProjects = projects;
    window._adminAllUsers = users;
  } catch (err) {
    content.innerHTML = `<div class="card"><p style="color:var(--danger);padding:20px;">${escHtml(err.message)}</p></div>`;
  }
}

async function openAdminEditProject(id) {
  const p = (window._adminProjects || []).find(x => x.id === id);
  if (!p) return;
  const users = window._adminAllUsers || [];
  openModal('edit-proj-modal', `
    <div class="modal-header">
      <div class="modal-title">Edit Project</div>
      <button class="modal-close" onclick="closeModal('edit-proj-modal')">✕</button>
    </div>
    <div class="modal-body">
      <div class="form-group"><label class="form-label">Name</label><input class="form-control" id="ep-name" value="${escHtml(p.name)}"></div>
      <div class="form-group"><label class="form-label">Description</label><textarea class="form-control" id="ep-desc" rows="2">${escHtml(p.description||'')}</textarea></div>
      <div class="form-row">
        <div class="form-group">
          <label class="form-label">Color</label>
          <input type="color" class="form-control" id="ep-color" value="${escHtml(p.color||'#6C5CE7')}" style="height:40px;padding:4px;">
        </div>
        <div class="form-group">
          <label class="form-label">Owner</label>
          <select class="form-control" id="ep-owner">
            ${users.map(u => `<option value="${u.id}" ${u.id===p.owner_id?'selected':''}>${escHtml(u.full_name)}</option>`).join('')}
          </select>
        </div>
      </div>
    </div>
    <div class="modal-footer">
      <button class="btn btn-secondary" onclick="closeModal('edit-proj-modal')">Cancel</button>
      <button class="btn btn-primary" onclick="submitAdminEditProject(${id})">Save</button>
    </div>`);
}

async function submitAdminEditProject(id) {
  try {
    await api.updateAdminProject(id, {
      name: document.getElementById('ep-name').value,
      description: document.getElementById('ep-desc').value,
      color: document.getElementById('ep-color').value,
      owner_id: document.getElementById('ep-owner').value,
    });
    closeModal('edit-proj-modal');
    toast('Project updated', 'success');
    renderAdminProjects();
  } catch (err) { toast(err.message, 'error'); }
}

async function openAdminProjectMembers(id, name) {
  try {
    const [{ members }, usersRes] = await Promise.all([api.getProjectMembers(id), api.getAdminUsers()]);
    const allUsers = usersRes.users || [];
    const memberIds = new Set(members.map(m => m.id));
    openModal('proj-members-modal', `
      <div class="modal-header">
        <div class="modal-title">Members — ${escHtml(name)}</div>
        <button class="modal-close" onclick="closeModal('proj-members-modal')">✕</button>
      </div>
      <div class="modal-body">
        <div class="form-group">
          <label class="form-label">Add Member</label>
          <div style="display:flex;gap:8px;">
            <select class="form-control" id="pm-user-select">
              <option value="">Select user…</option>
              ${allUsers.filter(u => !memberIds.has(u.id)).map(u => `<option value="${u.id}">${escHtml(u.full_name)}</option>`).join('')}
            </select>
            <button class="btn btn-primary btn-sm" onclick="adminAddProjectMember(${id})">Add</button>
          </div>
        </div>
        <div id="pm-member-list">
          ${members.map(m => `
            <div style="display:flex;align-items:center;gap:8px;padding:8px 0;border-bottom:1px solid var(--border);">
              ${avatarHtml(m,'avatar-sm')}
              <span style="flex:1;font-size:.875rem;">${escHtml(m.full_name)}</span>
              <span class="role-badge role-${m.role}">${m.role}</span>
              <button class="btn-icon" onclick="adminRemoveProjectMember(${id},${m.id})" style="color:var(--danger);">${icon('trash-2',13)}</button>
            </div>`).join('')}
          ${members.length === 0 ? '<p style="color:var(--text-dim);font-size:.85rem;">No members yet</p>' : ''}
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary" onclick="closeModal('proj-members-modal')">Close</button>
      </div>`);
    window._editingProjMembersId = id;
  } catch (err) { toast(err.message, 'error'); }
}

async function adminAddProjectMember(projectId) {
  const userId = document.getElementById('pm-user-select')?.value;
  if (!userId) return;
  try {
    await api.addProjectMember(projectId, userId);
    toast('Member added', 'success');
    closeModal('proj-members-modal');
    openAdminProjectMembers(projectId, '');
    renderAdminProjects();
  } catch (err) { toast(err.message, 'error'); }
}

async function adminRemoveProjectMember(projectId, userId) {
  if (!confirm('Remove this member?')) return;
  try {
    await api.removeProjectMember(projectId, userId);
    toast('Member removed', 'info');
    closeModal('proj-members-modal');
    openAdminProjectMembers(projectId, '');
    renderAdminProjects();
  } catch (err) { toast(err.message, 'error'); }
}

async function adminArchiveProject(id) {
  if (!confirm('Archive this project?')) return;
  try { await api.archiveAdminProject(id); toast('Archived', 'info'); renderAdminProjects(); } catch (err) { toast(err.message, 'error'); }
}

async function adminRestoreProject(id) {
  try { await api.restoreAdminProject(id); toast('Restored', 'success'); renderAdminProjects(); } catch (err) { toast(err.message, 'error'); }
}

async function adminDeleteProject(id) {
  if (!confirm('Permanently delete this project and all its tasks? This cannot be undone.')) return;
  try { await api.deleteAdminProject(id); toast('Project deleted', 'info'); renderAdminProjects(); } catch (err) { toast(err.message, 'error'); }
}

// ──────────────────────────────────────────────
// ADMIN — TASKS TAB
// ──────────────────────────────────────────────
async function renderAdminTasksTab(page = 1, filters = {}) {
  const content = document.getElementById('admin-tab-content');
  content.innerHTML = `<div class="page-loading"><div class="spinner spinner-lg"></div></div>`;
  try {
    const [projectsRes, usersRes] = await Promise.all([api.getAdminProjects(), api.getAdminUsers()]);
    const allProjects = projectsRes.projects || [];
    const allUsers = usersRes.users || [];
    const params = new URLSearchParams({ page, limit: 30, ...filters }).toString();
    const { tasks, stats, total } = await api.getAdminTasks('?' + params);
    const totalPages = Math.ceil(total / 30);

    content.innerHTML = `
      <!-- Stats -->
      <div class="stats-grid" style="grid-template-columns:repeat(auto-fit,minmax(140px,1fr));margin-bottom:16px;">
        <div class="stat-card" style="--card-color:var(--primary)"><div class="stat-icon">📋</div><div><div class="stat-value">${stats.total}</div><div class="stat-label">Total Tasks</div></div></div>
        <div class="stat-card" style="--card-color:var(--danger)"><div class="stat-icon" style="background:rgba(255,92,122,.15);color:var(--danger);">⏰</div><div><div class="stat-value">${stats.overdue}</div><div class="stat-label">Overdue</div></div></div>
        <div class="stat-card" style="--card-color:var(--warning)"><div class="stat-icon" style="background:rgba(253,203,110,.15);color:var(--warning);">👤</div><div><div class="stat-value">${stats.unassigned}</div><div class="stat-label">Unassigned</div></div></div>
      </div>

      <!-- Filters -->
      <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:14px;align-items:center;">
        <select class="form-control" id="atf-status" style="width:auto;font-size:.8rem;padding:6px 10px;">
          <option value="">All Statuses</option>
          <option value="todo" ${filters.status==='todo'?'selected':''}>To Do</option>
          <option value="in_progress" ${filters.status==='in_progress'?'selected':''}>In Progress</option>
          <option value="review" ${filters.status==='review'?'selected':''}>Review</option>
          <option value="done" ${filters.status==='done'?'selected':''}>Done</option>
          <option value="blocked" ${filters.status==='blocked'?'selected':''}>Blocked</option>
        </select>
        <select class="form-control" id="atf-priority" style="width:auto;font-size:.8rem;padding:6px 10px;">
          <option value="">All Priorities</option>
          <option value="urgent" ${filters.priority==='urgent'?'selected':''}>Urgent</option>
          <option value="high" ${filters.priority==='high'?'selected':''}>High</option>
          <option value="medium" ${filters.priority==='medium'?'selected':''}>Medium</option>
          <option value="low" ${filters.priority==='low'?'selected':''}>Low</option>
        </select>
        <select class="form-control" id="atf-project" style="width:auto;font-size:.8rem;padding:6px 10px;">
          <option value="">All Projects</option>
          ${allProjects.map(p => `<option value="${p.id}" ${filters.project_id==p.id?'selected':''}>${escHtml(p.name)}</option>`).join('')}
        </select>
        <select class="form-control" id="atf-user" style="width:auto;font-size:.8rem;padding:6px 10px;">
          <option value="">All Assignees</option>
          ${allUsers.map(u => `<option value="${u.id}" ${filters.assigned_to==u.id?'selected':''}>${escHtml(u.full_name)}</option>`).join('')}
        </select>
        <label style="font-size:.8rem;display:flex;align-items:center;gap:5px;cursor:pointer;">
          <input type="checkbox" id="atf-overdue" ${filters.overdue==='1'?'checked':''} onchange="applyAdminTaskFilters()"> Overdue only
        </label>
        <label style="font-size:.8rem;display:flex;align-items:center;gap:5px;cursor:pointer;">
          <input type="checkbox" id="atf-unassigned" ${filters.unassigned==='1'?'checked':''} onchange="applyAdminTaskFilters()"> Unassigned only
        </label>
        <button class="btn btn-ghost btn-sm" onclick="applyAdminTaskFilters()">Apply</button>
        <button class="btn btn-ghost btn-sm" onclick="renderAdminTasksTab(1,{})">Reset</button>
      </div>

      <!-- Bulk action bar (hidden by default) -->
      <div id="at-bulk-bar" style="display:none;align-items:center;gap:8px;padding:10px 14px;background:var(--card-bg);border:1px solid var(--primary);border-radius:8px;margin-bottom:12px;flex-wrap:wrap;">
        <span id="at-bulk-count" style="font-size:.85rem;font-weight:600;"></span>
        <select class="form-control" id="at-bulk-status" style="width:auto;font-size:.8rem;padding:5px 8px;">
          <option value="">Change status…</option>
          <option value="todo">To Do</option><option value="in_progress">In Progress</option>
          <option value="review">Review</option><option value="done">Done</option><option value="blocked">Blocked</option>
        </select>
        <button class="btn btn-ghost btn-sm" onclick="bulkAdminTasks('status')">Apply Status</button>
        <select class="form-control" id="at-bulk-priority" style="width:auto;font-size:.8rem;padding:5px 8px;">
          <option value="">Change priority…</option>
          <option value="urgent">Urgent</option><option value="high">High</option>
          <option value="medium">Medium</option><option value="low">Low</option>
        </select>
        <button class="btn btn-ghost btn-sm" onclick="bulkAdminTasks('priority')">Apply Priority</button>
        <select class="form-control" id="at-bulk-assign" style="width:auto;font-size:.8rem;padding:5px 8px;">
          <option value="">Assign to…</option>
          <option value="0">Unassign</option>
          ${allUsers.map(u => `<option value="${u.id}">${escHtml(u.full_name)}</option>`).join('')}
        </select>
        <button class="btn btn-ghost btn-sm" onclick="bulkAdminTasks('assign')">Assign</button>
        <button class="btn btn-sm" style="background:var(--danger);color:#fff;" onclick="bulkAdminTasks('delete')">Delete Selected</button>
        <button class="btn btn-ghost btn-sm" onclick="clearAdminTaskSelection()">Clear</button>
      </div>

      <div class="card">
        <div class="table-wrap">
          <table>
            <thead><tr>
              <th><input type="checkbox" id="at-select-all" onchange="toggleAllAdminTaskCheckboxes(this)"></th>
              <th>Project</th><th>Title</th><th>Status</th><th>Priority</th><th>Assignee</th><th>Due Date</th><th>Actions</th>
            </tr></thead>
            <tbody id="at-tbody">
              ${tasks.length === 0 ? `<tr><td colspan="8" style="text-align:center;padding:32px;color:var(--text-dim);">No tasks</td></tr>` :
              tasks.map(t => `<tr>
                <td><input type="checkbox" class="at-checkbox" value="${t.id}" onchange="updateAdminTaskBulkBar()"></td>
                <td><span style="font-size:.72rem;padding:2px 7px;border-radius:20px;background:${escHtml(t.project_color||'#6C5CE7')}22;color:${escHtml(t.project_color||'#6C5CE7')};font-weight:600;">${escHtml(t.project_name||'')}</span></td>
                <td style="font-weight:600;font-size:.875rem;max-width:220px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${escHtml(t.title)}</td>
                <td>${statusBadge(t.status)}</td>
                <td>${priorityBadge(t.priority)}</td>
                <td style="font-size:.8rem;">${t.assignee_name ? escHtml(t.assignee_name) : '<span style="color:var(--text-dim);">Unassigned</span>'}</td>
                <td style="font-size:.8rem;color:${t.due_date && new Date(t.due_date)<new Date()?'var(--danger)':'var(--text-muted)'};">${t.due_date||'—'}</td>
                <td>
                  <div style="display:flex;gap:4px;">
                    <button class="btn-icon" onclick="adminDeleteTask(${t.id})" data-tooltip="Delete" style="color:var(--danger);">${icon('trash-2',13)}</button>
                  </div>
                </td>
              </tr>`).join('')}
            </tbody>
          </table>
        </div>
        ${totalPages > 1 ? `
        <div style="display:flex;justify-content:center;gap:8px;padding:16px;">
          ${page > 1 ? `<button class="btn btn-ghost btn-sm" onclick="renderAdminTasksTab(${page-1},window._adminTaskFilters||{})">← Prev</button>` : ''}
          <span style="font-size:.8rem;color:var(--text-muted);align-self:center;">Page ${page} of ${totalPages} (${total} total)</span>
          ${page < totalPages ? `<button class="btn btn-ghost btn-sm" onclick="renderAdminTasksTab(${page+1},window._adminTaskFilters||{})">Next →</button>` : ''}
        </div>` : ''}
      </div>`;
    window._adminTaskFilters = filters;
    window._adminTaskAllUsers = allUsers;
  } catch (err) {
    content.innerHTML = `<div class="card"><p style="color:var(--danger);padding:20px;">${escHtml(err.message)}</p></div>`;
  }
}

function applyAdminTaskFilters() {
  const f = {};
  const s = document.getElementById('atf-status')?.value; if (s) f.status = s;
  const pr = document.getElementById('atf-priority')?.value; if (pr) f.priority = pr;
  const pj = document.getElementById('atf-project')?.value; if (pj) f.project_id = pj;
  const u = document.getElementById('atf-user')?.value; if (u) f.assigned_to = u;
  if (document.getElementById('atf-overdue')?.checked) f.overdue = '1';
  if (document.getElementById('atf-unassigned')?.checked) f.unassigned = '1';
  renderAdminTasksTab(1, f);
}

function getAdminTaskCheckedIds() {
  return Array.from(document.querySelectorAll('.at-checkbox:checked')).map(cb => parseInt(cb.value));
}

function updateAdminTaskBulkBar() {
  const ids = getAdminTaskCheckedIds();
  const bar = document.getElementById('at-bulk-bar');
  const count = document.getElementById('at-bulk-count');
  if (bar) bar.style.display = ids.length > 0 ? 'flex' : 'none';
  if (count) count.textContent = `${ids.length} selected`;
}

function toggleAllAdminTaskCheckboxes(cb) {
  document.querySelectorAll('.at-checkbox').forEach(el => { el.checked = cb.checked; });
  updateAdminTaskBulkBar();
}

function clearAdminTaskSelection() {
  document.querySelectorAll('.at-checkbox').forEach(el => { el.checked = false; });
  const cb = document.getElementById('at-select-all');
  if (cb) cb.checked = false;
  updateAdminTaskBulkBar();
}

async function bulkAdminTasks(action) {
  const ids = getAdminTaskCheckedIds();
  if (!ids.length) { toast('Select at least one task', 'warning'); return; }
  let data = {};
  if (action === 'status') {
    const v = document.getElementById('at-bulk-status')?.value;
    if (!v) { toast('Select a status', 'warning'); return; }
    data.status = v;
  } else if (action === 'priority') {
    const v = document.getElementById('at-bulk-priority')?.value;
    if (!v) { toast('Select a priority', 'warning'); return; }
    data.priority = v;
  } else if (action === 'assign') {
    const v = document.getElementById('at-bulk-assign')?.value;
    data.assigned_to = v === '0' ? null : (v ? parseInt(v) : null);
  } else if (action === 'delete') {
    if (!confirm(`Delete ${ids.length} task(s)? This cannot be undone.`)) return;
  }
  try {
    await api.bulkTaskAction(action, ids, data);
    toast(`Done: ${action} applied to ${ids.length} task(s)`, 'success');
    renderAdminTasksTab(1, window._adminTaskFilters || {});
  } catch (err) { toast(err.message, 'error'); }
}

async function adminDeleteTask(id) {
  if (!confirm('Delete this task?')) return;
  try { await api.deleteAdminTask(id); toast('Task deleted', 'info'); renderAdminTasksTab(1, window._adminTaskFilters || {}); } catch (err) { toast(err.message, 'error'); }
}

// ──────────────────────────────────────────────
// ADMIN — TIME LOGS TAB
// ──────────────────────────────────────────────
async function renderAdminTimeLogs(page = 1, filters = {}) {
  const content = document.getElementById('admin-tab-content');
  content.innerHTML = `<div class="page-loading"><div class="spinner spinner-lg"></div></div>`;
  try {
    const [usersRes, projectsRes] = await Promise.all([api.getAdminUsers(), api.getAdminProjects()]);
    const allUsers = usersRes.users || [];
    const allProjects = projectsRes.projects || [];
    const params = new URLSearchParams({ page, limit: 30, ...filters }).toString();
    const { logs, stats, total } = await api.getAdminTimeLogs('?' + params);
    const totalPages = Math.ceil(total / 30);

    content.innerHTML = `
      <div class="stats-grid" style="grid-template-columns:repeat(auto-fit,minmax(160px,1fr));margin-bottom:16px;">
        <div class="stat-card" style="--card-color:#74B9FF">
          <div class="stat-icon" style="background:rgba(116,185,255,.15);color:#74B9FF;">⏱️</div>
          <div><div class="stat-value">${formatDuration(stats.total_seconds)}</div><div class="stat-label">Total Logged</div></div>
        </div>
        ${(stats.by_user || []).slice(0,3).map(u => `
        <div class="stat-card" style="--card-color:var(--primary)">
          <div class="stat-icon">👤</div>
          <div><div class="stat-value">${formatDuration(u.seconds)}</div><div class="stat-label">${escHtml(u.full_name)}</div></div>
        </div>`).join('')}
      </div>

      <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:14px;align-items:center;">
        <select class="form-control" id="tlf-user" style="width:auto;font-size:.8rem;padding:6px 10px;">
          <option value="">All Users</option>
          ${allUsers.map(u => `<option value="${u.id}" ${filters.user_id==u.id?'selected':''}>${escHtml(u.full_name)}</option>`).join('')}
        </select>
        <select class="form-control" id="tlf-project" style="width:auto;font-size:.8rem;padding:6px 10px;">
          <option value="">All Projects</option>
          ${allProjects.map(p => `<option value="${p.id}" ${filters.project_id==p.id?'selected':''}>${escHtml(p.name)}</option>`).join('')}
        </select>
        <input type="date" class="form-control" id="tlf-from" value="${filters.from||''}" style="width:auto;font-size:.8rem;padding:6px 10px;">
        <input type="date" class="form-control" id="tlf-to" value="${filters.to||''}" style="width:auto;font-size:.8rem;padding:6px 10px;">
        <button class="btn btn-ghost btn-sm" onclick="applyAdminTimeLogFilters()">Apply</button>
        <button class="btn btn-ghost btn-sm" onclick="renderAdminTimeLogs(1,{})">Reset</button>
      </div>

      <div class="card">
        <div class="table-wrap">
          <table>
            <thead><tr><th>User</th><th>Project</th><th>Task</th><th>Start</th><th>End</th><th>Duration</th><th>Note</th><th></th></tr></thead>
            <tbody>
              ${logs.length === 0 ? `<tr><td colspan="8" style="text-align:center;padding:32px;color:var(--text-dim);">No time logs</td></tr>` :
              logs.map(l => `<tr>
                <td style="font-size:.85rem;">${escHtml(l.user_name||'')}</td>
                <td style="font-size:.8rem;color:var(--text-muted);">${escHtml(l.project_name||'')}</td>
                <td style="font-size:.8rem;max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${escHtml(l.task_title||'')}</td>
                <td style="font-size:.75rem;color:var(--text-muted);white-space:nowrap;">${l.start_time ? liveTime(l.start_time) : '—'}</td>
                <td style="font-size:.75rem;color:var(--text-muted);white-space:nowrap;">${l.end_time ? liveTime(l.end_time) : '<span style="color:var(--success);">Running</span>'}</td>
                <td style="font-weight:600;font-size:.85rem;color:var(--primary-light);">${l.duration_seconds ? formatDuration(l.duration_seconds) : '—'}</td>
                <td style="font-size:.75rem;color:var(--text-dim);">${l.note ? escHtml(l.note.slice(0,40)) : ''}</td>
                <td><button class="btn-icon" onclick="adminDeleteTimeLog(${l.id})" style="color:var(--danger);">${icon('trash-2',13)}</button></td>
              </tr>`).join('')}
            </tbody>
          </table>
        </div>
        ${totalPages > 1 ? `
        <div style="display:flex;justify-content:center;gap:8px;padding:16px;">
          ${page > 1 ? `<button class="btn btn-ghost btn-sm" onclick="renderAdminTimeLogs(${page-1},window._adminTimeLogFilters||{})">← Prev</button>` : ''}
          <span style="font-size:.8rem;color:var(--text-muted);align-self:center;">Page ${page} of ${totalPages} (${total} total)</span>
          ${page < totalPages ? `<button class="btn btn-ghost btn-sm" onclick="renderAdminTimeLogs(${page+1},window._adminTimeLogFilters||{})">Next →</button>` : ''}
        </div>` : ''}
      </div>`;
    window._adminTimeLogFilters = filters;
  } catch (err) {
    content.innerHTML = `<div class="card"><p style="color:var(--danger);padding:20px;">${escHtml(err.message)}</p></div>`;
  }
}

function applyAdminTimeLogFilters() {
  const f = {};
  const u = document.getElementById('tlf-user')?.value; if (u) f.user_id = u;
  const p = document.getElementById('tlf-project')?.value; if (p) f.project_id = p;
  const fr = document.getElementById('tlf-from')?.value; if (fr) f.from = fr;
  const to = document.getElementById('tlf-to')?.value; if (to) f.to = to;
  renderAdminTimeLogs(1, f);
}

async function adminDeleteTimeLog(id) {
  if (!confirm('Delete this time log entry?')) return;
  try { await api.deleteAdminTimeLog(id); toast('Deleted', 'info'); renderAdminTimeLogs(1, window._adminTimeLogFilters || {}); } catch (err) { toast(err.message, 'error'); }
}

// ──────────────────────────────────────────────
// ADMIN — STORAGE TAB
// ──────────────────────────────────────────────
function formatBytes(b) {
  if (!b) return '0 B';
  if (b < 1024) return b + ' B';
  if (b < 1024 * 1024) return (b / 1024).toFixed(1) + ' KB';
  return (b / 1024 / 1024).toFixed(2) + ' MB';
}

async function renderAdminStorage() {
  const content = document.getElementById('admin-tab-content');
  content.innerHTML = `<div class="page-loading"><div class="spinner spinner-lg"></div></div>`;
  try {
    const { attachments, total_bytes } = await api.getAdminAttachments();
    content.innerHTML = `
      <div class="stat-card" style="--card-color:var(--warning);margin-bottom:20px;max-width:300px;">
        <div class="stat-icon" style="background:rgba(253,203,110,.15);color:var(--warning);">💾</div>
        <div><div class="stat-value">${formatBytes(total_bytes)}</div><div class="stat-label">Total Attachments Storage</div></div>
      </div>
      <div class="card">
        <div class="card-header"><div class="card-title">All Attachments (${attachments.length})</div></div>
        <div class="table-wrap">
          <table>
            <thead><tr><th>Filename</th><th>Uploader</th><th>Task</th><th>Project</th><th>Size</th><th>Date</th><th></th></tr></thead>
            <tbody>
              ${attachments.length === 0 ? `<tr><td colspan="7" style="text-align:center;padding:32px;color:var(--text-dim);">No attachments</td></tr>` :
              attachments.map(a => `<tr>
                <td style="font-size:.85rem;max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${escHtml(a.original_name||a.filename||'')}</td>
                <td style="font-size:.8rem;">${escHtml(a.uploader_name||'')}</td>
                <td style="font-size:.8rem;max-width:150px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--text-muted);">${escHtml(a.task_title||'')}</td>
                <td style="font-size:.8rem;color:var(--text-muted);">${escHtml(a.project_name||'')}</td>
                <td style="font-size:.8rem;">${formatBytes(a.size_bytes)}</td>
                <td style="font-size:.75rem;color:var(--text-dim);">${liveTime(a.created_at)}</td>
                <td><button class="btn-icon" onclick="adminDeleteAttachment(${a.id})" style="color:var(--danger);">${icon('trash-2',13)}</button></td>
              </tr>`).join('')}
            </tbody>
          </table>
        </div>
      </div>`;
  } catch (err) {
    content.innerHTML = `<div class="card"><p style="color:var(--danger);padding:20px;">${escHtml(err.message)}</p></div>`;
  }
}

async function adminDeleteAttachment(id) {
  if (!confirm('Delete this attachment? The file will also be removed from disk.')) return;
  try { await api.deleteAdminAttachment(id); toast('Attachment deleted', 'info'); renderAdminStorage(); } catch (err) { toast(err.message, 'error'); }
}

// ──────────────────────────────────────────────
// ADMIN — SYSTEM HEALTH TAB
// ──────────────────────────────────────────────
async function renderSystemHealth() {
  const content = document.getElementById('admin-tab-content');
  content.innerHTML = `<div class="page-loading"><div class="spinner spinner-lg"></div></div>`;
  try {
    const h = await api.getSystemHealth();
    function uptime(s) {
      const d = Math.floor(s/86400), hr = Math.floor((s%86400)/3600), m = Math.floor((s%3600)/60);
      return [d>0?`${d}d`:'', hr>0?`${hr}h`:'', `${m}m`].filter(Boolean).join(' ');
    }
    const memPct = Math.round((h.memory.used_mb / h.memory.total_mb) * 100);
    const osPct = Math.round(((h.os_memory.total_mb - h.os_memory.free_mb) / h.os_memory.total_mb) * 100);
    content.innerHTML = `
      <div class="grid-2" style="gap:20px;margin-bottom:20px;">
        <div class="card">
          <div class="card-header"><div class="card-title">Runtime</div></div>
          <div style="display:flex;flex-direction:column;gap:12px;">
            ${[
              ['Uptime', uptime(h.uptime_seconds), h.uptime_seconds > 3600 ? 'var(--success)' : 'var(--warning)'],
              ['Node.js', h.node_version, 'var(--primary-light)'],
              ['Platform', h.platform, 'var(--text-muted)'],
            ].map(([label, val, color]) => `
            <div style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid var(--border);">
              <span style="font-size:.85rem;color:var(--text-muted);">${label}</span>
              <span style="font-size:.85rem;font-weight:600;color:${color};">${escHtml(String(val))}</span>
            </div>`).join('')}
          </div>
        </div>
        <div class="card">
          <div class="card-header"><div class="card-title">Memory</div></div>
          <div style="display:flex;flex-direction:column;gap:14px;">
            <div>
              <div style="display:flex;justify-content:space-between;margin-bottom:5px;font-size:.8rem;">
                <span style="color:var(--text-muted);">App Heap Used</span>
                <span style="font-weight:600;">${h.memory.used_mb}MB / ${h.memory.total_mb}MB (${memPct}%)</span>
              </div>
              <div class="progress" style="height:8px;"><div class="progress-bar" style="width:${memPct}%;background:${memPct>80?'var(--danger)':memPct>60?'var(--warning)':'var(--success)'};"></div></div>
            </div>
            <div>
              <div style="display:flex;justify-content:space-between;margin-bottom:5px;font-size:.8rem;">
                <span style="color:var(--text-muted);">OS Memory</span>
                <span style="font-weight:600;">${h.os_memory.total_mb - h.os_memory.free_mb}MB / ${h.os_memory.total_mb}MB (${osPct}%)</span>
              </div>
              <div class="progress" style="height:8px;"><div class="progress-bar" style="width:${osPct}%;background:${osPct>80?'var(--danger)':osPct>60?'var(--warning)':'var(--success)'};"></div></div>
            </div>
            <div style="font-size:.8rem;color:var(--text-muted);">RSS: ${h.memory.rss_mb}MB</div>
          </div>
        </div>
        <div class="card">
          <div class="card-header"><div class="card-title">Storage</div></div>
          <div style="display:flex;flex-direction:column;gap:10px;">
            <div style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid var(--border);">
              <span style="font-size:.85rem;color:var(--text-muted);">Database Size</span>
              <span style="font-weight:600;color:var(--primary-light);">${formatBytes(h.database.size_bytes)}</span>
            </div>
            <div style="display:flex;justify-content:space-between;padding:8px 0;">
              <span style="font-size:.85rem;color:var(--text-muted);">Uploads Size</span>
              <span style="font-weight:600;color:var(--warning);">${formatBytes(h.uploads.size_bytes)}</span>
            </div>
          </div>
        </div>
      </div>

      <div class="card">
        <div class="card-header"><div class="card-title">Table Row Counts</div></div>
        <div class="table-wrap">
          <table>
            <thead><tr><th>Table</th><th style="text-align:right;">Rows</th></tr></thead>
            <tbody>
              ${Object.entries(h.table_counts).map(([tbl, cnt]) => `<tr>
                <td style="font-size:.85rem;font-family:monospace;color:var(--primary-light);">${escHtml(tbl)}</td>
                <td style="text-align:right;font-weight:700;">${cnt.toLocaleString()}</td>
              </tr>`).join('')}
            </tbody>
          </table>
        </div>
      </div>`;
  } catch (err) {
    content.innerHTML = `<div class="card"><p style="color:var(--danger);padding:20px;">${escHtml(err.message)}</p></div>`;
  }
}

// ──────────────────────────────────────────────
// ADMIN — BACKUP TAB
// ──────────────────────────────────────────────
function renderBackupTab() {
  const content = document.getElementById('admin-tab-content');
  content.innerHTML = `
    <div class="card" style="max-width:520px;">
      <div class="card-header">
        <div class="card-title">Database Backup</div>
        <div style="font-size:.8rem;color:var(--text-muted);">Download a full copy of the application database</div>
      </div>
      <div style="display:flex;flex-direction:column;gap:16px;">
        <div style="background:rgba(108,92,231,.08);border-radius:8px;padding:14px;font-size:.85rem;color:var(--text-muted);line-height:1.7;">
          This downloads the complete database including all users, projects, tasks, time logs, settings, notifications, and all other application data.
          <br><br>
          The backup is a standard SQLite file that can be restored by replacing the <code style="font-family:monospace;color:var(--primary-light);">database.sqlite</code> file on the server.
        </div>
        <button class="btn btn-primary" onclick="api.downloadBackup()" style="width:fit-content;">
          ⬇️ Download Database Backup
        </button>
        <div style="font-size:.75rem;color:var(--text-dim);">
          Tip: Schedule regular backups for production environments.
        </div>
      </div>
    </div>`;
}

// ──────────────────────────────────────────────
// ADMIN — EMAIL LOGS TAB
// ──────────────────────────────────────────────
async function renderEmailLogs(page = 1, filters = {}) {
  const content = document.getElementById('admin-tab-content');
  content.innerHTML = `<div class="page-loading"><div class="spinner spinner-lg"></div></div>`;
  try {
    const params = new URLSearchParams({ page, limit: 30, ...filters }).toString();
    const { logs, stats, total } = await api.getEmailLogs('?' + params);
    const totalPages = Math.ceil(total / 30);
    content.innerHTML = `
      <div class="stats-grid" style="grid-template-columns:repeat(auto-fit,minmax(140px,1fr));margin-bottom:16px;">
        <div class="stat-card" style="--card-color:var(--primary)"><div class="stat-icon">📧</div><div><div class="stat-value">${stats.total}</div><div class="stat-label">Total Emails</div></div></div>
        <div class="stat-card" style="--card-color:var(--success)"><div class="stat-icon" style="background:rgba(0,184,148,.15);color:var(--success);">✓</div><div><div class="stat-value">${stats.sent}</div><div class="stat-label">Sent</div></div></div>
        <div class="stat-card" style="--card-color:var(--danger)"><div class="stat-icon" style="background:rgba(255,92,122,.15);color:var(--danger);">✗</div><div><div class="stat-value">${stats.failed}</div><div class="stat-label">Failed</div></div></div>
      </div>

      <div style="display:flex;gap:8px;margin-bottom:14px;align-items:center;">
        <select class="form-control" id="elf-status" style="width:auto;font-size:.8rem;padding:6px 10px;">
          <option value="">All Statuses</option>
          <option value="sent" ${filters.status==='sent'?'selected':''}>Sent</option>
          <option value="failed" ${filters.status==='failed'?'selected':''}>Failed</option>
        </select>
        <button class="btn btn-ghost btn-sm" onclick="applyEmailLogFilters()">Apply</button>
        <button class="btn btn-ghost btn-sm" onclick="renderEmailLogs(1,{})">Reset</button>
      </div>

      <div class="card">
        <div class="table-wrap">
          <table>
            <thead><tr><th>To</th><th>Subject</th><th>Status</th><th>Error</th><th>Date</th></tr></thead>
            <tbody>
              ${logs.length === 0 ? `<tr><td colspan="5" style="text-align:center;padding:32px;color:var(--text-dim);">No email logs</td></tr>` :
              logs.map(l => `<tr>
                <td style="font-size:.85rem;">${escHtml(l.to_email||'')}</td>
                <td style="font-size:.8rem;max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${escHtml(l.subject||'')}</td>
                <td><span style="font-size:.75rem;padding:2px 8px;border-radius:20px;background:${l.status==='sent'?'rgba(0,184,148,.15)':'rgba(255,92,122,.15)'};color:${l.status==='sent'?'var(--success)':'var(--danger)'};">${l.status}</span></td>
                <td style="font-size:.75rem;color:var(--danger);max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${l.error ? escHtml(l.error) : ''}</td>
                <td style="font-size:.75rem;color:var(--text-dim);">${liveTime(l.created_at)}</td>
              </tr>`).join('')}
            </tbody>
          </table>
        </div>
        ${totalPages > 1 ? `
        <div style="display:flex;justify-content:center;gap:8px;padding:16px;">
          ${page > 1 ? `<button class="btn btn-ghost btn-sm" onclick="renderEmailLogs(${page-1},window._emailLogFilters||{})">← Prev</button>` : ''}
          <span style="font-size:.8rem;color:var(--text-muted);align-self:center;">Page ${page} of ${totalPages}</span>
          ${page < totalPages ? `<button class="btn btn-ghost btn-sm" onclick="renderEmailLogs(${page+1},window._emailLogFilters||{})">Next →</button>` : ''}
        </div>` : ''}
      </div>`;
    window._emailLogFilters = filters;
  } catch (err) {
    content.innerHTML = `<div class="card"><p style="color:var(--danger);padding:20px;">${escHtml(err.message)}</p></div>`;
  }
}

function applyEmailLogFilters() {
  const f = {};
  const s = document.getElementById('elf-status')?.value; if (s) f.status = s;
  renderEmailLogs(1, f);
}

// ──────────────────────────────────────────────
// ADMIN — INVITES TAB
// ──────────────────────────────────────────────
async function renderInvites() {
  const content = document.getElementById('admin-tab-content');
  content.innerHTML = `<div class="page-loading"><div class="spinner spinner-lg"></div></div>`;
  try {
    const { invites } = await api.getInvites();
    const settings = await api.getSettings().catch(() => ({ settings: {} }));
    const appUrl = (settings.settings && settings.settings.app_url) || window.location.origin;

    content.innerHTML = `
      <div class="card" style="margin-bottom:20px;max-width:560px;">
        <div class="card-header"><div class="card-title">Create Invite Link</div></div>
        <div style="display:grid;gap:12px;">
          <div class="form-row">
            <div class="form-group" style="margin:0;">
              <label class="form-label">Email (optional)</label>
              <input class="form-control" id="inv-email" placeholder="Restrict to email…">
            </div>
            <div class="form-group" style="margin:0;">
              <label class="form-label">Role</label>
              <select class="form-control" id="inv-role">
                <option value="staff">Staff</option>
                <option value="admin">Admin</option>
              </select>
            </div>
          </div>
          <div class="form-row">
            <div class="form-group" style="margin:0;">
              <label class="form-label">Expires in (days)</label>
              <input class="form-control" id="inv-days" type="number" value="7" min="1" max="365">
            </div>
            <div class="form-group" style="margin:0;display:flex;align-items:flex-end;">
              <label style="display:flex;align-items:center;gap:8px;font-size:.85rem;cursor:pointer;height:40px;">
                <input type="checkbox" id="inv-send-email"> Send invite email
              </label>
            </div>
          </div>
          <div style="display:flex;align-items:center;gap:10px;">
            <button class="btn btn-primary" onclick="createInviteLink()">Generate Link</button>
            <span id="inv-status" style="font-size:.8rem;"></span>
          </div>
        </div>
      </div>

      <div class="card">
        <div class="card-header"><div class="card-title">Invite Links (${invites.length})</div></div>
        <div class="table-wrap">
          <table>
            <thead><tr><th>Email</th><th>Role</th><th>Status</th><th>Created By</th><th>Expires</th><th>Link</th><th></th></tr></thead>
            <tbody>
              ${invites.length === 0 ? `<tr><td colspan="7" style="text-align:center;padding:32px;color:var(--text-dim);">No invites yet</td></tr>` :
              invites.map(inv => {
                const now = new Date();
                const exp = new Date(inv.expires_at);
                const isExpired = exp < now;
                const status = inv.used ? 'used' : isExpired ? 'expired' : 'pending';
                const statusColor = { used: 'var(--text-dim)', expired: 'var(--danger)', pending: 'var(--success)' }[status];
                const inviteUrl = `${appUrl}/?invite=${inv.token}`;
                return `<tr>
                  <td style="font-size:.85rem;">${inv.email ? escHtml(inv.email) : '<span style="color:var(--text-dim);">Any</span>'}</td>
                  <td><span class="role-badge role-${inv.role}">${inv.role}</span></td>
                  <td><span style="font-size:.75rem;font-weight:600;color:${statusColor};">● ${status}</span>
                    ${status==='used'&&inv.used_by_name?`<div style="font-size:.7rem;color:var(--text-dim);">by ${escHtml(inv.used_by_name)}</div>`:''}
                  </td>
                  <td style="font-size:.8rem;">${escHtml(inv.creator_name||'')}</td>
                  <td style="font-size:.75rem;color:${isExpired?'var(--danger)':'var(--text-muted)'};">${formatDate(inv.expires_at)}</td>
                  <td>
                    ${status === 'pending' ? `
                    <button class="btn btn-ghost btn-sm" onclick="copyInviteLink('${escHtml(inviteUrl)}')" style="font-size:.72rem;">Copy Link</button>` : '—'}
                  </td>
                  <td><button class="btn-icon" onclick="adminDeleteInvite(${inv.id})" style="color:var(--danger);">${icon('trash-2',13)}</button></td>
                </tr>`;
              }).join('')}
            </tbody>
          </table>
        </div>
      </div>`;
  } catch (err) {
    content.innerHTML = `<div class="card"><p style="color:var(--danger);padding:20px;">${escHtml(err.message)}</p></div>`;
  }
}

async function createInviteLink() {
  const status = document.getElementById('inv-status');
  try {
    const data = {
      email: document.getElementById('inv-email')?.value.trim() || null,
      role: document.getElementById('inv-role')?.value || 'staff',
      expires_in_days: parseInt(document.getElementById('inv-days')?.value) || 7,
      send_email: document.getElementById('inv-send-email')?.checked || false,
    };
    await api.createInvite(data);
    if (status) { status.style.color = 'var(--success)'; status.textContent = 'Invite created ✓'; }
    setTimeout(() => { if (status) status.textContent = ''; }, 3000);
    renderInvites();
  } catch (err) {
    if (status) { status.style.color = 'var(--danger)'; status.textContent = err.message; }
  }
}

function copyInviteLink(url) {
  navigator.clipboard.writeText(url).then(() => toast('Link copied!', 'success')).catch(() => toast('Could not copy: ' + url, 'info'));
}

async function adminDeleteInvite(id) {
  if (!confirm('Revoke this invite?')) return;
  try { await api.deleteInvite(id); toast('Invite revoked', 'info'); renderInvites(); } catch (err) { toast(err.message, 'error'); }
}

// ──────────────────────────────────────────────
// ADMIN — SECURITY TAB
// ──────────────────────────────────────────────
async function renderSecurityTab(page = 1, filters = {}) {
  const content = document.getElementById('admin-tab-content');
  content.innerHTML = `<div class="page-loading"><div class="spinner spinner-lg"></div></div>`;
  try {
    const usersRes = await api.getAdminUsers();
    const allUsers = usersRes.users || [];
    const params = new URLSearchParams({ page, limit: 30, ...filters }).toString();
    const { history, stats, total } = await api.getLoginHistory('?' + params);
    const totalPages = Math.ceil(total / 30);

    content.innerHTML = `
      <div class="stats-grid" style="grid-template-columns:repeat(auto-fit,minmax(140px,1fr));margin-bottom:16px;">
        <div class="stat-card" style="--card-color:var(--primary)"><div class="stat-icon">🔐</div><div><div class="stat-value">${stats.total}</div><div class="stat-label">Total Logins</div></div></div>
        <div class="stat-card" style="--card-color:var(--success)"><div class="stat-icon" style="background:rgba(0,184,148,.15);color:var(--success);">✓</div><div><div class="stat-value">${stats.success}</div><div class="stat-label">Successful</div></div></div>
        <div class="stat-card" style="--card-color:var(--danger)"><div class="stat-icon" style="background:rgba(255,92,122,.15);color:var(--danger);">✗</div><div><div class="stat-value">${stats.failed}</div><div class="stat-label">Failed</div></div></div>
        <div class="stat-card" style="--card-color:#74B9FF"><div class="stat-icon" style="background:rgba(116,185,255,.15);color:#74B9FF;">📅</div><div><div class="stat-value">${stats.today}</div><div class="stat-label">Today</div></div></div>
      </div>

      <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:14px;align-items:center;">
        <select class="form-control" id="lhf-user" style="width:auto;font-size:.8rem;padding:6px 10px;">
          <option value="">All Users</option>
          ${allUsers.map(u => `<option value="${u.id}" ${filters.user_id==u.id?'selected':''}>${escHtml(u.full_name)}</option>`).join('')}
        </select>
        <select class="form-control" id="lhf-success" style="width:auto;font-size:.8rem;padding:6px 10px;">
          <option value="">Success &amp; Failed</option>
          <option value="1" ${filters.success==='1'?'selected':''}>Successful only</option>
          <option value="0" ${filters.success==='0'?'selected':''}>Failed only</option>
        </select>
        <button class="btn btn-ghost btn-sm" onclick="applyLoginHistoryFilters()">Apply</button>
        <button class="btn btn-ghost btn-sm" onclick="renderSecurityTab(1,{})">Reset</button>
        <div style="margin-left:auto;display:flex;gap:8px;align-items:center;">
          <span style="font-size:.8rem;color:var(--text-muted);">Clear older than</span>
          <input type="number" id="lh-clear-days" value="30" min="1" style="width:70px;" class="form-control" style="font-size:.8rem;padding:5px 8px;">
          <span style="font-size:.8rem;color:var(--text-muted);">days</span>
          <button class="btn btn-ghost btn-sm" style="color:var(--danger);" onclick="clearOldLoginHistory()">Clear</button>
        </div>
      </div>

      <div class="card">
        <div class="table-wrap">
          <table>
            <thead><tr><th>Time</th><th>User</th><th>Email</th><th>IP</th><th>Browser</th><th>Result</th></tr></thead>
            <tbody>
              ${history.length === 0 ? `<tr><td colspan="6" style="text-align:center;padding:32px;color:var(--text-dim);">No login history</td></tr>` :
              history.map(l => `<tr>
                <td style="font-size:.75rem;color:var(--text-dim);white-space:nowrap;">${liveTime(l.created_at)}</td>
                <td style="font-size:.85rem;">${l.full_name ? escHtml(l.full_name) : '<span style="color:var(--text-dim);">Unknown</span>'}</td>
                <td style="font-size:.8rem;color:var(--text-muted);">${escHtml(l.email||'')}</td>
                <td style="font-size:.8rem;font-family:monospace;">${escHtml(l.ip||'')}</td>
                <td style="font-size:.72rem;color:var(--text-dim);max-width:150px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${escHtml(l.user_agent||'')}">${escHtml((l.user_agent||'').slice(0,50))}</td>
                <td>
                  <span style="font-size:.75rem;padding:2px 8px;border-radius:20px;background:${l.success?'rgba(0,184,148,.15)':'rgba(255,92,122,.15)'};color:${l.success?'var(--success)':'var(--danger)'};">${l.success?'✓ Success':'✗ Failed'}</span>
                  ${!l.success && l.fail_reason ? `<div style="font-size:.7rem;color:var(--text-dim);">${escHtml(l.fail_reason)}</div>` : ''}
                </td>
              </tr>`).join('')}
            </tbody>
          </table>
        </div>
        ${totalPages > 1 ? `
        <div style="display:flex;justify-content:center;gap:8px;padding:16px;">
          ${page > 1 ? `<button class="btn btn-ghost btn-sm" onclick="renderSecurityTab(${page-1},window._loginHistFilters||{})">← Prev</button>` : ''}
          <span style="font-size:.8rem;color:var(--text-muted);align-self:center;">Page ${page} of ${totalPages} (${total} total)</span>
          ${page < totalPages ? `<button class="btn btn-ghost btn-sm" onclick="renderSecurityTab(${page+1},window._loginHistFilters||{})">Next →</button>` : ''}
        </div>` : ''}
      </div>`;
    window._loginHistFilters = filters;
  } catch (err) {
    content.innerHTML = `<div class="card"><p style="color:var(--danger);padding:20px;">${escHtml(err.message)}</p></div>`;
  }
}

function applyLoginHistoryFilters() {
  const f = {};
  const u = document.getElementById('lhf-user')?.value; if (u) f.user_id = u;
  const s = document.getElementById('lhf-success')?.value; if (s !== '') f.success = s;
  renderSecurityTab(1, f);
}

async function clearOldLoginHistory() {
  const days = parseInt(document.getElementById('lh-clear-days')?.value) || 30;
  if (!confirm(`Clear login history older than ${days} days?`)) return;
  try { await api.clearLoginHistory(days); toast('History cleared', 'info'); renderSecurityTab(1, {}); } catch (err) { toast(err.message, 'error'); }
}

// ──────────────────────────────────────────────
// ADMIN — ANNOUNCEMENTS TAB
// ──────────────────────────────────────────────
async function renderAnnouncements() {
  const content = document.getElementById('admin-tab-content');
  content.innerHTML = `<div class="page-loading"><div class="spinner spinner-lg"></div></div>`;
  try {
    const { announcements } = await api.getAnnouncements();
    const typeColors = { info: '#74B9FF', warning: '#FDCB6E', urgent: '#FF5C7A', success: '#00B894' };
    content.innerHTML = `
      <div class="card" style="margin-bottom:20px;max-width:600px;">
        <div class="card-header"><div class="card-title">Create Announcement</div></div>
        <div style="display:grid;gap:12px;">
          <div class="form-row">
            <div class="form-group" style="flex:1;margin:0;">
              <label class="form-label">Title</label>
              <input class="form-control" id="ann-title" placeholder="Announcement title">
            </div>
            <div class="form-group" style="margin:0;">
              <label class="form-label">Type</label>
              <select class="form-control" id="ann-type">
                <option value="info">Info</option>
                <option value="warning">Warning</option>
                <option value="urgent">Urgent</option>
                <option value="success">Success</option>
              </select>
            </div>
          </div>
          <div class="form-group" style="margin:0;">
            <label class="form-label">Message</label>
            <textarea class="form-control" id="ann-message" rows="2" placeholder="Announcement message…" style="resize:vertical;"></textarea>
          </div>
          <div class="form-group" style="margin:0;">
            <label class="form-label">Expires At (optional)</label>
            <input type="datetime-local" class="form-control" id="ann-expires">
          </div>
          <div style="display:flex;gap:10px;align-items:center;">
            <button class="btn btn-primary" onclick="createAnnouncement()">Publish</button>
            <span id="ann-status" style="font-size:.8rem;"></span>
          </div>
        </div>
      </div>

      <div class="card">
        <div class="card-header"><div class="card-title">All Announcements (${announcements.length})</div></div>
        ${announcements.length === 0 ? emptyState('📢', 'No announcements') :
        `<div style="display:flex;flex-direction:column;gap:12px;padding:4px 0;">
          ${announcements.map(a => `
          <div style="border:1px solid var(--border);border-left:4px solid ${typeColors[a.type]||typeColors.info};border-radius:8px;padding:14px 16px;">
            <div style="display:flex;align-items:center;gap:10px;margin-bottom:6px;">
              <span style="font-size:.7rem;font-weight:700;text-transform:uppercase;color:${typeColors[a.type]||typeColors.info};">${escHtml(a.type)}</span>
              <span style="font-weight:600;">${escHtml(a.title)}</span>
              <span style="font-size:.75rem;padding:2px 8px;border-radius:20px;background:${a.is_active?'rgba(0,184,148,.15)':'rgba(255,92,122,.15)'};color:${a.is_active?'var(--success)':'var(--danger)'};">${a.is_active?'Active':'Inactive'}</span>
              <div style="margin-left:auto;display:flex;gap:6px;">
                <button class="btn btn-ghost btn-sm" onclick="toggleAnnouncement(${a.id},${a.is_active?0:1})" style="font-size:.72rem;">${a.is_active?'Deactivate':'Activate'}</button>
                <button class="btn-icon" onclick="adminDeleteAnnouncement(${a.id})" style="color:var(--danger);">${icon('trash-2',13)}</button>
              </div>
            </div>
            <div style="font-size:.85rem;color:var(--text-muted);">${escHtml(a.message)}</div>
            <div style="font-size:.72rem;color:var(--text-dim);margin-top:6px;">
              By ${escHtml(a.creator_name||'')} · ${liveTime(a.created_at)}
              ${a.expires_at ? ` · Expires ${formatDate(a.expires_at)}` : ' · No expiry'}
            </div>
          </div>`).join('')}
        </div>`}
      </div>`;
  } catch (err) {
    content.innerHTML = `<div class="card"><p style="color:var(--danger);padding:20px;">${escHtml(err.message)}</p></div>`;
  }
}

async function createAnnouncement() {
  const status = document.getElementById('ann-status');
  const title = document.getElementById('ann-title')?.value.trim();
  const message = document.getElementById('ann-message')?.value.trim();
  const type = document.getElementById('ann-type')?.value || 'info';
  const expires_at = document.getElementById('ann-expires')?.value || null;
  if (!title || !message) { if (status) { status.style.color = 'var(--danger)'; status.textContent = 'Title and message required'; } return; }
  try {
    await api.createAnnouncement({ title, message, type, expires_at });
    if (status) { status.style.color = 'var(--success)'; status.textContent = 'Published ✓'; }
    setTimeout(() => { if (status) status.textContent = ''; }, 3000);
    renderAnnouncements();
  } catch (err) {
    if (status) { status.style.color = 'var(--danger)'; status.textContent = err.message; }
  }
}

async function toggleAnnouncement(id, isActive) {
  try { await api.updateAnnouncement(id, { is_active: isActive }); renderAnnouncements(); } catch (err) { toast(err.message, 'error'); }
}

async function adminDeleteAnnouncement(id) {
  if (!confirm('Delete this announcement?')) return;
  try { await api.deleteAnnouncement(id); toast('Announcement deleted', 'info'); renderAnnouncements(); } catch (err) { toast(err.message, 'error'); }
}

// ──────────────────────────────────────────────
// ADMIN — LABELS & TEMPLATES TAB
// ──────────────────────────────────────────────
async function renderLabelsTemplates() {
  const content = document.getElementById('admin-tab-content');
  content.innerHTML = `<div class="page-loading"><div class="spinner spinner-lg"></div></div>`;
  try {
    const [labelsRes, templatesRes] = await Promise.all([api.getAdminLabels(), api.getAdminTemplates()]);
    const labels = labelsRes.labels || [];
    const templates = templatesRes.templates || [];
    content.innerHTML = `
      <div class="grid-2" style="gap:20px;">
        <div class="card">
          <div class="card-header"><div class="card-title">Labels (${labels.length})</div></div>
          <div class="table-wrap">
            <table>
              <thead><tr><th>Name</th><th>Color</th><th>Project</th><th>Usage</th><th></th></tr></thead>
              <tbody>
                ${labels.length === 0 ? `<tr><td colspan="5" style="text-align:center;padding:24px;color:var(--text-dim);">No labels</td></tr>` :
                labels.map(l => `<tr>
                  <td style="font-size:.875rem;font-weight:600;">${escHtml(l.name)}</td>
                  <td><span style="display:inline-block;width:20px;height:20px;border-radius:4px;background:${escHtml(l.color||'#6C5CE7')};vertical-align:middle;"></span></td>
                  <td style="font-size:.8rem;color:var(--text-muted);">${l.project_name ? escHtml(l.project_name) : '<span style="color:var(--text-dim);">Global</span>'}</td>
                  <td style="text-align:center;">${l.usage_count||0}</td>
                  <td><button class="btn-icon" onclick="adminDeleteLabel(${l.id})" style="color:var(--danger);">${icon('trash-2',13)}</button></td>
                </tr>`).join('')}
              </tbody>
            </table>
          </div>
        </div>

        <div class="card">
          <div class="card-header"><div class="card-title">Task Templates (${templates.length})</div></div>
          <div class="table-wrap">
            <table>
              <thead><tr><th>Name</th><th>Project</th><th>Priority</th><th>Created By</th><th></th></tr></thead>
              <tbody>
                ${templates.length === 0 ? `<tr><td colspan="5" style="text-align:center;padding:24px;color:var(--text-dim);">No templates</td></tr>` :
                templates.map(t => `<tr>
                  <td style="font-size:.875rem;font-weight:600;">${escHtml(t.name)}</td>
                  <td style="font-size:.8rem;color:var(--text-muted);">${t.project_name ? escHtml(t.project_name) : '<span style="color:var(--text-dim);">—</span>'}</td>
                  <td>${priorityBadge(t.priority||'medium')}</td>
                  <td style="font-size:.8rem;">${escHtml(t.creator_name||'')}</td>
                  <td><button class="btn-icon" onclick="adminDeleteTemplate(${t.id})" style="color:var(--danger);">${icon('trash-2',13)}</button></td>
                </tr>`).join('')}
              </tbody>
            </table>
          </div>
        </div>
      </div>`;
  } catch (err) {
    content.innerHTML = `<div class="card"><p style="color:var(--danger);padding:20px;">${escHtml(err.message)}</p></div>`;
  }
}

async function adminDeleteLabel(id) {
  if (!confirm('Delete this label? It will be removed from all tasks.')) return;
  try { await api.deleteAdminLabel(id); toast('Label deleted', 'info'); renderLabelsTemplates(); } catch (err) { toast(err.message, 'error'); }
}

async function adminDeleteTemplate(id) {
  if (!confirm('Delete this template?')) return;
  try { await api.deleteAdminTemplate(id); toast('Template deleted', 'info'); renderLabelsTemplates(); } catch (err) { toast(err.message, 'error'); }
}

// ──────────────────────────────────────────────
// ADMIN — BULK IMPORT TAB
// ──────────────────────────────────────────────
function renderBulkImport() {
  const content = document.getElementById('admin-tab-content');

  function csvDataUrl(headers, sampleRow) {
    const csv = [headers.join(','), sampleRow.join(',')].join('\n');
    return 'data:text/csv;charset=utf-8,' + encodeURIComponent(csv);
  }

  const usersTemplate = csvDataUrl(
    ['full_name', 'email', 'role', 'password'],
    ['John Doe', 'john@example.com', 'staff', 'password123']
  );
  const tasksTemplate = csvDataUrl(
    ['title', 'project_id', 'description', 'status', 'priority', 'assigned_to_email', 'due_date'],
    ['Fix login bug', '1', 'Login page broken on mobile', 'todo', 'high', 'john@example.com', '2026-12-31']
  );

  content.innerHTML = `
    <div class="grid-2" style="gap:20px;">
      <div class="card">
        <div class="card-header">
          <div class="card-title">Import Users</div>
          <div style="font-size:.8rem;color:var(--text-muted);">CSV columns: full_name, email, role, password</div>
        </div>
        <div style="display:flex;flex-direction:column;gap:12px;">
          <a href="${usersTemplate}" download="users-template.csv" class="btn btn-ghost btn-sm" style="width:fit-content;">⬇️ Download Template</a>
          <div class="form-group" style="margin:0;">
            <label class="form-label">CSV File</label>
            <input type="file" id="import-users-file" accept=".csv" class="form-control">
          </div>
          <button class="btn btn-primary" onclick="runImportUsers()">Import Users</button>
          <div id="import-users-result" style="font-size:.85rem;"></div>
        </div>
      </div>

      <div class="card">
        <div class="card-header">
          <div class="card-title">Import Tasks</div>
          <div style="font-size:.8rem;color:var(--text-muted);">CSV columns: title, project_id, description, status, priority, assigned_to_email, due_date</div>
        </div>
        <div style="display:flex;flex-direction:column;gap:12px;">
          <a href="${tasksTemplate}" download="tasks-template.csv" class="btn btn-ghost btn-sm" style="width:fit-content;">⬇️ Download Template</a>
          <div class="form-group" style="margin:0;">
            <label class="form-label">CSV File</label>
            <input type="file" id="import-tasks-file" accept=".csv" class="form-control">
          </div>
          <button class="btn btn-primary" onclick="runImportTasks()">Import Tasks</button>
          <div id="import-tasks-result" style="font-size:.85rem;"></div>
        </div>
      </div>
    </div>`;
}

async function runImportUsers() {
  const fileInput = document.getElementById('import-users-file');
  const result = document.getElementById('import-users-result');
  if (!fileInput || !fileInput.files[0]) { if (result) { result.style.color = 'var(--danger)'; result.textContent = 'Please select a CSV file'; } return; }
  const formData = new FormData();
  formData.append('file', fileInput.files[0]);
  if (result) { result.style.color = 'var(--text-muted)'; result.textContent = 'Importing…'; }
  try {
    const res = await api.importUsers(formData);
    if (result) {
      result.innerHTML = `
        <span style="color:var(--success);">Created: ${res.created}</span> &nbsp;
        <span style="color:var(--warning);">Skipped: ${res.skipped}</span>
        ${res.errors && res.errors.length ? `<div style="color:var(--danger);margin-top:6px;">${res.errors.slice(0,5).map(e => escHtml(e)).join('<br>')}</div>` : ''}`;
    }
    toast(`Imported ${res.created} user(s)`, 'success');
  } catch (err) {
    if (result) { result.style.color = 'var(--danger)'; result.textContent = err.message; }
  }
}

async function runImportTasks() {
  const fileInput = document.getElementById('import-tasks-file');
  const result = document.getElementById('import-tasks-result');
  if (!fileInput || !fileInput.files[0]) { if (result) { result.style.color = 'var(--danger)'; result.textContent = 'Please select a CSV file'; } return; }
  const formData = new FormData();
  formData.append('file', fileInput.files[0]);
  if (result) { result.style.color = 'var(--text-muted)'; result.textContent = 'Importing…'; }
  try {
    const res = await api.importTasks(formData);
    if (result) {
      result.innerHTML = `
        <span style="color:var(--success);">Created: ${res.created}</span> &nbsp;
        <span style="color:var(--warning);">Skipped: ${res.skipped}</span>
        ${res.errors && res.errors.length ? `<div style="color:var(--danger);margin-top:6px;">${res.errors.slice(0,5).map(e => escHtml(e)).join('<br>')}</div>` : ''}`;
    }
    toast(`Imported ${res.created} task(s)`, 'success');
  } catch (err) {
    if (result) { result.style.color = 'var(--danger)'; result.textContent = err.message; }
  }
}

// ──────────────────────────────────────────────
// ADMIN — WEBHOOKS TAB
// ──────────────────────────────────────────────
const WEBHOOK_EVENTS = ['*', 'task.created', 'task.updated', 'task.deleted', 'task.status_changed', 'comment.added', 'project.created', 'user.created'];

async function renderWebhooks() {
  const content = document.getElementById('admin-tab-content');
  content.innerHTML = `<div class="page-loading"><div class="spinner spinner-lg"></div></div>`;
  try {
    const { webhooks } = await api.getWebhooks();
    content.innerHTML = `
      <div class="card" style="margin-bottom:20px;max-width:600px;">
        <div class="card-header"><div class="card-title">Add Webhook</div></div>
        <div style="display:grid;gap:12px;">
          <div class="form-row">
            <div class="form-group" style="flex:1;margin:0;">
              <label class="form-label">Name</label>
              <input class="form-control" id="wh-name" placeholder="My Webhook">
            </div>
          </div>
          <div class="form-group" style="margin:0;">
            <label class="form-label">Endpoint URL</label>
            <input class="form-control" id="wh-url" placeholder="https://example.com/webhook">
          </div>
          <div class="form-group" style="margin:0;">
            <label class="form-label">Secret (optional, for HMAC signature)</label>
            <input class="form-control" id="wh-secret" placeholder="Signing secret…">
          </div>
          <div class="form-group" style="margin:0;">
            <label class="form-label">Events (check all that apply)</label>
            <div style="display:flex;flex-wrap:wrap;gap:8px;">
              ${WEBHOOK_EVENTS.map(ev => `
              <label style="display:flex;align-items:center;gap:5px;font-size:.82rem;cursor:pointer;background:var(--card-bg);border:1px solid var(--border);border-radius:6px;padding:4px 10px;">
                <input type="checkbox" class="wh-event-cb" value="${ev}" ${ev==='*'?'checked':''}> ${ev==='*'?'All events':ev}
              </label>`).join('')}
            </div>
          </div>
          <div style="display:flex;gap:10px;align-items:center;">
            <button class="btn btn-primary" onclick="createWebhook()">Create Webhook</button>
            <span id="wh-status" style="font-size:.8rem;"></span>
          </div>
        </div>
      </div>

      <div class="card">
        <div class="card-header"><div class="card-title">Webhooks (${webhooks.length})</div></div>
        ${webhooks.length === 0 ? emptyState('🔗', 'No webhooks yet') :
        `<div style="display:flex;flex-direction:column;gap:12px;padding:4px 0;">
          ${webhooks.map(wh => {
            const successRate = wh.delivery_count > 0 ? Math.round((wh.success_count / wh.delivery_count) * 100) : null;
            let parsedEvents = [];
            try { parsedEvents = JSON.parse(wh.events || '[]'); } catch {}
            return `
            <div style="border:1px solid var(--border);border-radius:8px;padding:14px 16px;">
              <div style="display:flex;align-items:center;gap:10px;margin-bottom:8px;">
                <span style="font-size:.8rem;font-weight:700;color:${wh.is_active?'var(--success)':'var(--text-dim)'};">●</span>
                <span style="font-weight:600;">${escHtml(wh.name)}</span>
                <code style="font-size:.75rem;color:var(--primary-light);background:rgba(108,92,231,.1);padding:2px 8px;border-radius:4px;">${escHtml(wh.url)}</code>
                <div style="margin-left:auto;display:flex;gap:6px;">
                  <button class="btn btn-ghost btn-sm" onclick="toggleWebhook(${wh.id},${wh.is_active?0:1})" style="font-size:.72rem;">${wh.is_active?'Disable':'Enable'}</button>
                  <button class="btn btn-ghost btn-sm" onclick="testWebhookDelivery(${wh.id})" style="font-size:.72rem;">Test</button>
                  <button class="btn btn-ghost btn-sm" onclick="viewWebhookLogs(${wh.id})" style="font-size:.72rem;">Logs</button>
                  <button class="btn-icon" onclick="adminDeleteWebhook(${wh.id})" style="color:var(--danger);">${icon('trash-2',13)}</button>
                </div>
              </div>
              <div style="display:flex;gap:12px;font-size:.78rem;color:var(--text-muted);">
                <span>Deliveries: ${wh.delivery_count||0}</span>
                ${successRate !== null ? `<span style="color:${successRate>=80?'var(--success)':successRate>=50?'var(--warning)':'var(--danger)'};">Success rate: ${successRate}%</span>` : ''}
                <span>Events: ${parsedEvents.length>0 ? parsedEvents.map(e => `<code style="font-size:.7rem;background:rgba(108,92,231,.1);color:var(--primary-light);padding:1px 5px;border-radius:3px;">${escHtml(e)}</code>`).join(' ') : 'none'}</span>
              </div>
              ${liveTime(wh.created_at) ? `<div style="font-size:.72rem;color:var(--text-dim);margin-top:4px;">Created by ${escHtml(wh.creator_name||'')} · ${liveTime(wh.created_at)}</div>` : ''}
            </div>`;
          }).join('')}
        </div>`}
      </div>`;
  } catch (err) {
    content.innerHTML = `<div class="card"><p style="color:var(--danger);padding:20px;">${escHtml(err.message)}</p></div>`;
  }
}

async function createWebhook() {
  const status = document.getElementById('wh-status');
  const name = document.getElementById('wh-name')?.value.trim();
  const url = document.getElementById('wh-url')?.value.trim();
  const secret = document.getElementById('wh-secret')?.value.trim() || null;
  const events = Array.from(document.querySelectorAll('.wh-event-cb:checked')).map(cb => cb.value);
  if (!name || !url) { if (status) { status.style.color = 'var(--danger)'; status.textContent = 'Name and URL required'; } return; }
  try {
    await api.createWebhook({ name, url, events, secret });
    if (status) { status.style.color = 'var(--success)'; status.textContent = 'Created ✓'; }
    setTimeout(() => { if (status) status.textContent = ''; }, 3000);
    renderWebhooks();
  } catch (err) {
    if (status) { status.style.color = 'var(--danger)'; status.textContent = err.message; }
  }
}

async function toggleWebhook(id, isActive) {
  try { await api.updateWebhook(id, { is_active: isActive }); renderWebhooks(); } catch (err) { toast(err.message, 'error'); }
}

async function testWebhookDelivery(id) {
  try {
    const { result } = await api.testWebhook(id);
    if (result && result.status) toast(`Test delivered — HTTP ${result.status}`, result.status >= 200 && result.status < 300 ? 'success' : 'warning');
    else if (result && result.error) toast(`Test failed: ${result.error}`, 'error');
    else toast('Test sent', 'info');
  } catch (err) { toast(err.message, 'error'); }
}

async function viewWebhookLogs(id) {
  try {
    const { logs } = await api.getWebhookLogs(id);
    openModal('wh-logs-modal', `
      <div class="modal-header">
        <div class="modal-title">Webhook Delivery Logs</div>
        <button class="modal-close" onclick="closeModal('wh-logs-modal')">✕</button>
      </div>
      <div class="modal-body" style="padding:0;">
        <div class="table-wrap" style="max-height:400px;overflow-y:auto;">
          <table>
            <thead><tr><th>Time</th><th>Event</th><th>Status</th><th>Error</th></tr></thead>
            <tbody>
              ${logs.length === 0 ? `<tr><td colspan="4" style="text-align:center;padding:24px;color:var(--text-dim);">No delivery logs yet</td></tr>` :
              logs.map(l => `<tr>
                <td style="font-size:.75rem;white-space:nowrap;">${liveTime(l.created_at)}</td>
                <td><code style="font-size:.75rem;">${escHtml(l.event||'')}</code></td>
                <td style="font-size:.8rem;">${l.response_status ? `<span style="color:${l.response_status>=200&&l.response_status<300?'var(--success)':'var(--danger)'};">${l.response_status}</span>` : '—'}</td>
                <td style="font-size:.75rem;color:var(--danger);">${l.error ? escHtml(l.error.slice(0,80)) : ''}</td>
              </tr>`).join('')}
            </tbody>
          </table>
        </div>
      </div>
      <div class="modal-footer"><button class="btn btn-secondary" onclick="closeModal('wh-logs-modal')">Close</button></div>`);
  } catch (err) { toast(err.message, 'error'); }
}

async function adminDeleteWebhook(id) {
  if (!confirm('Delete this webhook?')) return;
  try { await api.deleteWebhook(id); toast('Webhook deleted', 'info'); renderWebhooks(); } catch (err) { toast(err.message, 'error'); }
}

// ──────────────────────────────────────────────
// BACKUP TAB
// ──────────────────────────────────────────────
function renderBackupTab() {
  const content = document.getElementById('admin-tab-content');
  content.innerHTML = `
    <div style="max-width:640px;display:grid;gap:20px;">
      <div class="card">
        <div class="card-header">
          <div class="card-title">💾 Database Backup</div>
          <div style="font-size:.8rem;color:var(--text-muted);">Download a complete snapshot of all data</div>
        </div>
        <div style="display:flex;flex-direction:column;gap:16px;">
          <div style="background:rgba(108,92,231,.08);border-radius:10px;padding:16px;font-size:.85rem;color:var(--text-muted);line-height:1.7;">
            <div style="font-weight:600;color:var(--text-color);margin-bottom:6px;">What's included in the backup:</div>
            <div>✅ All users and roles</div>
            <div>✅ All projects, tasks, subtasks, labels</div>
            <div>✅ All time logs, comments, attachments metadata</div>
            <div>✅ All notifications, activity logs</div>
            <div>✅ All settings (SMTP, branding, OTP)</div>
            <div>✅ Announcements, webhooks, invites</div>
          </div>
          <div style="display:flex;align-items:center;gap:12px;">
            <button class="btn btn-primary" onclick="api.downloadBackup()" style="font-size:.95rem;padding:10px 24px;">
              ⬇ Download Backup (.sqlite)
            </button>
            <span style="font-size:.78rem;color:var(--text-dim);">File uploads (attachments) are stored in <code style="background:rgba(255,255,255,.06);padding:2px 6px;border-radius:4px;">public/uploads/</code> and must be backed up separately.</span>
          </div>
        </div>
      </div>

      <div class="card">
        <div class="card-header">
          <div class="card-title">♻ Restore from Backup</div>
          <div style="font-size:.8rem;color:var(--text-muted);">Upload a previously downloaded .sqlite backup file</div>
        </div>
        <div style="display:flex;flex-direction:column;gap:14px;">
          <div style="background:rgba(255,92,122,.08);border:1px solid rgba(255,92,122,.2);border-radius:10px;padding:14px;font-size:.82rem;color:#FF5C7A;line-height:1.6;">
            ⚠ <strong>Warning:</strong> Restoring a backup will replace ALL current data. This cannot be undone. The server will restart automatically after restore.
          </div>
          <div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap;">
            <input type="file" id="restore-file" accept=".sqlite" class="form-control" style="max-width:300px;">
            <button class="btn btn-ghost" onclick="confirmRestore()" style="color:var(--danger);">Restore Database</button>
            <span id="restore-status" style="font-size:.8rem;"></span>
          </div>
        </div>
      </div>
    </div>`;
}

async function confirmRestore() {
  const file = document.getElementById('restore-file')?.files?.[0];
  if (!file) { toast('Select a .sqlite backup file first', 'error'); return; }
  if (!confirm('⚠ This will REPLACE ALL current data with the backup. Continue?')) return;
  const status = document.getElementById('restore-status');
  status.style.color = 'var(--text-muted)'; status.textContent = 'Uploading…';
  try {
    const fd = new FormData();
    fd.append('file', file);
    const res = await fetch('/api/admin/system/restore', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${api.token}` },
      body: fd,
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(json.error || 'Restore failed');
    status.style.color = 'var(--success)'; status.textContent = 'Restored! Server restarting…';
    setTimeout(() => location.reload(), 4000);
  } catch (err) {
    status.style.color = 'var(--danger)'; status.textContent = err.message;
  }
}

// ──────────────────────────────────────────────
// BULK IMPORT TAB
// ──────────────────────────────────────────────
async function renderBulkImport() {
  const content = document.getElementById('admin-tab-content');
  const { projects } = await api.getAdminProjects().catch(() => ({ projects: [] }));

  const userTemplate = 'full_name,email,role,password\nJohn Doe,john@example.com,staff,\nJane Smith,jane@example.com,admin,secret123';
  const taskTemplate = 'title,project_id,description,status,priority,assigned_to_email,due_date\nFix login bug,1,Investigate auth issue,todo,high,john@example.com,2026-05-01\nUpdate README,1,,todo,low,,';

  function makeDownloadUrl(text, filename) {
    const blob = new Blob([text], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    return `<a href="${url}" download="${filename}" class="btn btn-ghost btn-sm">⬇ Download Template</a>`;
  }

  content.innerHTML = `
    <div class="grid-2" style="gap:20px;align-items:start;">

      <!-- Import Users -->
      <div class="card">
        <div class="card-header">
          <div class="card-title">👥 Import Users</div>
          <div style="font-size:.78rem;color:var(--text-muted);">CSV columns: full_name, email, role, password (optional)</div>
        </div>
        <div style="display:flex;flex-direction:column;gap:12px;">
          <div style="font-size:.8rem;color:var(--text-dim);background:rgba(255,255,255,.04);border-radius:8px;padding:10px;font-family:monospace;white-space:pre;">full_name,email,role,password
John Doe,john@co.com,staff,
Jane,jane@co.com,admin,pass123</div>
          <div style="display:flex;gap:8px;flex-wrap:wrap;">
            <a href="data:text/csv;charset=utf-8,${encodeURIComponent(userTemplate)}" download="users-template.csv" class="btn btn-ghost btn-sm">⬇ Download Template</a>
          </div>
          <div class="form-group" style="margin:0;">
            <label class="form-label">Select CSV File</label>
            <input type="file" id="import-users-file" accept=".csv" class="form-control">
          </div>
          <button class="btn btn-primary" onclick="runImport('users')">Import Users</button>
          <div id="import-users-result" style="font-size:.82rem;"></div>
        </div>
      </div>

      <!-- Import Tasks -->
      <div class="card">
        <div class="card-header">
          <div class="card-title">📋 Import Tasks</div>
          <div style="font-size:.78rem;color:var(--text-muted);">CSV columns: title, project_id, description, status, priority, assigned_to_email, due_date</div>
        </div>
        <div style="display:flex;flex-direction:column;gap:12px;">
          <div style="font-size:.8rem;color:var(--text-dim);background:rgba(255,255,255,.04);border-radius:8px;padding:10px;font-family:monospace;white-space:pre;">title,project_id,description,status,priority,assigned_to_email,due_date
Fix bug,1,Details here,todo,high,user@co.com,2026-05-01
New feature,2,,in_progress,medium,,</div>
          <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;">
            <a href="data:text/csv;charset=utf-8,${encodeURIComponent(taskTemplate)}" download="tasks-template.csv" class="btn btn-ghost btn-sm">⬇ Download Template</a>
            <span style="font-size:.75rem;color:var(--text-dim);">Available project IDs: ${projects.map(p=>`${p.id}=${escHtml(p.name)}`).join(', ')||'none'}</span>
          </div>
          <div class="form-group" style="margin:0;">
            <label class="form-label">Select CSV File</label>
            <input type="file" id="import-tasks-file" accept=".csv" class="form-control">
          </div>
          <button class="btn btn-primary" onclick="runImport('tasks')">Import Tasks</button>
          <div id="import-tasks-result" style="font-size:.82rem;"></div>
        </div>
      </div>

    </div>`;
}

async function runImport(type) {
  const fileInput = document.getElementById(`import-${type}-file`);
  const resultEl = document.getElementById(`import-${type}-result`);
  const file = fileInput?.files?.[0];
  if (!file) { resultEl.innerHTML = '<span style="color:var(--danger)">Select a CSV file first</span>'; return; }
  resultEl.innerHTML = '<span style="color:var(--text-muted)">Importing…</span>';
  try {
    const fd = new FormData();
    fd.append('file', file);
    const result = type === 'users' ? await api.importUsers(fd) : await api.importTasks(fd);
    const errHtml = result.errors?.length
      ? `<div style="margin-top:6px;color:var(--warning);">${result.errors.slice(0,5).map(e=>`• ${escHtml(e)}`).join('<br>')}</div>`
      : '';
    resultEl.innerHTML = `<span style="color:var(--success)">✓ Created: ${result.created} &nbsp; Skipped: ${result.skipped}</span>${errHtml}`;
    fileInput.value = '';
  } catch (err) {
    resultEl.innerHTML = `<span style="color:var(--danger)">${escHtml(err.message)}</span>`;
  }
}

// ──────────────────────────────────────────────
// PROFILE
// ──────────────────────────────────────────────
async function renderProfile() {
  const timerRes = await api.getMyTimeLogs(30);
  const totalSecs = timerRes.total_seconds;

  document.getElementById('main-content').innerHTML = `
    <div class="profile-header">
      <div class="avatar avatar-xl">${state.user?.avatar ? `<img src="${escHtml(state.user.avatar)}">` : avatarInitials(state.user?.full_name)}</div>
      <div class="profile-header-info">
        <div class="profile-header-name">${escHtml(state.user?.full_name || '')}</div>
        <div class="profile-header-role">${state.user?.email} · <span class="role-badge role-${state.user?.role}" style="font-size:.75rem;padding:3px 8px;">${state.user?.role}</span></div>
        <div style="margin-top:10px;font-size:.8rem;color:rgba(255,255,255,.6);">Total time tracked last 30 days: ${formatDurationFull(totalSecs)}</div>
      </div>
    </div>

    <div class="grid-2" style="gap:20px;">
      <div class="card">
        <div class="card-header"><div class="card-title">Edit Profile</div></div>
        <div class="form-group">
          <label class="form-label">Full Name</label>
          <input class="form-control" id="profile-name" value="${escHtml(state.user?.full_name || '')}">
        </div>
        <div class="form-group">
          <label class="form-label">Avatar URL</label>
          <input class="form-control" id="profile-avatar" value="${escHtml(state.user?.avatar || '')}" placeholder="https://...">
        </div>
        <button class="btn btn-primary" onclick="saveProfile()">Save Changes</button>
      </div>

      <div class="card">
        <div class="card-header"><div class="card-title">Change Password</div></div>
        <div class="form-group">
          <label class="form-label">New Password</label>
          <input class="form-control" type="password" id="profile-pw" placeholder="Min. 6 characters">
        </div>
        <div class="form-group">
          <label class="form-label">Confirm Password</label>
          <input class="form-control" type="password" id="profile-pw2" placeholder="Repeat password">
        </div>
        <div id="profile-pw-error" class="form-error mb-2"></div>
        <button class="btn btn-secondary" onclick="savePassword()">Update Password</button>
      </div>
    </div>`;
}

async function saveProfile() {
  try {
    const { user } = await api.updateProfile({
      full_name: document.getElementById('profile-name').value,
      avatar: document.getElementById('profile-avatar').value,
    });
    state.user = { ...state.user, ...user };
    toast('Profile updated', 'success');
    renderShell(); // refresh sidebar user card
    document.getElementById('auth-page').classList.add('hidden');
    document.getElementById('app').classList.remove('hidden');
    await navigateTo('profile');
  } catch (err) { toast(err.message, 'error'); }
}

async function savePassword() {
  const pw = document.getElementById('profile-pw').value;
  const pw2 = document.getElementById('profile-pw2').value;
  const errEl = document.getElementById('profile-pw-error');
  if (pw !== pw2) { errEl.textContent = 'Passwords do not match'; return; }
  if (pw.length < 6) { errEl.textContent = 'Min 6 characters'; return; }
  try {
    await api.updateProfile({ password: pw });
    document.getElementById('profile-pw').value = '';
    document.getElementById('profile-pw2').value = '';
    errEl.textContent = '';
    toast('Password updated', 'success');
  } catch (err) { errEl.textContent = err.message; }
}

// ──────────────────────────────────────────────
// NOTIFICATIONS
// ──────────────────────────────────────────────
async function loadNotifications() {
  try {
    const { notifications, unread } = await api.getNotifications();
    state.notifications = notifications;
    state.unread = unread;
    const badge = document.getElementById('notif-badge');
    if (badge) {
      badge.classList.toggle('hidden', unread === 0);
      badge.textContent = unread > 9 ? '9+' : (unread || '');
    }
  } catch {}
}

function toggleNotifDropdown() {
  const el = document.getElementById('notif-dropdown');
  if (!el) return;
  el.classList.toggle('hidden');
  if (!el.classList.contains('hidden')) {
    renderNotifDropdown();
    document.addEventListener('click', closeNotifOnOutside, { once: false });
  }
}

function closeNotifOnOutside(e) {
  const dropdown = document.getElementById('notif-dropdown');
  const btn = document.getElementById('notif-btn');
  if (dropdown && !dropdown.contains(e.target) && !btn?.contains(e.target)) {
    dropdown?.classList.add('hidden');
    document.removeEventListener('click', closeNotifOnOutside);
  }
}

const _notifTypeConfig = {
  mention:        { icon: '💬', label: 'Mention',         cls: 'nt-mention' },
  comment:        { icon: '🗨️',  label: 'Comment',         cls: 'nt-comment' },
  status_changed: { icon: '🔄', label: 'Status update',   cls: 'nt-status' },
  task_assigned:  { icon: '👤', label: 'Assigned to you', cls: 'nt-assigned' },
};

function renderNotifDropdown() {
  const el = document.getElementById('notif-dropdown');
  if (!el) return;
  const hasRead = state.notifications.some(n => n.is_read);
  const items = state.notifications.slice(0, 15);
  el.innerHTML = `
    <div class="notif-header">
      <div class="notif-header-left">
        <span class="notif-title">Notifications</span>
        ${state.unread > 0 ? `<span class="notif-count-chip">${state.unread}</span>` : ''}
      </div>
      <div style="display:flex;gap:4px;align-items:center;">
        ${state.unread > 0 ? `<button class="btn btn-ghost btn-sm" onclick="markAllRead();event.stopPropagation()">Mark all read</button>` : ''}
        ${hasRead ? `<button class="btn btn-ghost btn-sm notif-clear-btn" onclick="clearReadNotifs();event.stopPropagation()" title="Clear read notifications">Clear read</button>` : ''}
      </div>
    </div>
    <div class="notif-list">
      ${items.length === 0
        ? `<div class="notif-empty"><div class="notif-empty-icon">🔔</div><div>You're all caught up!</div></div>`
        : items.map(n => {
            const tc = _notifTypeConfig[n.type] || { icon: '🔔', label: 'Notification', cls: 'nt-default' };
            const hasLink = n.link && n.link !== 'null';
            const msg = n.message.length > 85 ? n.message.slice(0, 85) + '…' : n.message;
            return `
              <div class="notif-item ${n.is_read ? 'is-read' : 'is-unread'} ${tc.cls}" onclick="handleNotifClick(${n.id})">
                <div class="notif-unread-bar"></div>
                <div class="notif-type-icon">${tc.icon}</div>
                <div class="notif-body">
                  <div class="notif-item-title">${escHtml(n.title)}</div>
                  <div class="notif-item-msg">${escHtml(msg)}</div>
                  <div class="notif-item-time">${liveTime(n.created_at)}</div>
                </div>
                ${hasLink ? `<div class="notif-chevron">›</div>` : ''}
              </div>`;
          }).join('')}
    </div>
    ${state.notifications.length > 15 ? `<div class="notif-overflow">+${state.notifications.length - 15} older notifications</div>` : ''}`;
}

async function handleNotifClick(id) {
  const notif = state.notifications.find(n => n.id === id);
  await api.markRead(id);
  document.getElementById('notif-dropdown')?.classList.add('hidden');
  document.removeEventListener('click', closeNotifOnOutside);
  await loadNotifications();
  if (notif?.link) {
    try {
      const link = JSON.parse(notif.link);
      if (link.task_id) {
        if (link.project_id) await navigateTo('board', link.project_id);
        openTaskDetail(link.task_id);
      } else if (link.project_id) {
        await navigateTo('board', link.project_id);
      }
    } catch {}
  }
}

async function markAllRead() {
  await api.markAllRead();
  await loadNotifications();
  renderNotifDropdown();
}

async function clearReadNotifs() {
  await api.clearReadNotifications();
  await loadNotifications();
  renderNotifDropdown();
}

// ──────────────────────────────────────────────
// TIMER STATUS IN HEADER
// ──────────────────────────────────────────────
async function checkActiveTimer() {
  try {
    const { timer } = await api.getActiveTimer();
    state.activeTimer = timer;
    updateTimerStatus();
    if (timer) {
      if (state.timerInterval) clearInterval(state.timerInterval);
      state.timerInterval = setInterval(() => {
        const secs = Math.floor((Date.now() - new Date(timer.start_time).getTime()) / 1000);
        const el = document.getElementById('header-timer');
        if (el) el.textContent = formatDurationFull(secs);
      }, 1000);
    }
  } catch {}
}

function updateTimerStatus() {
  const el = document.getElementById('timer-status');
  if (!el) return;
  if (state.activeTimer) {
    el.innerHTML = `
      <div style="display:flex;align-items:center;gap:8px;padding:6px 12px;background:var(--primary-glow);border:1px solid rgba(108,92,231,.3);border-radius:var(--r-full);">
        <span style="width:6px;height:6px;background:var(--success);border-radius:50%;animation:pulse-badge 1.5s infinite;"></span>
        <span style="font-size:.75rem;font-weight:600;color:var(--primary-light);" id="header-timer">--:--:--</span>
        <button class="btn-icon" onclick="stopTimer()" style="padding:2px;" data-tooltip="Stop timer">${icon('square',12)}</button>
      </div>`;
  } else {
    el.innerHTML = '';
  }
}

// ──────────────────────────────────────────────
// COOKIE CONSENT
// ──────────────────────────────────────────────
function checkCookieConsent() {
  if (localStorage.getItem('pf_cookie') === '1') return;
  setTimeout(() => {
    const banner = document.createElement('div');
    banner.id = 'cookie-banner';
    banner.className = 'cookie-banner';
    banner.innerHTML = `
      <div class="cookie-icon">🍪</div>
      <div class="cookie-text">
        <div class="cookie-title">We use cookies to improve your experience</div>
        <div class="cookie-desc">This app uses essential cookies for authentication and preferences. By continuing, you agree to our use of cookies for a better experience.</div>
      </div>
      <div class="cookie-actions">
        <button class="btn btn-secondary btn-sm" onclick="declineCookies()">Decline</button>
        <button class="btn btn-primary btn-sm" onclick="acceptCookies()">Accept All</button>
      </div>`;
    document.body.appendChild(banner);
  }, 1500);
}

async function acceptCookies() {
  localStorage.setItem('pf_cookie', '1');
  await api.cookieConsent().catch(() => {});
  document.getElementById('cookie-banner')?.remove();
  toast('Preferences saved', 'success');
}

function declineCookies() {
  localStorage.setItem('pf_cookie', '0');
  document.getElementById('cookie-banner')?.remove();
}

// ──────────────────────────────────────────────
// SOCKET.IO
// ──────────────────────────────────────────────
function initSocket() {
  if (typeof io === 'undefined') return;
  try {
    const socket = io({ auth: { token: state.token } });
    state.socket = socket;
    socket.on('task:updated', async ({ task }) => {
      if (state.view === 'board' || state.view === 'my-tasks') {
        await navigateTo(state.view, state.currentProjectId);
      }
    });
    socket.on('notification:new', async (data = {}) => {
      await loadNotifications();
      if (data.title) {
        const preview = data.message ? ': ' + data.message.slice(0, 60) + (data.message.length > 60 ? '…' : '') : '';
        toast(`🔔 ${data.title}${preview}`, 'info');
      }
      const dropdown = document.getElementById('notif-dropdown');
      if (dropdown && !dropdown.classList.contains('hidden')) renderNotifDropdown();
    });
    if (state.currentProjectId) socket.emit('join:project', state.currentProjectId);
  } catch {}
}

// ──────────────────────────────────────────────
// PROJECTS SIDEBAR NAV
// ──────────────────────────────────────────────
async function loadProjects() {
  try {
    const { projects } = await api.getProjects();
    state.projects = projects;
    renderProjectsNav();
  } catch {}
}

function renderProjectsNav() {
  const nav = document.getElementById('projects-nav');
  if (!nav) return;
  if (state.projects.length === 0) {
    nav.innerHTML = `<div style="padding:8px 20px;font-size:.78rem;color:var(--text-dim);">No boards yet</div>`;
    return;
  }
  nav.innerHTML = state.projects.slice(0, 8).map(p => `
    <div class="project-item" data-id="${p.id}" onclick="navigateTo('board',${p.id})">
      <div class="project-dot" style="background:${p.color}"></div>
      <span style="flex:1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${escHtml(p.name)}</span>
      <span style="font-size:.7rem;color:var(--text-dim);">${p.task_count}</span>
    </div>`).join('') +
    (state.projects.length > 8 ? `<div style="padding:6px 20px;font-size:.75rem;color:var(--text-dim);">+${state.projects.length-8} more</div>` : '');
}

async function loadAllTeamForModal() {
  try {
    const { users } = await api.getAdminUsers();
    return users;
  } catch {
    try {
      const { users } = await api.getUsers();
      return users;
    } catch { return []; }
  }
}

// ──────────────────────────────────────────────
// MODAL SYSTEM
// ──────────────────────────────────────────────
function openModal(id, html, extraClass = '') {
  closeModal(id);
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.id = `overlay-${id}`;
  overlay.onclick = (e) => { if (e.target === overlay) closeModal(id); };
  const modal = document.createElement('div');
  modal.className = `modal ${extraClass}`;
  modal.id = id;
  modal.innerHTML = html;
  overlay.appendChild(modal);
  document.body.appendChild(overlay);
  modal.querySelector('input, textarea')?.focus();
}

function closeModal(id) {
  document.getElementById(`overlay-${id}`)?.remove();
  document.getElementById(id)?.remove();
}

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    document.querySelectorAll('.modal-overlay').forEach(el => el.remove());
  }
});

// ──────────────────────────────────────────────
// SIDEBAR TOGGLE (MOBILE)
// ──────────────────────────────────────────────
function toggleSidebar() {
  document.getElementById('sidebar').classList.toggle('open');
  document.getElementById('sidebar-overlay').classList.toggle('show');
}
function closeSidebar() {
  document.getElementById('sidebar')?.classList.remove('open');
  document.getElementById('sidebar-overlay')?.classList.remove('show');
}

// ──────────────────────────────────────────────
// THEME TOGGLE
// ──────────────────────────────────────────────
function toggleTheme() {
  document.body.classList.toggle('light-mode');
  localStorage.setItem('pf_theme', document.body.classList.contains('light-mode') ? 'light' : 'dark');
}

// ──────────────────────────────────────────────
// LOGOUT
// ──────────────────────────────────────────────
function logout() {
  if (state.timerInterval) clearInterval(state.timerInterval);
  state.socket?.disconnect();
  api.setToken(null);
  state.user = null; state.token = null;
  showAuth();
}

// ──────────────────────────────────────────────
// TOAST
// ──────────────────────────────────────────────
function toast(message, type = 'info') {
  const icons = { success: '✅', error: '❌', warning: '⚠️', info: 'ℹ️' };
  const container = document.getElementById('toast-container');
  if (!container) return;
  const t = document.createElement('div');
  t.className = `toast ${type}`;
  t.innerHTML = `<span class="toast-icon">${icons[type]}</span><span class="toast-message">${escHtml(message)}</span><button class="toast-close" onclick="this.closest('.toast').remove()">✕</button>`;
  container.appendChild(t);
  setTimeout(() => t?.remove(), 4000);
}

// ──────────────────────────────────────────────
// HELPERS
// ──────────────────────────────────────────────
function escHtml(str) {
  if (!str) return '';
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function avatarInitials(name) {
  if (!name) return '?';
  return name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
}

function avatarHtml(user, cls = '') {
  if (!user) return `<div class="avatar ${cls}">?</div>`;
  if (user.avatar) return `<div class="avatar ${cls}"><img src="${escHtml(user.avatar)}" alt="${escHtml(user.full_name)}"></div>`;
  const colors = ['#6C5CE7','#00CEC9','#00B894','#E17055','#74B9FF','#FD79A8','#A29BFE','#FDCB6E'];
  const ci = (user.id || 0) % colors.length;
  return `<div class="avatar ${cls}" style="background:${colors[ci]}">${avatarInitials(user.full_name)}</div>`;
}

function statusBadge(status) {
  const labels = { todo: 'To Do', in_progress: 'In Progress', review: 'Review', done: 'Done', blocked: 'Blocked' };
  return `<span class="badge badge-${status}">${labels[status] || status}</span>`;
}

function priorityBadge(priority) {
  const icons = { urgent: '🔴', high: '🟠', medium: '🟡', low: '🟢' };
  return `<span class="priority-badge prio-${priority}">${icons[priority]} ${priority}</span>`;
}

function emptyState(ico, title, text = '') {
  return `<div class="empty-state"><div class="empty-icon">${ico}</div><div class="empty-title">${title}</div>${text?`<p>${text}</p>`:''}</div>`;
}

function formatDuration(secs) {
  if (!secs) return '0h';
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  if (h > 0) return `${h}h${m > 0 ? ` ${m}m` : ''}`;
  return `${m}m`;
}

function formatDurationFull(secs) {
  if (!secs) return '00:00:00';
  const h = String(Math.floor(secs / 3600)).padStart(2, '0');
  const m = String(Math.floor((secs % 3600) / 60)).padStart(2, '0');
  const s = String(secs % 60).padStart(2, '0');
  return `${h}:${m}:${s}`;
}

function formatDate(str) {
  const d = parseUtc(str);
  if (!d) return '';
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatDateFull(str) {
  const d = parseUtc(str);
  if (!d) return '';
  return d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
}

function formatTime(str) {
  const d = parseUtc(str);
  if (!d) return '';
  return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
}

function isPastDue(dateStr) {
  if (!dateStr) return false;
  const d = parseUtc(dateStr);
  return d && d < new Date();
}

// SQLite returns 'YYYY-MM-DD HH:MM:SS' without timezone — always UTC
function parseUtc(str) {
  if (!str) return null;
  if (str.includes(' ') && !str.includes('T')) return new Date(str.replace(' ', 'T') + 'Z');
  return new Date(str);
}

function timeAgo(str) {
  const date = parseUtc(str);
  if (!date) return '';
  const diff = Date.now() - date.getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d ago`;
  return formatDate(str);
}

function liveTime(str) {
  return `<span class="live-time" data-time="${str}">${timeAgo(str)}</span>`;
}

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return 'morning';
  if (h < 18) return 'afternoon';
  return 'evening';
}

function icon(name, size = 18, style = '') {
  const icons = {
    'grid': `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="${style}"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>`,
    'check-square': `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="${style}"><polyline points="9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>`,
    'clock': `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="${style}"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>`,
    'settings': `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="${style}"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>`,
    'users': `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="${style}"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>`,
    'bell': `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="${style}"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>`,
    'sun': `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="${style}"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>`,
    'log-out': `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="${style}"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>`,
    'plus': `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="${style}"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>`,
    'menu': `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="${style}"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>`,
    'calendar': `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="${style}"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>`,
    'play': `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="${style}"><polygon points="5 3 19 12 5 21 5 3"/></svg>`,
    'play-circle': `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="${style}"><circle cx="12" cy="12" r="10"/><polygon points="10 8 16 12 10 16 10 8"/></svg>`,
    'square': `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="2" style="${style}"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/></svg>`,
    'edit-2': `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="${style}"><path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"/></svg>`,
    'trash-2': `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="${style}"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>`,
    'user-plus': `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="${style}"><path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="8.5" cy="7" r="4"/><line x1="20" y1="8" x2="20" y2="14"/><line x1="23" y1="11" x2="17" y2="11"/></svg>`,
    'chevron-right': `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="${style}"><polyline points="9 18 15 12 9 6"/></svg>`,
    'message-circle': `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="${style}"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>`,
  };
  return icons[name] || `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="${style}"><circle cx="12" cy="12" r="10"/></svg>`;
}

// ──────────────────────────────────────────────
// APPLY SAVED THEME
// ──────────────────────────────────────────────
if (localStorage.getItem('pf_theme') === 'light') {
  document.body.classList.add('light-mode');
}

// ──────────────────────────────────────────────
// LIVE TIME REFRESH — updates all [data-time] spans every 30s
// ──────────────────────────────────────────────
setInterval(() => {
  document.querySelectorAll('.live-time[data-time]').forEach(el => {
    el.textContent = timeAgo(el.dataset.time);
  });
}, 30000);

// ──────────────────────────────────────────────
// BOOT
// ──────────────────────────────────────────────
init();
