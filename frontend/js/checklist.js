import { apiRequest, callAiEndpoint } from './api.js';
import {
  escapeHtml,
  formatDate,
  getDaysUntil,
  initProtectedPage,
  openConfirmModal,
  renderIcons,
  renderNoEventState,
  setButtonLoading,
  showToast
} from './main.js';

const TASK_CATEGORIES = [
  'Venue', 'Guest management', 'Decoration', 'Catering', 'Vendors',
  'Budget', 'Invitations', 'Logistics', 'Entertainment', 'General'
];

initProtectedPage({
  activeKey: 'checklist',
  pageTitle: 'Smart AI Checklist',
  onReady: async ({ activeEvent }) => {
    const root = document.getElementById('checklist-root');
    if (!root) return;
    if (!activeEvent) {
      renderNoEventState(root, 'Select or Create an Event to Manage Tasks');
      return;
    }

    const apiBase = `/api/events/${encodeURIComponent(activeEvent.id)}/tasks`;
    let tasks = [];
    let filterStatus = 'all';
    let filterCategory = 'All';
    let searchQuery = '';

    async function loadTasks() {
      const data = await apiRequest(apiBase);
      tasks = data.tasks || [];
    }

    function render() {
      const completedCount = tasks.filter((t) => t.status === 'completed').length;
      const overdueTasks = tasks.filter((t) => t.status !== 'completed' && t.dueDate && (getDaysUntil(t.dueDate) ?? 0) < 0);
      const dueSoonTasks = tasks.filter((t) => {
        if (t.status === 'completed' || !t.dueDate) return false;
        const d = getDaysUntil(t.dueDate);
        return d !== null && d >= 0 && d <= 7;
      });

      const filtered = tasks.filter((t) => {
        if (filterCategory !== 'All' && t.category !== filterCategory) return false;
        if (filterStatus === 'completed' && t.status !== 'completed') return false;
        if (filterStatus === 'upcoming' && (t.status === 'completed' || (t.dueDate && (getDaysUntil(t.dueDate) ?? 0) < 0))) return false;
        if (filterStatus === 'overdue' && (t.status === 'completed' || !t.dueDate || (getDaysUntil(t.dueDate) ?? 0) >= 0)) return false;
        if (searchQuery) {
          const q = searchQuery.toLowerCase();
          if (!`${t.title} ${t.description || ''} ${t.category}`.toLowerCase().includes(q)) return false;
        }
        return true;
      });

      const pct = tasks.length ? Math.round((completedCount / tasks.length) * 100) : 0;

      root.innerHTML = `
        <section class="surface-forest panel-pad" style="margin-bottom:20px;">
          <div style="display:flex;justify-content:space-between;align-items:center;gap:16px;flex-wrap:wrap;">
            <div>
              <h1 style="font-size:34px;">Smart AI Checklist</h1>
              <div class="meta-inline text-sage" style="font-size:13px;margin-top:4px;">
                <span class="tabular-nums">${completedCount} of ${tasks.length} completed (${pct}%)</span>
                <span class="meta-sep">·</span>
                <span class="tabular-nums">${overdueTasks.length} overdue</span>
                <span class="meta-sep">·</span>
                <span class="tabular-nums">${dueSoonTasks.length} due within 7 days</span>
              </div>
            </div>
            <div style="display:flex;gap:10px;flex-wrap:wrap;">
              <button type="button" id="ai-gen-tasks-btn" class="btn btn-primary">Generate AI Tasks</button>
              <button type="button" id="open-add-task" class="btn btn-secondary">Add Task</button>
            </div>
          </div>
        </section>

        ${
          overdueTasks.length > 0 || dueSoonTasks.length > 0
            ? `<div class="surface-ivory panel-pad" style="margin-bottom:18px;">
                <strong style="display:block;margin-bottom:6px;">Deadline Reminders</strong>
                <div class="meta-inline text-muted-ivory" style="font-size:13.5px;">
                  ${overdueTasks.length ? `<span class="status-danger">${overdueTasks.length} task(s) overdue</span>` : ''}
                  ${overdueTasks.length && dueSoonTasks.length ? '<span class="meta-sep">·</span>' : ''}
                  ${dueSoonTasks.length ? `<span class="status-warning">${dueSoonTasks.length} task(s) due within 7 days</span>` : ''}
                </div>
              </div>`
            : ''
        }

        <div id="tasks-ai-loader"></div>

        <section class="surface-ivory panel-pad">
          <div class="panel-head">
            <div class="segmented-bar">
              ${[
                { k: 'all', label: `All (${tasks.length})` },
                { k: 'upcoming', label: 'Upcoming' },
                { k: 'overdue', label: `Overdue (${overdueTasks.length})` },
                { k: 'completed', label: `Completed (${completedCount})` }
              ]
                .map((tab) => `<button type="button" class="segmented-btn ${filterStatus === tab.k ? 'active' : ''}" data-status-tab="${tab.k}">${tab.label}</button>`)
                .join('')}
            </div>
            <div style="display:flex;gap:10px;flex-wrap:wrap;">
              <input id="task-search" class="field-input" style="min-width:210px;min-height:38px;" placeholder="Search tasks..." value="${escapeHtml(searchQuery)}" />
              <select id="task-cat-filter" class="field-select" style="width:auto;min-height:38px;">
                <option value="All">All Categories</option>
                ${TASK_CATEGORIES.map((c) => `<option value="${c}" ${filterCategory === c ? 'selected' : ''}>${c}</option>`).join('')}
              </select>
            </div>
          </div>

          ${
            filtered.length === 0
              ? `<div class="empty-state">
                  <p class="text-muted-ivory">No tasks match the current view.</p>
                  <button type="button" id="empty-add-task" class="btn btn-ivory-primary">Add New Task</button>
                </div>`
              : `<div style="display:flex;flex-direction:column;gap:10px;">
                  ${filtered
                    .map((t) => {
                      const dLeft = getDaysUntil(t.dueDate);
                      const isOverdue = t.status !== 'completed' && dLeft !== null && dLeft < 0;
                      return `
                        <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:16px;padding:14px 16px;border-radius:10px;background:#fff;border:var(--border-ivory);">
                          <div style="display:flex;gap:12px;align-items:flex-start;">
                            <input type="checkbox" data-toggle-task="${escapeHtml(t.id)}" ${t.status === 'completed' ? 'checked' : ''} style="width:18px;height:18px;margin-top:3px;cursor:pointer;" aria-label="Mark task complete" />
                            <div>
                              <div style="font-weight:600;${t.status === 'completed' ? 'text-decoration:line-through;opacity:0.6;' : ''}">${escapeHtml(t.title)}</div>
                              ${t.description ? `<div class="text-muted-ivory" style="font-size:13px;margin-top:2px;">${escapeHtml(t.description)}</div>` : ''}
                              <div class="meta-inline text-muted-ivory" style="font-size:12px;margin-top:6px;">
                                <span>${escapeHtml(t.category)}</span>
                                <span class="meta-sep">·</span>
                                <span class="${t.priority === 'high' ? 'status-danger' : t.priority === 'medium' ? 'status-warning' : 'status-neutral'}" style="text-transform:capitalize;">${escapeHtml(t.priority)} priority</span>
                                ${t.dueDate ? `<span class="meta-sep">·</span><span class="tabular-nums ${isOverdue ? 'status-danger' : ''}">${isOverdue ? 'Overdue · ' : 'Due '}${escapeHtml(formatDate(t.dueDate))}</span>` : ''}
                                ${t.aiGenerated ? `<span class="meta-sep">·</span><span>AI Suggested</span>` : ''}
                              </div>
                            </div>
                          </div>
                          <div style="display:flex;gap:6px;flex-shrink:0;">
                            <button type="button" class="btn btn-sm btn-ivory-outline" data-edit-task="${escapeHtml(t.id)}">Edit</button>
                            <button type="button" class="btn btn-sm btn-danger-ivory" data-del-task="${escapeHtml(t.id)}">Delete</button>
                          </div>
                        </div>
                      `;
                    })
                    .join('')}
                </div>`
          }
        </section>

        <div id="task-modal" class="modal-backdrop">
          <div class="modal-panel">
            <div class="modal-header">
              <h3 id="task-modal-title" style="font-size:24px;">Add Task</h3>
              <button type="button" class="btn btn-sm btn-ivory-outline" id="close-task-modal">Close</button>
            </div>
            <form id="task-form" style="display:flex;flex-direction:column;gap:14px;">
              <input type="hidden" id="task-id" />
              <div class="field-group">
                <label class="field-label" for="task-title">Task Title</label>
                <input id="task-title" class="field-input" required maxlength="200" />
              </div>
              <div class="field-group">
                <label class="field-label" for="task-desc">Description</label>
                <textarea id="task-desc" class="field-textarea" maxlength="1000" style="min-height:80px;"></textarea>
              </div>
              <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;">
                <div class="field-group">
                  <label class="field-label" for="task-cat">Category</label>
                  <select id="task-cat" class="field-select">
                    ${TASK_CATEGORIES.map((c) => `<option value="${c}">${c}</option>`).join('')}
                  </select>
                </div>
                <div class="field-group">
                  <label class="field-label" for="task-prio">Priority</label>
                  <select id="task-prio" class="field-select">
                    <option value="high">High</option>
                    <option value="medium" selected>Medium</option>
                    <option value="low">Low</option>
                  </select>
                </div>
                <div class="field-group">
                  <label class="field-label" for="task-due">Due Date</label>
                  <input id="task-due" type="date" class="field-input" />
                </div>
              </div>
              <div class="modal-footer">
                <button type="button" class="btn btn-ivory-outline" id="cancel-task-modal">Cancel</button>
                <button type="submit" class="btn btn-ivory-primary">Save Task</button>
              </div>
            </form>
          </div>
        </div>
      `;

      const modal = document.getElementById('task-modal');
      const openModal = (t = null) => {
        document.getElementById('task-modal-title').textContent = t ? 'Edit Task' : 'Add Task';
        document.getElementById('task-id').value = t?.id || '';
        document.getElementById('task-title').value = t?.title || '';
        document.getElementById('task-desc').value = t?.description || '';
        document.getElementById('task-cat').value = t?.category || 'General';
        document.getElementById('task-prio').value = t?.priority || 'medium';
        document.getElementById('task-due').value = t?.dueDate || '';
        modal.classList.add('open');
      };
      const closeModal = () => modal.classList.remove('open');

      document.getElementById('open-add-task').onclick = () => openModal(null);
      document.getElementById('empty-add-task')?.addEventListener('click', () => openModal(null));
      document.getElementById('close-task-modal').onclick = closeModal;
      document.getElementById('cancel-task-modal').onclick = closeModal;

      root.querySelectorAll('[data-status-tab]').forEach((b) => {
        b.onclick = () => {
          filterStatus = b.dataset.statusTab;
          render();
        };
      });

      document.getElementById('task-cat-filter').onchange = (e) => {
        filterCategory = e.target.value;
        render();
      };

      document.getElementById('task-search').oninput = (e) => {
        searchQuery = e.target.value;
        render();
        const input = document.getElementById('task-search');
        if (input) {
          input.focus();
          input.setSelectionRange(input.value.length, input.value.length);
        }
      };

      root.querySelectorAll('[data-toggle-task]').forEach((cb) => {
        cb.onchange = async () => {
          const t = tasks.find((x) => x.id === cb.dataset.toggleTask);
          if (!t) return;
          const nextStatus = cb.checked ? 'completed' : 'pending';
          try {
            await apiRequest(`${apiBase}/${encodeURIComponent(t.id)}`, {
              method: 'PUT',
              body: { status: nextStatus }
            });
            t.status = nextStatus;
            render();
          } catch (err) {
            cb.checked = !cb.checked;
            showToast(err.message, 'error');
          }
        };
      });

      root.querySelectorAll('[data-edit-task]').forEach((btn) => {
        btn.onclick = () => openModal(tasks.find((x) => x.id === btn.dataset.editTask));
      });

      root.querySelectorAll('[data-del-task]').forEach((btn) => {
        btn.onclick = () => {
          const t = tasks.find((x) => x.id === btn.dataset.delTask);
          openConfirmModal({
            title: 'Delete Task?',
            message: `Remove "${t?.title}" from your checklist?`,
            confirmLabel: 'Delete',
            onConfirm: async () => {
              try {
                await apiRequest(`${apiBase}/${encodeURIComponent(t.id)}`, { method: 'DELETE' });
                await loadTasks();
                render();
                showToast('Task deleted.', 'success');
              } catch (err) {
                showToast(err.message, 'error');
              }
            }
          });
        };
      });

      document.getElementById('task-form').onsubmit = async (e) => {
        e.preventDefault();
        const id = document.getElementById('task-id').value;
        const payload = {
          title: document.getElementById('task-title').value.trim(),
          description: document.getElementById('task-desc').value.trim(),
          category: document.getElementById('task-cat').value,
          priority: document.getElementById('task-prio').value,
          dueDate: document.getElementById('task-due').value
        };
        try {
          if (id) {
            await apiRequest(`${apiBase}/${encodeURIComponent(id)}`, { method: 'PUT', body: payload });
            showToast('Task updated.', 'success');
          } else {
            await apiRequest(apiBase, { method: 'POST', body: { ...payload, aiGenerated: false } });
            showToast('Task added.', 'success');
          }
          closeModal();
          await loadTasks();
          render();
        } catch (err) {
          showToast(err.message, 'error');
        }
      };

      document.getElementById('ai-gen-tasks-btn').onclick = async () => {
        const btn = document.getElementById('ai-gen-tasks-btn');
        const loader = document.getElementById('tasks-ai-loader');
        setButtonLoading(btn, true, 'Generating Tasks...');
        loader.innerHTML = `<div class="ai-loading-box" style="margin-bottom:18px;"><div class="ai-spinner ai-spinner-lg"></div><div class="ai-loading-copy"><span class="ai-loading-title">Generating milestone tasks tailored to ${escapeHtml(formatDate(activeEvent.date))}...</span><span class="ai-loading-sub">Mapping lead times, priorities, and vendor dependencies.</span></div></div>`;
        try {
          const res = await callAiEndpoint('/api/ai/generate-tasks', {
            event: activeEvent,
            existingTitles: tasks.map((t) => t.title)
          });
          const generated = res.tasks || [];
          if (generated.length > 0) {
            await apiRequest(`${apiBase}/bulk`, {
              method: 'POST',
              body: { tasks: generated.map((t) => ({ ...t, aiGenerated: true })) }
            });
          }
          await loadTasks();
          render();
          showToast(`Added ${generated.length} AI checklist tasks.`, 'success');
        } catch (err) {
          loader.innerHTML = '';
          setButtonLoading(btn, false);
          showToast(err.message, 'error');
        }
      };

      renderIcons();
    }

    await loadTasks();
    render();
  }
});
