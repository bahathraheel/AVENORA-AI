import { apiRequest, callAiEndpoint } from './api.js';
import {
  escapeHtml,
  initProtectedPage,
  openConfirmModal,
  renderIcons,
  renderNoEventState,
  setButtonLoading,
  showToast
} from './main.js';

function detectConflicts(items) {
  const conflicts = new Set();
  for (let i = 0; i < items.length; i++) {
    for (let j = i + 1; j < items.length; j++) {
      const a = items[i];
      const b = items[j];
      if (!a.timeSlot || !b.timeSlot) continue;
      if (a.timeSlot === b.timeSlot) {
        conflicts.add(a.id);
        conflicts.add(b.id);
      } else if (a.endTime && b.timeSlot < a.endTime && b.timeSlot >= a.timeSlot) {
        conflicts.add(a.id);
        conflicts.add(b.id);
      }
    }
  }
  return conflicts;
}

initProtectedPage({
  activeKey: 'timeline',
  pageTitle: 'Event Timeline',
  onReady: async ({ activeEvent }) => {
    const root = document.getElementById('timeline-root');
    if (!root) return;
    if (!activeEvent) {
      renderNoEventState(root, 'Select or Create an Event to Build Your Timeline');
      return;
    }

    const apiBase = `/api/events/${encodeURIComponent(activeEvent.id)}/timeline`;
    let items = [];

    async function loadTimeline() {
      const data = await apiRequest(apiBase);
      items = data.items || [];
    }

    function render() {
      const conflicts = detectConflicts(items);
      const completedCount = items.filter((i) => i.completed).length;

      root.innerHTML = `
        <section class="surface-forest panel-pad" style="margin-bottom:20px;">
          <div style="display:flex;justify-content:space-between;align-items:center;gap:16px;flex-wrap:wrap;">
            <div>
              <h1 style="font-size:34px;">AI Event Timeline</h1>
              <div class="meta-inline text-sage" style="font-size:13px;margin-top:4px;">
                <span class="tabular-nums">${items.length} scheduled activities</span>
                <span class="meta-sep">·</span>
                <span class="tabular-nums">${completedCount} completed</span>
                ${conflicts.size > 0 ? `<span class="meta-sep">·</span><span style="color:#E58070;">${conflicts.size} potential time conflict(s)</span>` : ''}
              </div>
            </div>
            <div style="display:flex;gap:10px;flex-wrap:wrap;">
              <button type="button" id="open-ai-timeline" class="btn btn-primary">Generate AI Timeline</button>
              <button type="button" id="open-add-slot" class="btn btn-secondary">Add Activity</button>
            </div>
          </div>
        </section>

        <div id="ai-timeline-panel" style="display:none;margin-bottom:20px;" class="surface-forest panel-pad">
          <h2 style="font-size:22px;margin-bottom:12px;">Schedule Parameters</h2>
          <form id="ai-timeline-form" style="display:grid;grid-template-columns:150px 170px 1fr auto;gap:12px;align-items:end;">
            <div class="field-group">
              <label class="field-label" for="tl-start">Start Time</label>
              <input id="tl-start" type="time" class="field-input field-input-dark" value="16:00" />
            </div>
            <div class="field-group">
              <label class="field-label" for="tl-dur">Duration</label>
              <input id="tl-dur" class="field-input field-input-dark" value="6 hours" />
            </div>
            <div class="field-group">
              <label class="field-label" for="tl-acts">Key Activities</label>
              <input id="tl-acts" class="field-input field-input-dark" placeholder="e.g., Guest arrival, ceremony, cocktail hour, dinner, toasts, dancing" />
            </div>
            <button type="submit" id="tl-gen-btn" class="btn btn-primary">Build Schedule</button>
          </form>
          <div id="tl-loader" style="margin-top:14px;"></div>
        </div>

        <section class="surface-ivory panel-pad">
          ${
            items.length === 0
              ? `<div class="empty-state">
                  <p class="text-muted-ivory">No timeline slots created yet. Generate an AI run-of-show or add activities manually.</p>
                  <button type="button" id="empty-add-slot" class="btn btn-ivory-primary">Add First Activity</button>
                </div>`
              : `<div class="timeline-list">
                  ${items
                    .map(
                      (item, idx) => `
                      <article class="timeline-row ${item.completed ? 'completed' : ''}">
                        <div>
                          <div class="tabular-nums" style="font-weight:700;font-size:15px;">
                            ${escapeHtml(item.timeSlot)}${item.endTime ? ` – ${escapeHtml(item.endTime)}` : ''}
                          </div>
                          ${conflicts.has(item.id) ? `<div class="status-danger" style="font-size:12px;margin-top:4px;">Time overlap warning</div>` : ''}
                        </div>
                        <div>
                          <div style="display:flex;align-items:center;gap:10px;">
                            <input type="checkbox" data-toggle-tl="${escapeHtml(item.id)}" ${item.completed ? 'checked' : ''} style="width:17px;height:17px;cursor:pointer;" aria-label="Mark activity complete" />
                            <strong style="font-size:16px;${item.completed ? 'text-decoration:line-through;' : ''}">${escapeHtml(item.title)}</strong>
                          </div>
                          ${item.description ? `<p class="text-muted-ivory" style="font-size:13.5px;margin-top:6px;">${escapeHtml(item.description)}</p>` : ''}
                        </div>
                        <div style="display:flex;gap:6px;flex-wrap:wrap;">
                          <button type="button" class="btn btn-sm btn-ivory-outline" data-move-up="${idx}" ${idx === 0 ? 'disabled' : ''}>Up</button>
                          <button type="button" class="btn btn-sm btn-ivory-outline" data-move-down="${idx}" ${idx === items.length - 1 ? 'disabled' : ''}>Down</button>
                          <button type="button" class="btn btn-sm btn-ivory-outline" data-edit-tl="${escapeHtml(item.id)}">Edit</button>
                          <button type="button" class="btn btn-sm btn-danger-ivory" data-del-tl="${escapeHtml(item.id)}">Delete</button>
                        </div>
                      </article>`
                    )
                    .join('')}
                </div>`
          }
        </section>

        <div id="tl-modal" class="modal-backdrop">
          <div class="modal-panel">
            <div class="modal-header">
              <h3 id="tl-modal-title" style="font-size:24px;">Add Activity</h3>
              <button type="button" class="btn btn-sm btn-ivory-outline" id="close-tl-modal">Close</button>
            </div>
            <form id="tl-form" style="display:flex;flex-direction:column;gap:12px;">
              <input type="hidden" id="tl-id" />
              <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
                <div class="field-group">
                  <label class="field-label" for="tl-time">Start Time</label>
                  <input id="tl-time" type="time" class="field-input" required />
                </div>
                <div class="field-group">
                  <label class="field-label" for="tl-end">End Time</label>
                  <input id="tl-end" type="time" class="field-input" />
                </div>
              </div>
              <div class="field-group">
                <label class="field-label" for="tl-title">Activity Title</label>
                <input id="tl-title" class="field-input" required maxlength="200" />
              </div>
              <div class="field-group">
                <label class="field-label" for="tl-desc">Description</label>
                <textarea id="tl-desc" class="field-textarea" maxlength="800" style="min-height:80px;"></textarea>
              </div>
              <div class="modal-footer">
                <button type="button" class="btn btn-ivory-outline" id="cancel-tl-modal">Cancel</button>
                <button type="submit" class="btn btn-ivory-primary">Save Activity</button>
              </div>
            </form>
          </div>
        </div>
      `;

      const modal = document.getElementById('tl-modal');
      const openModal = (item = null) => {
        document.getElementById('tl-modal-title').textContent = item ? 'Edit Activity' : 'Add Activity';
        document.getElementById('tl-id').value = item?.id || '';
        document.getElementById('tl-time').value = item?.timeSlot || '17:00';
        document.getElementById('tl-end').value = item?.endTime || '';
        document.getElementById('tl-title').value = item?.title || '';
        document.getElementById('tl-desc').value = item?.description || '';
        modal.classList.add('open');
      };
      const closeModal = () => modal.classList.remove('open');

      document.getElementById('open-add-slot').onclick = () => openModal(null);
      document.getElementById('empty-add-slot')?.addEventListener('click', () => openModal(null));
      document.getElementById('close-tl-modal').onclick = closeModal;
      document.getElementById('cancel-tl-modal').onclick = closeModal;

      document.getElementById('open-ai-timeline').onclick = () => {
        const panel = document.getElementById('ai-timeline-panel');
        panel.style.display = panel.style.display === 'none' ? 'block' : 'none';
      };

      document.getElementById('ai-timeline-form').onsubmit = async (e) => {
        e.preventDefault();
        const btn = document.getElementById('tl-gen-btn');
        const loader = document.getElementById('tl-loader');
        setButtonLoading(btn, true, 'Generating...');
        loader.innerHTML = `<div class="ai-loading-box"><div class="ai-spinner ai-spinner-lg"></div><div class="ai-loading-copy"><span class="ai-loading-title">Building conflict-free run of show...</span><span class="ai-loading-sub">Sequencing arrival, transitions, and event cues seamlessly.</span></div></div>`;
        try {
          const res = await callAiEndpoint('/api/ai/generate-timeline', {
            event: activeEvent,
            startTime: document.getElementById('tl-start').value,
            duration: document.getElementById('tl-dur').value,
            activities: document.getElementById('tl-acts').value
          });
          const generated = res.items || [];
          if (generated.length > 0) {
            await apiRequest(`${apiBase}/bulk`, {
              method: 'POST',
              body: { items: generated, baseIndex: items.length }
            });
          }
          await loadTimeline();
          render();
          showToast(`Added ${generated.length} timeline activities.`, 'success');
        } catch (err) {
          loader.innerHTML = '';
          setButtonLoading(btn, false);
          showToast(err.message, 'error');
        }
      };

      root.querySelectorAll('[data-toggle-tl]').forEach((cb) => {
        cb.onchange = async () => {
          const id = cb.dataset.toggleTl;
          try {
            await apiRequest(`${apiBase}/${encodeURIComponent(id)}`, {
              method: 'PUT',
              body: { completed: cb.checked }
            });
            await loadTimeline();
            render();
          } catch (err) {
            cb.checked = !cb.checked;
            showToast(err.message, 'error');
          }
        };
      });

      const swapOrder = async (idxA, idxB) => {
        const a = items[idxA];
        const b = items[idxB];
        if (!a || !b) return;
        try {
          const res = await apiRequest(`${apiBase}/reorder`, {
            method: 'PUT',
            body: {
              pairs: [
                { id: a.id, orderIndex: idxB },
                { id: b.id, orderIndex: idxA }
              ]
            }
          });
          items = res.items || items;
          render();
        } catch (err) {
          showToast(err.message, 'error');
        }
      };

      root.querySelectorAll('[data-move-up]').forEach((b) => {
        b.onclick = () => {
          const idx = Number(b.dataset.moveUp);
          swapOrder(idx, idx - 1);
        };
      });

      root.querySelectorAll('[data-move-down]').forEach((b) => {
        b.onclick = () => {
          const idx = Number(b.dataset.moveDown);
          swapOrder(idx, idx + 1);
        };
      });

      root.querySelectorAll('[data-edit-tl]').forEach((b) => {
        b.onclick = () => openModal(items.find((x) => x.id === b.dataset.editTl));
      });

      root.querySelectorAll('[data-del-tl]').forEach((b) => {
        b.onclick = () => {
          const target = items.find((x) => x.id === b.dataset.delTl);
          openConfirmModal({
            title: 'Delete Activity?',
            message: `Remove "${target?.title}" from the timeline?`,
            confirmLabel: 'Delete',
            onConfirm: async () => {
              try {
                await apiRequest(`${apiBase}/${encodeURIComponent(target.id)}`, { method: 'DELETE' });
                await loadTimeline();
                render();
                showToast('Activity removed.', 'success');
              } catch (err) {
                showToast(err.message, 'error');
              }
            }
          });
        };
      });

      document.getElementById('tl-form').onsubmit = async (e) => {
        e.preventDefault();
        const id = document.getElementById('tl-id').value;
        const timeSlot = document.getElementById('tl-time').value;
        const endTime = document.getElementById('tl-end').value;
        if (endTime && endTime <= timeSlot) {
          showToast('End time should be after start time.', 'error');
          return;
        }
        const existingItem = items.find((x) => x.id === id);
        const payload = {
          timeSlot,
          endTime: endTime || '',
          title: document.getElementById('tl-title').value.trim(),
          description: document.getElementById('tl-desc').value.trim(),
          orderIndex: existingItem ? existingItem.orderIndex : items.length,
          completed: existingItem ? Boolean(existingItem.completed) : false
        };
        try {
          if (id) {
            await apiRequest(`${apiBase}/${encodeURIComponent(id)}`, { method: 'PUT', body: payload });
            showToast('Activity updated.', 'success');
          } else {
            await apiRequest(apiBase, { method: 'POST', body: payload });
            showToast('Activity added.', 'success');
          }
          closeModal();
          await loadTimeline();
          render();
        } catch (err) {
          showToast(err.message, 'error');
        }
      };

      renderIcons();
    }

    await loadTimeline();
    render();
  }
});
