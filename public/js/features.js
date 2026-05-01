/* =====================================================================
   ProjectFlow — Extended Features
   (Loaded after app.js — uses all globals defined there)
   ===================================================================== */

// ─────────────────────────────────────────────────────────────────────
// 1. SEARCH BAR
// ─────────────────────────────────────────────────────────────────────
function initSearch() {
  const header = document.getElementById('header');
  if (!header || document.getElementById('global-search-wrap')) return;

  const wrap = document.createElement('div');
  wrap.id = 'global-search-wrap';
  wrap.style.cssText = 'position:relative;flex:1;max-width:340px;margin:0 16px;';
  wrap.innerHTML = `
    <input id="global-search" class="form-control" placeholder="Search tasks, projects…"
      style="padding-left:34px;height:36px;font-size:.82rem;background:var(--bg-elevated);border-color:var(--border);">
    <span style="position:absolute;left:10px;top:50%;transform:translateY(-50%);pointer-events:none;color:var(--text-dim);">${icon('search',14)}</span>
    <div id="search-results" class="search-dropdown hidden"></div>`;

  const titleEl = document.getElementById('header-title');
  if (titleEl) header.querySelector('.header-actions').parentNode.insertBefore(wrap, header.querySelector('.header-actions'));

  const input = document.getElementById('global-search');
  let searchTimer;
  input.addEventListener('input', () => {
    clearTimeout(searchTimer);
    const q = input.value.trim();
    if (q.length < 2) { document.getElementById('search-results').classList.add('hidden'); return; }
    searchTimer = setTimeout(() => runSearch(q), 250);
  });
  input.addEventListener('keydown', e => { if (e.key === 'Escape') { input.value = ''; document.getElementById('search-results').classList.add('hidden'); } });
  document.addEventListener('click', e => {
    if (!wrap.contains(e.target)) document.getElementById('search-results')?.classList.add('hidden');
  });
}

async function runSearch(q) {
  const el = document.getElementById('search-results');
  if (!el) return;
  el.innerHTML = `<div style="padding:12px;text-align:center;color:var(--text-dim);">${icon('loader',14)} Searching…</div>`;
  el.classList.remove('hidden');
  try {
    const { tasks, projects } = await api.search(q);
    if (!tasks.length && !projects.length) {
      el.innerHTML = `<div style="padding:12px;text-align:center;color:var(--text-dim);">No results for "${escHtml(q)}"</div>`;
      return;
    }
    let html = '';
    if (projects.length) {
      html += `<div class="search-section-title">Projects</div>`;
      html += projects.map(p => `
        <div class="search-item" onclick="navigateTo('board',${p.id});document.getElementById('search-results').classList.add('hidden');document.getElementById('global-search').value='';">
          <div style="width:8px;height:8px;border-radius:50%;background:${p.color};flex-shrink:0;margin-top:4px;"></div>
          <div><div style="font-size:.85rem;font-weight:600;">${escHtml(p.name)}</div><div style="font-size:.72rem;color:var(--text-dim);">${p.status}</div></div>
        </div>`).join('');
    }
    if (tasks.length) {
      html += `<div class="search-section-title">Tasks</div>`;
      html += tasks.map(t => `
        <div class="search-item" onclick="openTaskDetail(${t.id});document.getElementById('search-results').classList.add('hidden');document.getElementById('global-search').value='';">
          ${statusBadge(t.status)}
          <div><div style="font-size:.85rem;font-weight:600;">${escHtml(t.title)}</div><div style="font-size:.72rem;color:var(--text-dim);">${escHtml(t.project_name||'')}</div></div>
        </div>`).join('');
    }
    el.innerHTML = html;
  } catch { el.innerHTML = `<div style="padding:12px;color:var(--danger);font-size:.8rem;">Search failed</div>`; }
}

// ─────────────────────────────────────────────────────────────────────
// 2. KEYBOARD SHORTCUTS
// ─────────────────────────────────────────────────────────────────────
function initKeyboardShortcuts() {
  document.addEventListener('keydown', e => {
    const tag = document.activeElement?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

    if (e.key === 'n' && !e.ctrlKey && !e.metaKey) { e.preventDefault(); openCreateTask(state.currentProjectId); }
    if (e.key === 'p' && !e.ctrlKey && !e.metaKey) { e.preventDefault(); openCreateProject(); }
    if (e.key === 'd') navigateTo('dashboard');
    if (e.key === 'm') navigateTo('my-tasks');
    if (e.key === 'b' && state.currentProjectId) navigateTo('board', state.currentProjectId);
    if (e.key === 'k' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); document.getElementById('global-search')?.focus(); }
    if (e.key === '?') showShortcutsModal();
  });
}

function showShortcutsModal() {
  openModal('shortcuts-modal', `
    <div class="modal-header">
      <div class="modal-title">Keyboard Shortcuts</div>
      <button class="modal-close" onclick="closeModal('shortcuts-modal')">✕</button>
    </div>
    <div class="modal-body">
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px 24px;">
        ${[
          ['n','New task'],['p','New project'],['d','Go to Dashboard'],
          ['m','My Tasks'],['b','Project Board'],['Ctrl+K','Search'],
          ['?','Show shortcuts'],['Esc','Close modal'],
        ].map(([k,v]) => `
          <div style="display:flex;align-items:center;justify-content:space-between;padding:6px 0;border-bottom:1px solid var(--border);">
            <span style="font-size:.85rem;color:var(--text-muted);">${v}</span>
            <kbd style="background:var(--bg-elevated);border:1px solid var(--border);padding:2px 8px;border-radius:4px;font-size:.75rem;font-family:monospace;">${k}</kbd>
          </div>`).join('')}
      </div>
    </div>`);
}

// ─────────────────────────────────────────────────────────────────────
// 3. DRAG & DROP BOARD COLUMNS
// ─────────────────────────────────────────────────────────────────────
function enableDragDrop() {
  document.querySelectorAll('.task-card').forEach(card => {
    card.setAttribute('draggable', 'true');
    card.addEventListener('dragstart', e => {
      e.dataTransfer.setData('taskId', card.dataset.taskId);
      e.dataTransfer.setData('taskStatus', card.dataset.status);
      card.classList.add('dragging');
    });
    card.addEventListener('dragend', () => card.classList.remove('dragging'));
  });

  document.querySelectorAll('.column-body').forEach(col => {
    col.addEventListener('dragover', e => { e.preventDefault(); col.classList.add('drag-over'); });
    col.addEventListener('dragleave', () => col.classList.remove('drag-over'));
    col.addEventListener('drop', async e => {
      e.preventDefault();
      col.classList.remove('drag-over');
      const taskId = e.dataTransfer.getData('taskId');
      const newStatus = col.closest('.board-column').dataset.status;
      if (!taskId || !newStatus) return;
      try {
        await api.updateTaskStatus(parseInt(taskId), newStatus);
        await navigateTo(state.view, state.currentProjectId);
      } catch (err) { toast(err.message, 'error'); }
    });
  });
}

// Patch renderTaskCard to add drag-and-drop data attributes
const _origRenderTaskCard = window.renderTaskCard;
window.renderTaskCard = function(t) {
  let html = _origRenderTaskCard(t);
  // Inject data attributes and draggable class
  html = html.replace('<div class="task-card"', `<div class="task-card" data-task-id="${t.id}" data-status="${t.status}" draggable="true"`);
  return html;
};

// Patch renderColumn to add data-status to column-body
const _origRenderColumn = window.renderColumn;
window.renderColumn = function(status, label, tasks, projectId) {
  let html = _origRenderColumn(status, label, tasks, projectId);
  html = html.replace('<div class="column-body">', `<div class="column-body" data-status="${status}">`);
  return html;
};

// After each board/my-tasks render, enable drag-drop
const _origNavigateTo = window.navigateTo;
window.navigateTo = async function(view, projectId) {
  await _origNavigateTo(view, projectId);
  if (view === 'board' || view === 'my-tasks') setTimeout(enableDragDrop, 100);
};

// ─────────────────────────────────────────────────────────────────────
// 4. INLINE QUICK EDIT ON TASK CARDS
// ─────────────────────────────────────────────────────────────────────
document.addEventListener('dblclick', e => {
  const card = e.target.closest('.task-card');
  if (!card) return;
  const taskId = card.dataset.taskId;
  if (!taskId) return;
  e.stopPropagation();
  const titleEl = card.querySelector('.task-card-title');
  if (!titleEl) return;
  const oldTitle = titleEl.textContent;
  titleEl.contentEditable = 'true';
  titleEl.style.outline = '2px solid var(--primary)';
  titleEl.style.borderRadius = '4px';
  titleEl.focus();
  const sel = window.getSelection();
  sel.selectAllChildren(titleEl);

  titleEl.addEventListener('keydown', async e2 => {
    if (e2.key === 'Enter') { e2.preventDefault(); titleEl.blur(); }
    if (e2.key === 'Escape') { titleEl.textContent = oldTitle; titleEl.contentEditable = 'false'; titleEl.style.outline = ''; }
  }, { once: true });

  titleEl.addEventListener('blur', async () => {
    titleEl.contentEditable = 'false';
    titleEl.style.outline = '';
    const newTitle = titleEl.textContent.trim();
    if (newTitle && newTitle !== oldTitle) {
      try { await api.updateTask(parseInt(taskId), { title: newTitle }); toast('Updated', 'success'); }
      catch (err) { titleEl.textContent = oldTitle; toast(err.message, 'error'); }
    }
  }, { once: true });
});

// ─────────────────────────────────────────────────────────────────────
// 5. LIST VIEW
// ─────────────────────────────────────────────────────────────────────
async function renderListView(projectId) {
  if (!projectId) return;
  const [projectRes, tasksRes] = await Promise.all([api.getProject(projectId), api.getProjectTasks(projectId)]);
  const { project } = projectRes;
  let { tasks } = tasksRes;

  let sortKey = 'created_at', sortDir = 'desc', filterStatus = '', filterPriority = '';

  function renderTable() {
    let filtered = tasks.filter(t =>
      (!filterStatus || t.status === filterStatus) &&
      (!filterPriority || t.priority === filterPriority)
    );
    const dir = sortDir === 'asc' ? 1 : -1;
    filtered.sort((a, b) => {
      const va = a[sortKey] || '', vb = b[sortKey] || '';
      return va < vb ? -dir : va > vb ? dir : 0;
    });

    return `
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              ${['title','status','priority','assigned_name','due_date','created_at'].map(k => `
                <th onclick="listSort('${k}')" style="cursor:pointer;user-select:none;">
                  ${{title:'Title',status:'Status',priority:'Priority',assigned_name:'Assignee',due_date:'Due Date',created_at:'Created'}[k]}
                  ${sortKey===k ? (sortDir==='asc'?'↑':'↓') : ''}
                </th>`).join('')}
              <th>Time</th><th></th>
            </tr>
          </thead>
          <tbody>
            ${filtered.map(t => `
              <tr onclick="openTaskDetail(${t.id})" style="cursor:pointer;">
                <td style="font-weight:600;max-width:240px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${escHtml(t.title)}</td>
                <td>${statusBadge(t.status)}</td>
                <td>${priorityBadge(t.priority)}</td>
                <td style="font-size:.82rem;color:var(--text-muted);">${escHtml(t.assigned_name||'—')}</td>
                <td style="font-size:.82rem;color:${isPastDue(t.due_date)?'var(--danger)':'var(--text-muted)'};">${t.due_date ? formatDate(t.due_date) : '—'}</td>
                <td style="font-size:.75rem;color:var(--text-dim);">${liveTime(t.created_at)}</td>
                <td style="font-size:.8rem;color:var(--text-muted);">${t.total_seconds ? formatDuration(t.total_seconds) : '—'}</td>
                <td onclick="event.stopPropagation()">
                  <select class="form-control" style="font-size:.75rem;padding:3px 6px;height:auto;" onchange="quickStatusChange(${t.id},this.value)">
                    ${['todo','in_progress','review','done','blocked'].map(s => `<option value="${s}" ${t.status===s?'selected':''}>${s.replace('_',' ')}</option>`).join('')}
                  </select>
                </td>
              </tr>`).join('')}
          </tbody>
        </table>
      </div>`;
  }

  window._listTasks = tasks;
  window._listSort = (k) => {
    if (sortKey === k) sortDir = sortDir === 'asc' ? 'desc' : 'asc';
    else { sortKey = k; sortDir = 'asc'; }
    document.getElementById('list-table-container').innerHTML = renderTable();
  };
  window.listSort = window._listSort;

  document.getElementById('main-content').innerHTML = `
    <div class="page-header">
      <div>
        <div class="page-title" style="display:flex;align-items:center;gap:10px;">
          <div style="width:14px;height:14px;border-radius:50%;background:${project.color};"></div>
          ${escHtml(project.name)} — List View
        </div>
      </div>
      <div style="display:flex;gap:8px;">
        <select class="form-control" style="height:36px;font-size:.82rem;" onchange="filterList('status',this.value)">
          <option value="">All statuses</option>
          ${['todo','in_progress','review','done','blocked'].map(s=>`<option value="${s}">${s.replace('_',' ')}</option>`).join('')}
        </select>
        <select class="form-control" style="height:36px;font-size:.82rem;" onchange="filterList('priority',this.value)">
          <option value="">All priorities</option>
          ${['low','medium','high','urgent'].map(p=>`<option value="${p}">${p}</option>`).join('')}
        </select>
        <button class="btn btn-primary" onclick="openCreateTask(${projectId})">${icon('plus')} Add Task</button>
        <button class="btn btn-secondary btn-sm" onclick="api.exportCSV('tasks',${projectId})" data-tooltip="Export tasks as CSV">${icon('download',14)} CSV</button>
      </div>
    </div>
    <div class="card" id="list-table-container">${renderTable()}</div>`;

  window.filterList = (type, val) => {
    if (type === 'status') filterStatus = val;
    if (type === 'priority') filterPriority = val;
    document.getElementById('list-table-container').innerHTML = renderTable();
  };
}

async function quickStatusChange(taskId, status) {
  try { await api.updateTaskStatus(taskId, status); toast('Status updated', 'success'); }
  catch (err) { toast(err.message, 'error'); }
}

// ─────────────────────────────────────────────────────────────────────
// 6. CALENDAR VIEW
// ─────────────────────────────────────────────────────────────────────
async function renderCalendarView() {
  const { tasks } = await api.getMyTasks();
  const allProjects = state.projects;

  let current = new Date();
  current.setDate(1);

  function buildCalendar(date) {
    const year = date.getFullYear(), month = date.getMonth();
    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const monthName = date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

    const today = new Date().toDateString();
    const tasksByDay = {};
    tasks.forEach(t => {
      if (t.due_date) {
        const d = t.due_date.split('T')[0];
        if (!tasksByDay[d]) tasksByDay[d] = [];
        tasksByDay[d].push(t);
      }
    });

    let cells = '';
    for (let i = 0; i < firstDay; i++) cells += '<div class="cal-cell empty"></div>';
    for (let d = 1; d <= daysInMonth; d++) {
      const dateStr = `${year}-${String(month+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
      const dayTasks = tasksByDay[dateStr] || [];
      const isToday = new Date(year, month, d).toDateString() === today;
      cells += `
        <div class="cal-cell ${isToday ? 'today' : ''}">
          <div class="cal-day-num">${d}</div>
          ${dayTasks.slice(0,3).map(t => `
            <div class="cal-task-chip prio-${t.priority}" onclick="openTaskDetail(${t.id})" title="${escHtml(t.title)}">
              ${escHtml(t.title.slice(0,22))}${t.title.length>22?'…':''}
            </div>`).join('')}
          ${dayTasks.length > 3 ? `<div style="font-size:.68rem;color:var(--text-dim);padding:1px 4px;">+${dayTasks.length-3} more</div>` : ''}
        </div>`;
    }

    return `
      <div class="cal-nav">
        <button class="btn btn-ghost btn-sm" onclick="calNav(-1)">${icon('chevron-left',16)}</button>
        <div style="font-size:1.1rem;font-weight:700;">${monthName}</div>
        <button class="btn btn-ghost btn-sm" onclick="calNav(1)">${icon('chevron-right',16)}</button>
        <button class="btn btn-secondary btn-sm" onclick="calNav(0)">Today</button>
      </div>
      <div class="cal-grid">
        ${['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map(d=>`<div class="cal-header-cell">${d}</div>`).join('')}
        ${cells}
      </div>`;
  }

  document.getElementById('main-content').innerHTML = `
    <div class="page-header">
      <div><div class="page-title">Calendar</div><div class="page-subtitle">Tasks by due date</div></div>
      <button class="btn btn-primary" onclick="openCreateTask(${state.currentProjectId||''})">${icon('plus')} Add Task</button>
    </div>
    <div class="card" id="calendar-container">${buildCalendar(current)}</div>`;

  window.calNav = (dir) => {
    if (dir === 0) current = new Date(), current.setDate(1);
    else current.setMonth(current.getMonth() + dir);
    document.getElementById('calendar-container').innerHTML = buildCalendar(current);
  };
}

// ─────────────────────────────────────────────────────────────────────
// 7. GANTT CHART VIEW
// ─────────────────────────────────────────────────────────────────────
async function renderGanttView(projectId) {
  if (!projectId) return;
  const [projectRes, tasksRes] = await Promise.all([api.getProject(projectId), api.getProjectTasks(projectId)]);
  const { project } = projectRes;
  const tasks = tasksRes.tasks.filter(t => t.due_date);

  if (!tasks.length) {
    document.getElementById('main-content').innerHTML = `
      <div class="page-header"><div class="page-title">Gantt — ${escHtml(project.name)}</div></div>
      ${emptyState('📅','No tasks with due dates','Add due dates to tasks to see them on the Gantt chart')}`;
    return;
  }

  const allDates = tasks.flatMap(t => [new Date(t.created_at), new Date(t.due_date + 'T23:59:59')]);
  let minDate = new Date(Math.min(...allDates.map(d => d.getTime())));
  let maxDate = new Date(Math.max(...allDates.map(d => d.getTime())));
  minDate.setDate(minDate.getDate() - 1);
  maxDate.setDate(maxDate.getDate() + 2);

  const totalDays = Math.ceil((maxDate - minDate) / 86400000);
  const dayW = 36;

  // Build day headers
  let dayHeaders = '', dayLines = '';
  for (let i = 0; i < totalDays; i++) {
    const d = new Date(minDate); d.setDate(d.getDate() + i);
    const isToday = d.toDateString() === new Date().toDateString();
    dayHeaders += `<div class="gantt-day-header ${isToday?'gantt-today-header':''}" style="min-width:${dayW}px;">${d.getDate()}<br><span style="font-size:.6rem;">${['Su','Mo','Tu','We','Th','Fr','Sa'][d.getDay()]}</span></div>`;
    dayLines += `<div class="gantt-day-line ${isToday?'gantt-today-line':''}" style="left:${200 + i*dayW}px;"></div>`;
  }

  const statusColors = { todo:'var(--s-todo)',in_progress:'var(--s-inprog)',review:'var(--s-review)',done:'var(--s-done)',blocked:'var(--s-blocked)' };

  const rows = tasks.map(t => {
    const start = new Date(t.created_at);
    const end = new Date(t.due_date + 'T23:59:59');
    const left = Math.max(0, Math.floor((start - minDate) / 86400000)) * dayW;
    const width = Math.max(dayW, Math.ceil((end - start) / 86400000) * dayW);
    const overdue = isPastDue(t.due_date) && t.status !== 'done';
    return `
      <div class="gantt-row" onclick="openTaskDetail(${t.id})">
        <div class="gantt-label">${escHtml(t.title.slice(0,28))}${t.title.length>28?'…':''}</div>
        <div class="gantt-track" style="width:${totalDays*dayW}px;">
          <div class="gantt-bar" style="left:${left}px;width:${width}px;background:${overdue?'var(--danger)':statusColors[t.status]||'var(--primary)'};"
            title="${escHtml(t.title)} · ${formatDate(t.due_date)}">
            <span class="gantt-bar-label">${formatDate(t.due_date)}</span>
          </div>
        </div>
      </div>`;
  }).join('');

  document.getElementById('main-content').innerHTML = `
    <div class="page-header">
      <div><div class="page-title">Gantt — ${escHtml(project.name)}</div><div class="page-subtitle">${tasks.length} tasks with due dates</div></div>
      <button class="btn btn-secondary btn-sm" onclick="navigateTo('board',${projectId})">${icon('grid',14)} Board</button>
    </div>
    <div class="card" style="overflow:auto;padding:0;">
      <div class="gantt-wrap" style="min-width:${200+totalDays*dayW}px;">
        <div class="gantt-header">
          <div class="gantt-label-header">Task</div>
          <div style="display:flex;">${dayHeaders}</div>
        </div>
        <div style="position:relative;">${dayLines}${rows}</div>
      </div>
    </div>`;
}

// ─────────────────────────────────────────────────────────────────────
// 8. OVERDUE TASKS WIDGET (injected into dashboard)
// ─────────────────────────────────────────────────────────────────────
async function renderOverdueWidget() {
  try {
    const { tasks } = await api.getOverdue();
    if (!tasks.length) return '';
    return `
      <div class="card mb-4" style="border-left:3px solid var(--danger);">
        <div class="card-header">
          <div class="card-title" style="color:var(--danger);">${icon('alert-triangle',16,'color:var(--danger);margin-right:6px;')} Overdue Tasks (${tasks.length})</div>
          <button class="btn btn-ghost btn-sm" onclick="api.exportCSV('tasks')">Export</button>
        </div>
        <div style="display:flex;flex-direction:column;gap:6px;">
          ${tasks.slice(0,5).map(t => `
            <div onclick="openTaskDetail(${t.id})" style="display:flex;align-items:center;gap:10px;padding:8px;border-radius:var(--r-sm);cursor:pointer;background:var(--bg-elevated);">
              <div style="flex:1;min-width:0;">
                <div style="font-size:.85rem;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${escHtml(t.title)}</div>
                <div style="font-size:.72rem;color:var(--danger);">Due ${formatDate(t.due_date)} · ${escHtml(t.project_name||'')}</div>
              </div>
              ${priorityBadge(t.priority)}
            </div>`).join('')}
          ${tasks.length>5?`<div style="font-size:.75rem;color:var(--text-dim);text-align:center;">+${tasks.length-5} more overdue</div>`:''}
        </div>
      </div>`;
  } catch { return ''; }
}

// ─────────────────────────────────────────────────────────────────────
// 9. PROJECT BURNDOWN CHART
// ─────────────────────────────────────────────────────────────────────
async function renderBurndownWidget(projectId) {
  try {
    const { totalTasks, doneTasks, daily, project } = await api.getBurndown(projectId);
    const remaining = totalTasks - doneTasks;
    const pct = totalTasks > 0 ? Math.round((doneTasks/totalTasks)*100) : 0;

    return `
      <div class="card">
        <div class="card-header"><div class="card-title">Burndown — ${escHtml(project.name)}</div></div>
        <div style="display:flex;gap:16px;margin-bottom:16px;">
          <div style="text-align:center;"><div style="font-size:1.6rem;font-weight:800;color:var(--success);">${doneTasks}</div><div style="font-size:.72rem;color:var(--text-dim);">Done</div></div>
          <div style="text-align:center;"><div style="font-size:1.6rem;font-weight:800;color:var(--warning);">${remaining}</div><div style="font-size:.72rem;color:var(--text-dim);">Remaining</div></div>
          <div style="flex:1;align-self:center;">
            <div style="font-size:.72rem;color:var(--text-dim);margin-bottom:4px;">${pct}% complete</div>
            <div class="progress" style="height:10px;"><div class="progress-bar" style="width:${pct}%;background:${project.color};"></div></div>
          </div>
        </div>
        ${daily.length > 1 ? renderMiniChart(daily) : '<div style="font-size:.8rem;color:var(--text-dim);text-align:center;">Complete more tasks to see the trend</div>'}
      </div>`;
  } catch { return ''; }
}

function renderMiniChart(daily) {
  const max = Math.max(...daily.map(d => d.done_count), 1);
  const w = 280, h = 60;
  const pts = daily.map((d, i) => {
    const x = (i / (daily.length - 1)) * w;
    const y = h - (d.done_count / max) * h;
    return `${x},${y}`;
  }).join(' ');
  return `
    <svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" style="width:100%;overflow:visible;">
      <polyline points="${pts}" fill="none" stroke="var(--primary)" stroke-width="2"/>
      ${daily.map((d, i) => {
        const x = (i/(daily.length-1))*w, y = h-(d.done_count/max)*h;
        return `<circle cx="${x}" cy="${y}" r="3" fill="var(--primary)"><title>${d.day}: ${d.done_count} done</title></circle>`;
      }).join('')}
    </svg>`;
}

// ─────────────────────────────────────────────────────────────────────
// 10. PERSONAL PRODUCTIVITY STATS (extended profile)
// ─────────────────────────────────────────────────────────────────────
async function renderProductivityStats() {
  const { completedThisWeek, completedThisMonth, timeThisWeek, timeThisMonth, tasksByStatus, dailyTime, overdue } = await api.getMyStats();

  return `
    <div class="card">
      <div class="card-header"><div class="card-title">Productivity Stats</div></div>
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:12px;margin-bottom:20px;">
        ${[
          [completedThisWeek,'Completed this week','var(--success)','✅'],
          [completedThisMonth,'Completed this month','var(--primary)','📋'],
          [formatDuration(timeThisWeek),'Time this week','var(--warning)','⏱️'],
          [formatDuration(timeThisMonth),'Time this month','var(--secondary)','🕐'],
          [overdue,'Overdue','var(--danger)','🚨'],
        ].map(([v,l,c,ico]) => `
          <div style="background:var(--bg-elevated);border-radius:var(--r-md);padding:12px;text-align:center;">
            <div style="font-size:1.4rem;">${ico}</div>
            <div style="font-size:1.4rem;font-weight:800;color:${c};">${v}</div>
            <div style="font-size:.7rem;color:var(--text-dim);">${l}</div>
          </div>`).join('')}
      </div>

      <div style="margin-bottom:16px;">
        <div style="font-size:.78rem;font-weight:700;color:var(--text-dim);margin-bottom:10px;text-transform:uppercase;">Tasks by Status</div>
        ${tasksByStatus.map(s => `
          <div style="margin-bottom:8px;">
            <div style="display:flex;justify-content:space-between;margin-bottom:3px;">
              ${statusBadge(s.status)}
              <span style="font-size:.8rem;font-weight:700;">${s.count}</span>
            </div>
            <div class="progress"><div class="progress-bar" style="width:${Math.min(100,(s.count/Math.max(...tasksByStatus.map(x=>x.count),1))*100)}%;"></div></div>
          </div>`).join('')}
      </div>

      ${dailyTime.length > 1 ? `
      <div>
        <div style="font-size:.78rem;font-weight:700;color:var(--text-dim);margin-bottom:8px;text-transform:uppercase;">Daily Time (last 30 days)</div>
        ${renderMiniChart(dailyTime.map(d => ({ day: d.day, done_count: Math.round(d.seconds/3600*10)/10 })))}
      </div>` : ''}
    </div>`;
}

// ─────────────────────────────────────────────────────────────────────
// 11. SUBTASKS UI — injected into task detail modal
// ─────────────────────────────────────────────────────────────────────
async function renderSubtasksSection(taskId) {
  const { subtasks } = await api.getSubtasks(taskId);
  const done = subtasks.filter(s => s.is_done).length;
  const pct = subtasks.length ? Math.round((done/subtasks.length)*100) : 0;

  return `
    <div id="subtasks-section" style="margin-bottom:20px;">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;">
        <div style="font-size:.8rem;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:var(--text-dim);">
          Checklist ${subtasks.length ? `(${done}/${subtasks.length})` : ''}
        </div>
        ${subtasks.length ? `<span style="font-size:.75rem;color:var(--primary-light);">${pct}%</span>` : ''}
      </div>
      ${subtasks.length ? `<div class="progress" style="height:4px;margin-bottom:10px;"><div class="progress-bar" style="width:${pct}%;"></div></div>` : ''}
      <div id="subtask-list">
        ${subtasks.map(s => `
          <div class="subtask-item" id="sub-${s.id}">
            <input type="checkbox" ${s.is_done?'checked':''} onchange="toggleSubtask(${s.id},${taskId})" style="width:16px;height:16px;cursor:pointer;">
            <span style="flex:1;font-size:.875rem;${s.is_done?'text-decoration:line-through;color:var(--text-dim);':''}">${escHtml(s.title)}</span>
            <button class="btn-icon" onclick="deleteSubtask(${s.id},${taskId})" style="opacity:.5;" data-tooltip="Delete">${icon('trash-2',12)}</button>
          </div>`).join('')}
      </div>
      <div style="display:flex;gap:6px;margin-top:8px;">
        <input class="form-control" id="new-subtask-${taskId}" placeholder="Add checklist item…" style="flex:1;font-size:.82rem;" onkeydown="if(event.key==='Enter')addSubtask(${taskId})">
        <button class="btn btn-ghost btn-sm" onclick="addSubtask(${taskId})">Add</button>
      </div>
    </div>`;
}

async function toggleSubtask(subId, taskId) {
  try {
    await api.toggleSubtask(subId);
    const section = document.getElementById('subtasks-section');
    if (section) section.outerHTML = await renderSubtasksSection(taskId);
  } catch (err) { toast(err.message, 'error'); }
}

async function addSubtask(taskId) {
  const input = document.getElementById(`new-subtask-${taskId}`);
  if (!input?.value.trim()) return;
  try {
    await api.createSubtask(taskId, input.value.trim());
    input.value = '';
    const section = document.getElementById('subtasks-section');
    if (section) { const html = await renderSubtasksSection(taskId); section.outerHTML = html; }
  } catch (err) { toast(err.message, 'error'); }
}

async function deleteSubtask(subId, taskId) {
  try {
    await api.deleteSubtask(subId);
    document.getElementById(`sub-${subId}`)?.remove();
  } catch (err) { toast(err.message, 'error'); }
}

// ─────────────────────────────────────────────────────────────────────
// 12. LABELS UI — injected into task detail modal
// ─────────────────────────────────────────────────────────────────────
async function renderLabelsSection(taskId, projectId) {
  const [{ labels: taskLabels }, { labels: allLabels }] = await Promise.all([
    api.getTaskLabels(taskId), api.getProjectLabels(projectId)
  ]);
  const taskLabelIds = new Set(taskLabels.map(l => l.id));

  return `
    <div id="labels-section" style="margin-bottom:20px;">
      <div style="font-size:.8rem;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:var(--text-dim);margin-bottom:8px;">Labels</div>
      <div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:8px;">
        ${taskLabels.length === 0 ? '<span style="font-size:.78rem;color:var(--text-dim);">None</span>' :
          taskLabels.map(l => `
            <span class="label-chip" style="background:${l.color}22;color:${l.color};border:1px solid ${l.color}55;">
              ${escHtml(l.name)}
              <span onclick="removeLabel(${taskId},${l.id},${projectId})" style="cursor:pointer;margin-left:4px;opacity:.7;">✕</span>
            </span>`).join('')}
      </div>
      <div style="display:flex;gap:6px;flex-wrap:wrap;">
        ${allLabels.filter(l => !taskLabelIds.has(l.id)).map(l => `
          <span class="label-chip" style="background:var(--bg-elevated);border:1px solid ${l.color};color:${l.color};cursor:pointer;" onclick="addLabel(${taskId},${l.id},${projectId})">
            + ${escHtml(l.name)}
          </span>`).join('')}
        <span class="label-chip" style="background:var(--bg-elevated);cursor:pointer;" onclick="openCreateLabelModal(${projectId},${taskId})">
          ${icon('plus',12)} New label
        </span>
      </div>
    </div>`;
}

async function addLabel(taskId, labelId, projectId) {
  try { await api.addTaskLabel(taskId, labelId); await refreshLabels(taskId, projectId); } catch (err) { toast(err.message, 'error'); }
}
async function removeLabel(taskId, labelId, projectId) {
  try { await api.removeTaskLabel(taskId, labelId); await refreshLabels(taskId, projectId); } catch (err) { toast(err.message, 'error'); }
}
async function refreshLabels(taskId, projectId) {
  const section = document.getElementById('labels-section');
  if (section) section.outerHTML = await renderLabelsSection(taskId, projectId);
}

function openCreateLabelModal(projectId, taskId) {
  const colors = ['#6C5CE7','#00CEC9','#00B894','#FDCB6E','#E17055','#FF5C7A','#74B9FF','#A29BFE'];
  openModal('create-label-modal', `
    <div class="modal-header"><div class="modal-title">Create Label</div><button class="modal-close" onclick="closeModal('create-label-modal')">✕</button></div>
    <div class="modal-body">
      <div class="form-group"><label class="form-label">Name</label><input class="form-control" id="label-name" placeholder="Bug, Feature, Urgent…"></div>
      <div class="form-group">
        <label class="form-label">Color</label>
        <div class="color-picker">${colors.map((c,i)=>`<div class="color-option ${i===0?'selected':''}" style="background:${c}" data-color="${c}" onclick="selectColor(this,'${c}')"></div>`).join('')}</div>
        <input type="hidden" id="label-color" value="${colors[0]}">
      </div>
    </div>
    <div class="modal-footer">
      <button class="btn btn-secondary" onclick="closeModal('create-label-modal')">Cancel</button>
      <button class="btn btn-primary" onclick="submitCreateLabel(${projectId},${taskId})">Create</button>
    </div>`);
}

async function submitCreateLabel(projectId, taskId) {
  const name = document.getElementById('label-name')?.value.trim();
  const color = document.getElementById('label-color')?.value;
  if (!name) return;
  try {
    const { label } = await api.createLabel({ name, color, project_id: projectId });
    await api.addTaskLabel(taskId, label.id);
    closeModal('create-label-modal');
    await refreshLabels(taskId, projectId);
  } catch (err) { toast(err.message, 'error'); }
}

// ─────────────────────────────────────────────────────────────────────
// 13. TASK WATCHERS UI
// ─────────────────────────────────────────────────────────────────────
async function renderWatchersSection(taskId) {
  const { watchers, isWatching } = await api.getWatchers(taskId);
  return `
    <div id="watchers-section" style="margin-bottom:20px;">
      <div style="font-size:.8rem;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:var(--text-dim);margin-bottom:8px;">
        Watchers (${watchers.length})
      </div>
      <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
        <div class="avatar-group">
          ${watchers.slice(0,5).map(w => `<div class="avatar avatar-sm" data-tooltip="${escHtml(w.full_name)}">${avatarInitials(w.full_name)}</div>`).join('')}
          ${watchers.length > 5 ? `<div class="avatar avatar-sm">+${watchers.length-5}</div>` : ''}
        </div>
        <button class="btn btn-${isWatching?'danger':'ghost'} btn-sm" onclick="toggleWatch(${taskId})">
          ${icon('eye',14)} ${isWatching ? 'Unwatch' : 'Watch'}
        </button>
      </div>
    </div>`;
}

async function toggleWatch(taskId) {
  try {
    const { isWatching } = await api.getWatchers(taskId);
    if (isWatching) await api.unwatchTask(taskId);
    else await api.watchTask(taskId);
    const section = document.getElementById('watchers-section');
    if (section) section.outerHTML = await renderWatchersSection(taskId);
  } catch (err) { toast(err.message, 'error'); }
}

// ─────────────────────────────────────────────────────────────────────
// 14. TASK DEPENDENCIES UI
// ─────────────────────────────────────────────────────────────────────
async function renderDependenciesSection(taskId, projectId) {
  const { dependencies, blockedBy } = await api.getDependencies(taskId);
  const allTasks = projectId ? (await api.getProjectTasks(projectId)).tasks.filter(t => t.id !== taskId) : [];

  return `
    <div id="deps-section" style="margin-bottom:20px;">
      <div style="font-size:.8rem;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:var(--text-dim);margin-bottom:8px;">Dependencies</div>
      ${dependencies.length ? `
        <div style="margin-bottom:8px;">
          <div style="font-size:.72rem;color:var(--text-dim);margin-bottom:4px;">This task depends on:</div>
          ${dependencies.map(d => `
            <div style="display:flex;align-items:center;gap:6px;padding:4px 0;">
              ${statusBadge(d.status)}
              <span style="font-size:.82rem;flex:1;">${escHtml(d.title)}</span>
              <button class="btn-icon" onclick="removeDep(${taskId},${d.id},${projectId})" style="opacity:.5;">${icon('x',12)}</button>
            </div>`).join('')}
        </div>` : ''}
      ${blockedBy.length ? `
        <div style="margin-bottom:8px;">
          <div style="font-size:.72rem;color:var(--text-dim);margin-bottom:4px;">Blocks:</div>
          ${blockedBy.map(d => `<div style="font-size:.82rem;color:var(--text-muted);padding:2px 0;">${statusBadge(d.status)} ${escHtml(d.title)}</div>`).join('')}
        </div>` : ''}
      ${allTasks.length ? `
        <div style="display:flex;gap:6px;">
          <select class="form-control" id="dep-select-${taskId}" style="font-size:.78rem;height:32px;">
            <option value="">Add dependency…</option>
            ${allTasks.map(t=>`<option value="${t.id}">${escHtml(t.title)}</option>`).join('')}
          </select>
          <button class="btn btn-ghost btn-sm" onclick="addDep(${taskId},${projectId})">Add</button>
        </div>` : ''}
    </div>`;
}

async function addDep(taskId, projectId) {
  const sel = document.getElementById(`dep-select-${taskId}`);
  if (!sel?.value) return;
  try {
    await api.addDependency(taskId, parseInt(sel.value));
    const section = document.getElementById('deps-section');
    if (section) section.outerHTML = await renderDependenciesSection(taskId, projectId);
  } catch (err) { toast(err.message, 'error'); }
}

async function removeDep(taskId, depId, projectId) {
  try {
    await api.removeDependency(taskId, depId);
    const section = document.getElementById('deps-section');
    if (section) section.outerHTML = await renderDependenciesSection(taskId, projectId);
  } catch (err) { toast(err.message, 'error'); }
}

// ─────────────────────────────────────────────────────────────────────
// 15. FILE ATTACHMENTS UI
// ─────────────────────────────────────────────────────────────────────
async function renderAttachmentsSection(taskId) {
  const { attachments } = await api.getAttachments(taskId);
  const icons = { 'image/': '🖼️', 'application/pdf': '📄', 'text/': '📝', 'video/': '🎬', 'audio/': '🎵' };
  const getIcon = mime => { for (const [k, v] of Object.entries(icons)) if (mime?.startsWith(k)) return v; return '📎'; };
  const fmtSize = b => b < 1024 ? `${b}B` : b < 1048576 ? `${(b/1024).toFixed(1)}KB` : `${(b/1048576).toFixed(1)}MB`;

  return `
    <div id="attachments-section" style="margin-bottom:20px;">
      <div style="font-size:.8rem;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:var(--text-dim);margin-bottom:8px;">
        Attachments (${attachments.length})
      </div>
      ${attachments.map(a => `
        <div style="display:flex;align-items:center;gap:8px;padding:6px 0;border-bottom:1px solid var(--border);">
          <span style="font-size:1.2rem;">${getIcon(a.mime_type)}</span>
          <div style="flex:1;min-width:0;">
            <div style="font-size:.82rem;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${escHtml(a.original_name)}</div>
            <div style="font-size:.7rem;color:var(--text-dim);">${fmtSize(a.size_bytes)} · ${escHtml(a.full_name)} · ${liveTime(a.created_at)}</div>
          </div>
          <a href="/uploads/${taskId}/${a.filename}" download="${escHtml(a.original_name)}" class="btn-icon" data-tooltip="Download">${icon('download',14)}</a>
          <button class="btn-icon" onclick="deleteAttachment(${a.id},${taskId})" style="color:var(--danger);" data-tooltip="Delete">${icon('trash-2',12)}</button>
        </div>`).join('')}
      <div style="margin-top:8px;">
        <label class="btn btn-ghost btn-sm" style="cursor:pointer;">
          ${icon('paperclip',14)} Attach file
          <input type="file" style="display:none;" onchange="uploadAttachment(${taskId},this)">
        </label>
      </div>
    </div>`;
}

async function uploadAttachment(taskId, input) {
  const file = input.files?.[0];
  if (!file) return;
  const fd = new FormData(); fd.append('file', file);
  try {
    toast('Uploading…', 'info');
    await api.uploadAttachment(taskId, fd);
    const section = document.getElementById('attachments-section');
    if (section) section.outerHTML = await renderAttachmentsSection(taskId);
    toast('Uploaded', 'success');
  } catch (err) { toast(err.message || 'Upload failed', 'error'); }
}

async function deleteAttachment(attId, taskId) {
  if (!confirm('Delete this attachment?')) return;
  try {
    await api.deleteAttachment(attId);
    const section = document.getElementById('attachments-section');
    if (section) section.outerHTML = await renderAttachmentsSection(taskId);
  } catch (err) { toast(err.message, 'error'); }
}

// ─────────────────────────────────────────────────────────────────────
// 16. TASK TEMPLATES — extend create-task modal
// ─────────────────────────────────────────────────────────────────────
async function applyTemplate(projectId) {
  const { templates } = await api.getTemplates(projectId);
  if (!templates.length) { toast('No templates yet', 'info'); return; }
  openModal('template-picker', `
    <div class="modal-header"><div class="modal-title">Apply Template</div><button class="modal-close" onclick="closeModal('template-picker')">✕</button></div>
    <div class="modal-body">
      ${templates.map(t => `
        <div onclick="fillFromTemplate(${JSON.stringify(t).replace(/"/g,'&quot;')})" style="padding:10px;border-radius:var(--r-sm);cursor:pointer;border:1px solid var(--border);margin-bottom:8px;">
          <div style="font-weight:600;font-size:.875rem;">${escHtml(t.name)}</div>
          ${t.description ? `<div style="font-size:.78rem;color:var(--text-muted);">${escHtml(t.description)}</div>` : ''}
          <span class="priority-badge prio-${t.priority}" style="margin-top:4px;">${t.priority}</span>
        </div>`).join('')}
    </div>`);
}

function fillFromTemplate(tpl) {
  const nameEl = document.getElementById('task-title');
  const descEl = document.getElementById('task-desc');
  const prioEl = document.getElementById('task-priority');
  if (nameEl && tpl.name) nameEl.value = tpl.name;
  if (descEl && tpl.description) descEl.value = tpl.description;
  if (prioEl && tpl.priority) prioEl.value = tpl.priority;
  closeModal('template-picker');
  toast('Template applied', 'success');
}

async function saveAsTemplate(projectId) {
  const title = document.getElementById('task-title')?.value.trim();
  const desc = document.getElementById('task-desc')?.value.trim();
  const priority = document.getElementById('task-priority')?.value;
  if (!title) { toast('Enter a title first', 'warning'); return; }
  const name = prompt('Template name:', title);
  if (!name) return;
  try {
    await api.createTemplate({ name, description: desc, priority, project_id: projectId });
    toast('Saved as template', 'success');
  } catch (err) { toast(err.message, 'error'); }
}

// ─────────────────────────────────────────────────────────────────────
// 17. RECURRING TASKS — extend create-task modal
// ─────────────────────────────────────────────────────────────────────
function renderRecurrenceFields() {
  return `
    <div class="form-group" id="recurrence-group">
      <label class="form-label">Recurrence</label>
      <select class="form-control" id="task-recurrence" onchange="toggleRecurrenceEnd(this.value)">
        <option value="">None</option>
        <option value="daily">Daily</option>
        <option value="weekly">Weekly</option>
        <option value="monthly">Monthly</option>
      </select>
    </div>
    <div class="form-group hidden" id="recurrence-end-group">
      <label class="form-label">Repeat until</label>
      <input class="form-control" type="date" id="task-recurrence-end">
    </div>`;
}

function toggleRecurrenceEnd(val) {
  const el = document.getElementById('recurrence-end-group');
  if (el) el.classList.toggle('hidden', !val);
}

// ─────────────────────────────────────────────────────────────────────
// 18. @MENTION AUTOCOMPLETE IN COMMENTS
// ─────────────────────────────────────────────────────────────────────
function initMentionAutocomplete(inputId, teamMembers) {
  const input = document.getElementById(inputId);
  if (!input || !teamMembers.length) return;

  let dropdown = null;

  function closeDrop() { dropdown?.remove(); dropdown = null; }

  input.addEventListener('input', () => {
    const val = input.value;
    const atPos = val.lastIndexOf('@');
    if (atPos === -1) { closeDrop(); return; }
    const partial = val.slice(atPos + 1).toLowerCase();
    const matches = teamMembers.filter(m => m.full_name.toLowerCase().includes(partial)).slice(0, 6);

    if (!matches.length) { closeDrop(); return; }

    if (!dropdown) {
      dropdown = document.createElement('div');
      dropdown.className = 'mention-dropdown';
      input.parentNode.style.position = 'relative';
      input.parentNode.appendChild(dropdown);
    }

    dropdown.innerHTML = '';
    matches.forEach(m => {
      const item = document.createElement('div');
      item.className = 'mention-item';
      item.innerHTML = `${avatarHtml(m, 'avatar-sm')} <span>${escHtml(m.full_name)}</span>`;
      item.addEventListener('mousedown', (e) => {
        e.preventDefault();
        const pos = input.value.lastIndexOf('@');
        input.value = input.value.slice(0, pos) + '@' + m.full_name + ' ';
        input.focus();
        closeDrop();
      });
      dropdown.appendChild(item);
    });
  });

  input.addEventListener('blur', () => setTimeout(closeDrop, 150));
}

// ─────────────────────────────────────────────────────────────────────
// 19. PROJECT ACTIVITY FEED
// ─────────────────────────────────────────────────────────────────────
async function renderProjectActivity(projectId) {
  try {
    const { activity } = await api.getProjectActivity(projectId);
    if (!activity.length) return '<div style="color:var(--text-dim);font-size:.8rem;padding:8px 0;">No activity yet</div>';
    return activity.map(a => `
      <div style="display:flex;align-items:flex-start;gap:10px;padding:8px 0;border-bottom:1px solid var(--border);">
        ${avatarHtml(a,'avatar-sm')}
        <div style="flex:1;">
          <span style="font-weight:600;font-size:.82rem;">${escHtml(a.full_name)}</span>
          <span style="font-size:.82rem;color:var(--text-muted);"> ${escHtml(a.action)} ${a.entity_type}</span>
        </div>
        <div style="font-size:.7rem;color:var(--text-dim);white-space:nowrap;">${liveTime(a.created_at)}</div>
      </div>`).join('');
  } catch { return '<div style="color:var(--danger);font-size:.8rem;">Failed to load activity</div>'; }
}

// ─────────────────────────────────────────────────────────────────────
// 20. THEME SYNC — apply server-saved theme on login
// ─────────────────────────────────────────────────────────────────────
function applySavedTheme(user) {
  if (!user) return;
  const isLight = user.theme === 'light';
  document.body.classList.toggle('light-mode', isLight);
  localStorage.setItem('pf_theme', isLight ? 'light' : 'dark');
}

// Override logout to also reset theme state
const _origLogout = window.logout;
window.logout = function() {
  document.body.classList.remove('light-mode');
  _origLogout();
};

// ─────────────────────────────────────────────────────────────────────
// 21. PATCH EXISTING FUNCTIONS TO INJECT NEW FEATURES
// ─────────────────────────────────────────────────────────────────────

// Patch renderDashboard to add overdue widget
const _origRenderDashboard = window.renderDashboard;
window.renderDashboard = async function() {
  await _origRenderDashboard();
  const overdueHtml = await renderOverdueWidget();
  if (overdueHtml) {
    const main = document.getElementById('main-content');
    const pageHeader = main?.querySelector('.page-header');
    if (pageHeader) pageHeader.insertAdjacentHTML('afterend', overdueHtml);
  }
};

// Shared task section injector — called by both modal and full-page views
async function _injectTaskSections(taskId) {
  try {
    const { task } = await api.getTask(taskId);
    const projectId = task.project_id;
    const leftCol = document.querySelector('.task-detail-grid > div:first-child');
    if (!leftCol) return;
    const timerDiv = leftCol.querySelectorAll('div[style*="margin-bottom:20px"]');
    const insertTarget = timerDiv.length >= 2 ? timerDiv[1] : timerDiv[0];
    if (insertTarget) {
      const [subtasksHtml, labelsHtml, watchersHtml, depsHtml, attachHtml] = await Promise.all([
        renderSubtasksSection(taskId),
        renderLabelsSection(taskId, projectId),
        renderWatchersSection(taskId),
        renderDependenciesSection(taskId, projectId),
        renderAttachmentsSection(taskId),
      ]);
      insertTarget.insertAdjacentHTML('afterend', subtasksHtml + labelsHtml + watchersHtml + depsHtml + attachHtml);
    }
  } catch {}
}
window._injectTaskSections = _injectTaskSections;

// Patch openTaskDetail to inject extra sections
const _origOpenTaskDetail = window.openTaskDetail;
window.openTaskDetail = async function(taskId) {
  await _origOpenTaskDetail(taskId);
  await _injectTaskSections(taskId);
};

// Patch openCreateTask to add template/recurrence fields
const _origOpenCreateTask = window.openCreateTask;
window.openCreateTask = async function(projectId, defaultStatus) {
  await _origOpenCreateTask(projectId, defaultStatus);

  // Inject template + recurrence after the assign-to field
  const footer = document.querySelector('#create-task-modal .modal-footer');
  if (footer) {
    const recHtml = renderRecurrenceFields();
    footer.insertAdjacentHTML('beforebegin', recHtml);

    // Add template + save-as-template buttons to footer
    const cancelBtn = footer.querySelector('.btn-secondary');
    if (cancelBtn && projectId) {
      cancelBtn.insertAdjacentHTML('beforebegin', `
        <button class="btn btn-ghost btn-sm" onclick="applyTemplate(${projectId})">Use Template</button>
        <button class="btn btn-ghost btn-sm" onclick="saveAsTemplate(${projectId})">Save as Template</button>
      `);
    }
  }
};

// Patch submitCreateTask to include recurrence
const _origSubmitCreateTask = window.submitCreateTask;
window.submitCreateTask = async function() {
  // Temporarily inject recurrence data before calling original
  const recEl = document.getElementById('task-recurrence');
  const recEndEl = document.getElementById('task-recurrence-end');
  if (recEl?.value) {
    // We monkey-patch api.createTask for this one call
    const _orig = api.createTask.bind(api);
    api.createTask = function(data) {
      data.recurrence = JSON.stringify({ type: recEl.value });
      data.recurrence_end = recEndEl?.value || null;
      api.createTask = _orig;
      return _orig(data);
    };
  }
  await _origSubmitCreateTask();
};

// Patch renderProfile to add productivity stats
const _origRenderProfile = window.renderProfile;
window.renderProfile = async function() {
  await _origRenderProfile();
  try {
    const statsHtml = await renderProductivityStats();
    const main = document.getElementById('main-content');
    const grid = main?.querySelector('.grid-2');
    if (grid) grid.insertAdjacentHTML('afterend', statsHtml);
  } catch {}
};

// Patch showApp to apply server theme
const _origShowApp = window.showApp;
window.showApp = async function() {
  applySavedTheme(state.user);
  await _origShowApp();
  initSearch();
  initKeyboardShortcuts();
};

// ─────────────────────────────────────────────────────────────────────
// 22. NAVIGATION EXTENSIONS — Calendar, List, Gantt views
// ─────────────────────────────────────────────────────────────────────

// Extend navigateTo to handle new views
const _origNavigateTo2 = window.navigateTo;
window.navigateTo = async function(view, projectId) {
  if (view === 'calendar') {
    state.view = 'calendar';
    document.querySelectorAll('.sidebar-item[data-view]').forEach(el => el.classList.toggle('active', el.dataset.view === 'calendar'));
    const titleEl = document.getElementById('header-title');
    if (titleEl) titleEl.textContent = 'Calendar';
    const main = document.getElementById('main-content');
    if (main) main.innerHTML = `<div class="page-loading"><div class="spinner spinner-lg"></div></div>`;
    try { await renderCalendarView(); } catch (err) { if (main) main.innerHTML = `<div class="empty-state"><p>${err.message}</p></div>`; }
    return;
  }
  if (view === 'list' && projectId) {
    state.view = 'list';
    if (projectId) state.currentProjectId = projectId;
    const titleEl = document.getElementById('header-title');
    if (titleEl) titleEl.textContent = 'List View';
    const main = document.getElementById('main-content');
    if (main) main.innerHTML = `<div class="page-loading"><div class="spinner spinner-lg"></div></div>`;
    try { await renderListView(projectId); } catch (err) { if (main) main.innerHTML = `<div class="empty-state"><p>${err.message}</p></div>`; }
    return;
  }
  if (view === 'gantt' && projectId) {
    state.view = 'gantt';
    if (projectId) state.currentProjectId = projectId;
    const titleEl = document.getElementById('header-title');
    if (titleEl) titleEl.textContent = 'Gantt';
    const main = document.getElementById('main-content');
    if (main) main.innerHTML = `<div class="page-loading"><div class="spinner spinner-lg"></div></div>`;
    try { await renderGanttView(projectId); } catch (err) { if (main) main.innerHTML = `<div class="empty-state"><p>${err.message}</p></div>`; }
    return;
  }
  return _origNavigateTo2(view, projectId);
};

// Add view-toggle buttons to board header after render
const _origRenderBoard = window.renderBoard;
window.renderBoard = async function(projectId) {
  await _origRenderBoard(projectId);
  if (!projectId) return;

  const header = document.querySelector('#main-content .page-header');
  if (!header) return;

  const viewToggle = document.createElement('div');
  viewToggle.style.cssText = 'display:flex;gap:4px;align-items:center;';
  viewToggle.innerHTML = `
    <div style="display:flex;gap:2px;background:var(--bg-elevated);padding:3px;border-radius:var(--r-sm);">
      <button class="btn btn-primary btn-sm view-btn" title="Board" onclick="navigateTo('board',${projectId})">${icon('grid',14)}</button>
      <button class="btn btn-ghost btn-sm view-btn" title="List" onclick="navigateTo('list',${projectId})">${icon('list',14)}</button>
      <button class="btn btn-ghost btn-sm view-btn" title="Calendar" onclick="navigateTo('calendar')">${icon('calendar',14)}</button>
      <button class="btn btn-ghost btn-sm view-btn" title="Gantt" onclick="navigateTo('gantt',${projectId})">${icon('bar-chart-2',14)}</button>
    </div>`;

  const actionsDiv = header.querySelector('[style*="display:flex;gap:8px"]');
  if (actionsDiv) actionsDiv.prepend(viewToggle);

  // Add activity feed tab in a side section
  try {
    const activityHtml = await renderProjectActivity(projectId);
    const main = document.getElementById('main-content');
    main?.insertAdjacentHTML('beforeend', `
      <div class="card mt-4" id="project-activity-feed">
        <div class="card-header"><div class="card-title">${icon('activity',14)} Project Activity</div></div>
        ${activityHtml}
      </div>`);
  } catch {}
};

// Add missing icons to app.js icon set
const _origIcon = window.icon;
window.icon = function(name, size = 18, style = '') {
  const extras = {
    'search': `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="${style}"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>`,
    'loader': `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="${style}"><line x1="12" y1="2" x2="12" y2="6"/><line x1="12" y1="18" x2="12" y2="22"/><line x1="4.93" y1="4.93" x2="7.76" y2="7.76"/><line x1="16.24" y1="16.24" x2="19.07" y2="19.07"/><line x1="2" y1="12" x2="6" y2="12"/><line x1="18" y1="12" x2="22" y2="12"/><line x1="4.93" y1="19.07" x2="7.76" y2="16.24"/><line x1="16.24" y1="7.76" x2="19.07" y2="4.93"/></svg>`,
    'list': `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="${style}"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>`,
    'bar-chart-2': `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="${style}"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/><line x1="2" y1="20" x2="22" y2="20"/></svg>`,
    'download': `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="${style}"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>`,
    'alert-triangle': `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="${style}"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>`,
    'eye': `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="${style}"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>`,
    'activity': `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="${style}"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>`,
    'paperclip': `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="${style}"><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/></svg>`,
    'x': `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="${style}"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`,
    'chevron-left': `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="${style}"><polyline points="15 18 9 12 15 6"/></svg>`,
  };
  return extras[name] || _origIcon(name, size, style);
};

// ─────────────────────────────────────────────────────────────────────
// 23. ADD CALENDAR LINK TO SIDEBAR NAV
// ─────────────────────────────────────────────────────────────────────
const _origRenderShell = window.renderShell;
window.renderShell = function() {
  _origRenderShell();
  // Inject Calendar nav item after time-tracking
  const nav = document.getElementById('sidebar-nav');
  if (!nav) return;
  const ttItem = nav.querySelector('[data-view="time-tracking"]');
  if (ttItem) {
    const calItem = document.createElement('div');
    calItem.className = 'sidebar-item';
    calItem.dataset.view = 'calendar';
    calItem.onclick = () => navigateTo('calendar');
    calItem.innerHTML = `${icon('calendar')} <span>Calendar</span>`;
    ttItem.after(calItem);
  }
};

console.log('✅ ProjectFlow features loaded');
