import { buildApiUrl } from '../config/apiConfig.js';
import { apiRequest, callAiEndpoint } from './api.js';
import {
  closeModalElement,
  copyToClipboard,
  escapeHtml,
  formatCurrency,
  formatDate,
  getDaysUntil,
  initProtectedPage,
  openConfirmModal,
  openModalElement,
  renderIcons,
  setButtonLoading,
  setStoredEventId,
  showToast
} from './main.js';

const EVENT_TYPES = [
  'Wedding', 'Birthday', 'Anniversary', 'College Festival', 'Graduation',
  'Corporate Event', 'Engagement', 'Baby Shower', 'Party', 'Cultural Event', 'Custom Event'
];

const EVENT_STYLES = [
  'Luxury', 'Minimalist', 'Modern', 'Traditional', 'Elegant', 'Rustic',
  'Bohemian', 'Fun', 'Cultural', 'Nature-inspired', 'Custom'
];

const CURRENCIES = ['USD', 'INR', 'EUR', 'GBP', 'AED', 'SGD', 'AUD', 'CAD'];

const WIZARD_DRAFT_KEY = 'avenora_wizard_draft_v1';

const BLUEPRINT_SECTIONS = [
  { key: 'overview', label: '01. Event Overview', type: 'text', wide: true },
  { key: 'concept', label: '02. Event Concept', type: 'text', wide: true },
  { key: 'themeRecommendations', label: '03. Theme Recommendations', type: 'list' },
  { key: 'venueRequirements', label: '04. Venue Requirements', type: 'list' },
  { key: 'schedule', label: '05. Detailed Event Schedule', type: 'schedule', wide: true },
  { key: 'budgetAllocation', label: '06. Budget Allocation (Estimates)', type: 'budget', wide: true },
  { key: 'priorityChecklist', label: '07. Priority Checklist', type: 'checklist', wide: true },
  { key: 'decorationIdeas', label: '08. Decoration Ideas', type: 'list' },
  { key: 'cateringSuggestions', label: '09. Catering Suggestions', type: 'list' },
  { key: 'guestExperienceIdeas', label: '10. Guest Experience Ideas', type: 'list' },
  { key: 'vendorCategories', label: '11. Vendor Categories', type: 'vendors', wide: true },
  { key: 'planningTimeline', label: '12. Planning Timeline', type: 'phases', wide: true },
  { key: 'riskManagement', label: '13. Risk Management', type: 'risks', wide: true },
  { key: 'contingencySuggestions', label: '14. Contingency Suggestions', type: 'list' },
  { key: 'personalizedRecommendations', label: '15. Personalized Recommendations', type: 'list' },
  { key: 'nextSteps', label: '16. Next Steps', type: 'list' }
];

function getInitialDraft(defaultCurrency = 'USD') {
  try {
    const saved = JSON.parse(localStorage.getItem(WIZARD_DRAFT_KEY) || 'null');
    if (saved && typeof saved === 'object') return saved;
  } catch { /* ignore */ }
  return {
    type: 'Wedding',
    name: '',
    date: '',
    location: '',
    guestCount: 100,
    budget: 15000,
    currency: defaultCurrency || 'USD',
    style: 'Elegant',
    preferences: '',
    specialRequirements: ''
  };
}

function renderEventsDirectory(root, events, activeEvent) {
  root.innerHTML = `
    <div class="surface-forest panel-pad" style="margin-bottom:20px;display:flex;justify-content:space-between;align-items:center;gap:16px;flex-wrap:wrap;">
      <div>
        <h1 style="font-size:34px;">My Events</h1>
        <p class="text-muted-dark" style="font-size:14px;">Switch, edit, or launch new independent event workspaces.</p>
      </div>
      <a href="/event.html?mode=create" class="btn btn-primary">Create New Event</a>
    </div>
    ${
      events.length === 0
        ? `<div class="surface-ivory panel-pad">
            <div class="empty-state">
              <h2 style="font-size:26px;">No Events Created Yet</h2>
              <p class="text-muted-ivory">Start the 9-step Event Creator to plan your first gathering.</p>
              <a href="/event.html?mode=create" class="btn btn-ivory-primary">Create Event</a>
            </div>
          </div>`
        : `<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(320px,1fr));gap:18px;">
            ${events
              .map((ev) => {
                const days = getDaysUntil(ev.date);
                const countdown = days === null ? 'Date TBD' : days >= 0 ? `${days}d remaining` : 'Completed window';
                return `
                  <article class="surface-ivory panel-pad" style="display:flex;flex-direction:column;justify-content:space-between;gap:16px;">
                    <div>
                      <div class="meta-inline text-muted-ivory" style="font-size:12px;margin-bottom:6px;">
                        <span>${escapeHtml(ev.type)}</span>
                        <span class="meta-sep">·</span>
                        <span style="text-transform:capitalize;">${escapeHtml(ev.status.replace('_', ' '))}</span>
                        <span class="meta-sep">·</span>
                        <span class="tabular-nums">${escapeHtml(countdown)}</span>
                      </div>
                      <h2 style="font-size:26px;margin-bottom:8px;">${escapeHtml(ev.name)}</h2>
                      <p class="text-muted-ivory" style="font-size:13.5px;">${escapeHtml(formatDate(ev.date))} · ${escapeHtml(ev.location)}</p>
                      <p class="tabular-nums" style="font-size:14px;font-weight:600;margin-top:8px;">
                        ${escapeHtml(formatCurrency(ev.budget, ev.currency))} · ${escapeHtml(String(ev.guestCount))} guests
                      </p>
                    </div>
                    <div style="display:flex;gap:8px;flex-wrap:wrap;padding-top:12px;border-top:var(--border-ivory);">
                      <button type="button" class="btn btn-sm ${activeEvent && activeEvent.id === ev.id ? 'btn-ivory-primary' : 'btn-ivory-outline'}" data-open-event="${escapeHtml(ev.id)}">
                        ${activeEvent && activeEvent.id === ev.id ? 'Open Blueprint' : 'Select & Open'}
                      </button>
                      <button type="button" class="btn btn-sm btn-ivory-outline" data-edit-event="${escapeHtml(ev.id)}">Edit</button>
                      <button type="button" class="btn btn-sm btn-danger-ivory" data-delete-event="${escapeHtml(ev.id)}">Delete</button>
                    </div>
                  </article>
                `;
              })
              .join('')}
          </div>`
    }
    <div id="edit-event-modal" class="modal-backdrop" aria-hidden="true">
      <div class="modal-panel" role="dialog" aria-modal="true" aria-labelledby="edit-event-modal-title">
        <div class="modal-header">
          <h3 id="edit-event-modal-title" style="font-size:24px;">Edit Event Details</h3>
          <button type="button" class="btn btn-sm btn-ivory-outline" id="close-edit-event">Close</button>
        </div>
        <form id="edit-event-form" style="display:flex;flex-direction:column;gap:14px;">
          <input type="hidden" id="edit-ev-id" />
          <div class="field-group">
            <label class="field-label" for="edit-ev-name">Event Name</label>
            <input id="edit-ev-name" class="field-input" required maxlength="160" />
          </div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
            <div class="field-group">
              <label class="field-label" for="edit-ev-date">Date</label>
              <input id="edit-ev-date" type="date" class="field-input" required />
            </div>
            <div class="field-group">
              <label class="field-label" for="edit-ev-status">Status</label>
              <select id="edit-ev-status" class="field-select">
                <option value="planning">Planning</option>
                <option value="in_progress">In Progress</option>
                <option value="ready">Ready</option>
                <option value="completed">Completed</option>
              </select>
            </div>
          </div>
          <div class="field-group">
            <label class="field-label" for="edit-ev-location">Location</label>
            <input id="edit-ev-location" class="field-input" required maxlength="200" />
          </div>
          <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:12px;">
            <div class="field-group">
              <label class="field-label" for="edit-ev-guests">Guests</label>
              <input id="edit-ev-guests" type="number" min="1" class="field-input" required />
            </div>
            <div class="field-group">
              <label class="field-label" for="edit-ev-budget">Budget</label>
              <input id="edit-ev-budget" type="number" min="0" class="field-input" required />
            </div>
            <div class="field-group">
              <label class="field-label" for="edit-ev-currency">Currency</label>
              <select id="edit-ev-currency" class="field-select">
                ${CURRENCIES.map((c) => `<option value="${c}">${c}</option>`).join('')}
              </select>
            </div>
          </div>
          <div class="modal-footer">
            <button type="button" class="btn btn-ivory-outline" id="cancel-edit-event">Cancel</button>
            <button type="submit" id="save-edit-event-btn" class="btn btn-ivory-primary">Save Changes</button>
          </div>
        </form>
      </div>
    </div>
  `;

  root.querySelectorAll('[data-open-event]').forEach((btn) => {
    btn.addEventListener('click', () => {
      setStoredEventId(btn.dataset.openEvent);
      window.location.href = `/event.html?eventId=${encodeURIComponent(btn.dataset.openEvent)}`;
    });
  });

  const modal = document.getElementById('edit-event-modal');
  const closeEdit = () => closeModalElement(modal);
  document.getElementById('close-edit-event').onclick = closeEdit;
  document.getElementById('cancel-edit-event').onclick = closeEdit;

  root.querySelectorAll('[data-edit-event]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const ev = events.find((x) => x.id === btn.dataset.editEvent);
      if (!ev) return;
      document.getElementById('edit-ev-id').value = ev.id;
      document.getElementById('edit-ev-name').value = ev.name;
      document.getElementById('edit-ev-date').value = ev.date;
      document.getElementById('edit-ev-status').value = ev.status || 'planning';
      document.getElementById('edit-ev-location').value = ev.location;
      document.getElementById('edit-ev-guests').value = ev.guestCount;
      document.getElementById('edit-ev-budget').value = ev.budget;
      document.getElementById('edit-ev-currency').value = ev.currency || 'USD';
      openModalElement(modal, '#edit-ev-name');
    });
  });

  document.getElementById('edit-event-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = document.getElementById('edit-ev-id').value;
    const saveBtn = document.getElementById('save-edit-event-btn');
    setButtonLoading(saveBtn, true, 'Saving...');
    try {
      await apiRequest(`/api/events/${encodeURIComponent(id)}`, {
        method: 'PUT',
        body: {
          name: document.getElementById('edit-ev-name').value.trim(),
          date: document.getElementById('edit-ev-date').value,
          status: document.getElementById('edit-ev-status').value,
          location: document.getElementById('edit-ev-location').value.trim(),
          guestCount: document.getElementById('edit-ev-guests').value,
          budget: document.getElementById('edit-ev-budget').value,
          currency: document.getElementById('edit-ev-currency').value
        }
      });
      closeEdit();
      showToast('Event updated.', 'success');
      window.location.reload();
    } catch (err) {
      setButtonLoading(saveBtn, false);
      showToast(err.message, 'error');
    }
  });

  root.querySelectorAll('[data-delete-event]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const ev = events.find((x) => x.id === btn.dataset.deleteEvent);
      if (!ev) return;
      openConfirmModal({
        title: `Delete "${ev.name}"?`,
        message: 'This permanently deletes this event workspace and its associated subcollections.',
        confirmLabel: 'Delete Event',
        onConfirm: async () => {
          try {
            await apiRequest(`/api/events/${encodeURIComponent(ev.id)}`, { method: 'DELETE' });
            if (activeEvent && activeEvent.id === ev.id) setStoredEventId('');
            showToast('Event deleted.', 'success');
            window.location.reload();
          } catch (err) {
            showToast(err.message, 'error');
          }
        }
      });
    });
  });
}

function renderNineStepWizard(root, profile) {
  let step = 1;
  const draft = getInitialDraft(profile?.preferredCurrency || 'USD');
  const saveDraft = () => localStorage.setItem(WIZARD_DRAFT_KEY, JSON.stringify(draft));

  // Warm up backend instance silently before final step generation
  fetch(buildApiUrl('/health')).catch(() => {});

  const stepTitles = [
    'Step 1 · Choose Event Type',
    'Step 2 · Name Your Event',
    'Step 3 · Choose Event Date',
    'Step 4 · Enter Event Location',
    'Step 5 · Estimated Guest Count',
    'Step 6 · Total Budget & Currency',
    'Step 7 · Select Event Theme or Style',
    'Step 8 · Enter Preferences',
    'Step 9 · Special Requirements & Generate'
  ];

  function draw() {
    root.innerHTML = `
      <div style="max-width:860px;margin-inline:auto;">
        <div class="surface-forest panel-pad" style="margin-bottom:20px;">
          <div class="meta-inline text-sage" style="font-size:13px;margin-bottom:6px;">
            <span>AI Event Creation Wizard</span>
            <span class="meta-sep">·</span>
            <span class="tabular-nums">Step ${step} of 9</span>
          </div>
          <h1 style="font-size:34px;margin-bottom:16px;">${stepTitles[step - 1]}</h1>
          <div class="wizard-steps-bar">
            ${Array.from({ length: 9 }, (_, idx) => `<div class="wizard-step-dot ${idx + 1 < step ? 'done' : idx + 1 === step ? 'current' : ''}"></div>`).join('')}
          </div>
        </div>

        <div class="surface-ivory panel-pad">
          <div id="wizard-step-body"></div>
          <div id="wizard-error" class="field-error" role="alert" aria-live="polite" style="margin-top:12px;"></div>
          <div style="display:flex;justify-content:space-between;align-items:center;margin-top:26px;padding-top:18px;border-top:var(--border-ivory);">
            <button type="button" id="wiz-back" class="btn btn-ivory-outline" ${step === 1 ? 'disabled' : ''}>Back</button>
            <div style="display:flex;gap:10px;">
              <button type="button" id="wiz-save-draft" class="btn btn-ivory-outline">Save Progress</button>
              <button type="button" id="wiz-next" class="btn btn-ivory-primary">${step === 9 ? 'Create Event & Generate AI Blueprint' : 'Next Step'}</button>
            </div>
          </div>
        </div>
      </div>
    `;

    const body = document.getElementById('wizard-step-body');
    const errEl = document.getElementById('wizard-error');

    if (step === 1) {
      body.innerHTML = `
        <p class="text-muted-ivory" style="margin-bottom:14px;">Select the category that best matches your event.</p>
        <div class="choice-grid">
          ${EVENT_TYPES.map((t) => `<button type="button" class="choice-card ${draft.type === t ? 'selected' : ''}" aria-pressed="${draft.type === t}" data-pick-type="${escapeHtml(t)}"><strong>${escapeHtml(t)}</strong></button>`).join('')}
        </div>
      `;
      body.querySelectorAll('[data-pick-type]').forEach((b) => {
        b.onclick = () => {
          draft.type = b.dataset.pickType;
          saveDraft();
          draw();
        };
      });
    } else if (step === 2) {
      body.innerHTML = `
        <div class="field-group">
          <label class="field-label" for="wiz-name">Event Name</label>
          <input id="wiz-name" class="field-input" placeholder="e.g., Aarav & Maya Autumn Conservatory Wedding" value="${escapeHtml(draft.name)}" maxlength="160" />
        </div>
      `;
    } else if (step === 3) {
      body.innerHTML = `
        <div class="field-group">
          <label class="field-label" for="wiz-date">Event Date</label>
          <input id="wiz-date" type="date" class="field-input" value="${escapeHtml(draft.date)}" />
          <p class="text-muted-ivory" style="font-size:12.5px;">AI checklists and planning timelines are anchored around this date.</p>
        </div>
      `;
    } else if (step === 4) {
      body.innerHTML = `
        <div class="field-group">
          <label class="field-label" for="wiz-location">City, Region, or Venue</label>
          <input id="wiz-location" class="field-input" placeholder="e.g., Udaipur, Rajasthan or Napa Valley, CA" value="${escapeHtml(draft.location)}" maxlength="200" />
        </div>
      `;
    } else if (step === 5) {
      body.innerHTML = `
        <div class="field-group">
          <label class="field-label" for="wiz-guests">Estimated Guest Count</label>
          <input id="wiz-guests" type="number" min="1" max="100000" class="field-input" value="${escapeHtml(String(draft.guestCount))}" />
        </div>
      `;
    } else if (step === 6) {
      body.innerHTML = `
        <div style="display:grid;grid-template-columns:1fr 180px;gap:14px;">
          <div class="field-group">
            <label class="field-label" for="wiz-budget">Total Budget</label>
            <input id="wiz-budget" type="number" min="1" step="any" class="field-input" value="${escapeHtml(String(draft.budget))}" />
          </div>
          <div class="field-group">
            <label class="field-label" for="wiz-currency">Currency</label>
            <select id="wiz-currency" class="field-select">
              ${CURRENCIES.map((c) => `<option value="${c}" ${draft.currency === c ? 'selected' : ''}>${c}</option>`).join('')}
            </select>
          </div>
        </div>
      `;
    } else if (step === 7) {
      body.innerHTML = `
        <p class="text-muted-ivory" style="margin-bottom:14px;">Choose the visual direction and tone for your event.</p>
        <div class="choice-grid">
          ${EVENT_STYLES.map((s) => `<button type="button" class="choice-card ${draft.style === s ? 'selected' : ''}" aria-pressed="${draft.style === s}" data-pick-style="${escapeHtml(s)}"><strong>${escapeHtml(s)}</strong></button>`).join('')}
        </div>
      `;
      body.querySelectorAll('[data-pick-style]').forEach((b) => {
        b.onclick = () => {
          draft.style = b.dataset.pickStyle;
          saveDraft();
          draw();
        };
      });
    } else if (step === 8) {
      body.innerHTML = `
        <div class="field-group">
          <label class="field-label" for="wiz-prefs">Preferences (Food, Music, Format, Atmosphere)</label>
          <textarea id="wiz-prefs" class="field-textarea" placeholder="e.g., Vegetarian tasting menu, live acoustic quartet, outdoor sunset ceremony followed by candlelit indoor dinner.">${escapeHtml(draft.preferences)}</textarea>
        </div>
      `;
    } else if (step === 9) {
      body.innerHTML = `
        <div class="field-group" style="margin-bottom:18px;">
          <label class="field-label" for="wiz-special">Special Requirements (Accessibility, Cultural Rituals, Logistics)</label>
          <textarea id="wiz-special" class="field-textarea" placeholder="e.g., Wheelchair-accessible venue paths, kosher/vegan options, bilingual MC, rain contingency pavilion.">${escapeHtml(draft.specialRequirements)}</textarea>
        </div>
        <div style="padding:16px;border-radius:10px;background:#fff;border:var(--border-ivory);">
          <strong style="display:block;margin-bottom:6px;">Summary Check</strong>
          <div class="meta-inline text-muted-ivory" style="font-size:13px;">
            <span>${escapeHtml(draft.name || 'Untitled')}</span><span class="meta-sep">·</span>
            <span>${escapeHtml(draft.type)}</span><span class="meta-sep">·</span>
            <span>${escapeHtml(formatDate(draft.date))}</span><span class="meta-sep">·</span>
            <span>${escapeHtml(draft.location)}</span><span class="meta-sep">·</span>
            <span>${escapeHtml(String(draft.guestCount))} guests</span><span class="meta-sep">·</span>
            <span>${escapeHtml(formatCurrency(draft.budget, draft.currency))}</span>
          </div>
        </div>
      `;
    }

    document.getElementById('wiz-back').onclick = () => {
      if (step > 1) {
        step -= 1;
        draw();
      }
    };

    document.getElementById('wiz-save-draft').onclick = () => {
      captureCurrentStep();
      saveDraft();
      showToast('Wizard progress saved locally.', 'success');
    };

    function captureCurrentStep() {
      if (step === 2) draft.name = document.getElementById('wiz-name').value.trim();
      if (step === 3) draft.date = document.getElementById('wiz-date').value;
      if (step === 4) draft.location = document.getElementById('wiz-location').value.trim();
      if (step === 5) draft.guestCount = parseInt(document.getElementById('wiz-guests').value, 10) || 0;
      if (step === 6) {
        draft.budget = Number(document.getElementById('wiz-budget').value) || 0;
        draft.currency = document.getElementById('wiz-currency').value;
      }
      if (step === 8) draft.preferences = document.getElementById('wiz-prefs').value.trim();
      if (step === 9) draft.specialRequirements = document.getElementById('wiz-special').value.trim();
      saveDraft();
    }

    document.getElementById('wiz-next').onclick = async () => {
      captureCurrentStep();
      errEl.textContent = '';

      if (step === 2 && !draft.name) {
        errEl.textContent = 'Please enter an event name.';
        return;
      }
      if (step === 3) {
        if (!draft.date) {
          errEl.textContent = 'Please select a valid event date.';
          return;
        }
        const selectedDate = new Date(`${draft.date}T00:00:00`);
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        if (selectedDate < today) {
          errEl.textContent = 'Event date cannot be in the past.';
          return;
        }
      }
      if (step === 4 && !draft.location) {
        errEl.textContent = 'Please enter an event location.';
        return;
      }
      if (step === 5 && (!draft.guestCount || draft.guestCount < 1)) {
        errEl.textContent = 'Please enter at least 1 estimated guest.';
        return;
      }
      if (step === 6 && (!draft.budget || draft.budget <= 0)) {
        errEl.textContent = 'Please enter a valid positive budget.';
        return;
      }

      if (step < 9) {
        step += 1;
        draw();
        return;
      }

      const nextBtn = document.getElementById('wiz-next');
      setButtonLoading(nextBtn, true, 'Generating AI Blueprint...');
      body.insertAdjacentHTML(
        'beforeend',
        `<div class="ai-loading-box" style="margin-top:16px;"><div class="ai-spinner ai-spinner-lg"></div><div class="ai-loading-copy"><span class="ai-loading-title">AVENORA AI is architecting your 16-section blueprint...</span><span id="blueprint-elapsed-sub" class="ai-loading-sub">Tailoring schedule, budget splits, vendor plan, and contingencies (0s).</span></div></div>`
      );

      const startedAt = Date.now();
      const elapsedTimer = setInterval(() => {
        const sub = document.getElementById('blueprint-elapsed-sub');
        if (!sub) return;
        const sec = Math.floor((Date.now() - startedAt) / 1000);
        sub.textContent =
          sec >= 12
            ? `Waking AI service and finalizing all 16 sections (${sec}s)...`
            : `Tailoring schedule, budget splits, vendor plan, and contingencies (${sec}s).`;
      }, 1000);

      let blueprint = null;
      try {
        const aiRes = await callAiEndpoint('/api/ai/create-event-plan', { event: draft });
        blueprint = aiRes.blueprint;
      } catch (aiErr) {
        showToast(`Event saved without AI blueprint: ${aiErr.message}`, 'error');
      } finally {
        clearInterval(elapsedTimer);
      }

      try {
        const created = await apiRequest('/api/events', {
          method: 'POST',
          body: {
            ...draft,
            ...(blueprint ? { blueprint } : {})
          }
        });
        localStorage.removeItem(WIZARD_DRAFT_KEY);
        setStoredEventId(created.event.id);
        showToast('Event workspace & AI Blueprint created.', 'success');
        window.location.href = `/event.html?eventId=${encodeURIComponent(created.event.id)}`;
      } catch (err) {
        setButtonLoading(nextBtn, false);
        showToast(err.message, 'error');
      }
    };
  }

  draw();
}

function formatSectionPlainText(sectionMeta, value) {
  if (!value) return 'No content generated yet.';
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) {
    return value
      .map((item) => {
        if (typeof item === 'string') return `• ${item}`;
        return Object.entries(item)
          .map(([k, v]) => `${k}: ${v}`)
          .join(' | ');
      })
      .join('\n');
  }
  return JSON.stringify(value, null, 2);
}

function renderSectionBody(sectionMeta, value, currency) {
  if (!value) {
    return `<p class="text-muted-ivory" style="font-size:14px;">This section has not been generated yet. Click Regenerate to create it.</p>`;
  }
  if (sectionMeta.type === 'text') {
    return `<p style="font-size:15px;line-height:1.65;">${escapeHtml(value)}</p>`;
  }
  if (sectionMeta.type === 'list' && Array.isArray(value)) {
    return `<ul style="margin:0;padding-left:20px;display:flex;flex-direction:column;gap:8px;">
      ${value.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}
    </ul>`;
  }
  if (sectionMeta.type === 'schedule' && Array.isArray(value)) {
    return `<div style="display:flex;flex-direction:column;gap:10px;">
      ${value
        .map(
          (row) => `
          <div style="display:grid;grid-template-columns:120px 1fr;gap:14px;padding:12px 14px;background:#fff;border-radius:8px;border:var(--border-ivory);">
            <strong class="tabular-nums">${escapeHtml(row.time)}</strong>
            <div>
              <div style="font-weight:600;">${escapeHtml(row.activity)}</div>
              <div class="text-muted-ivory" style="font-size:13.5px;">${escapeHtml(row.details)}</div>
            </div>
          </div>`
        )
        .join('')}
    </div>`;
  }
  if (sectionMeta.type === 'budget' && Array.isArray(value)) {
    return `<div class="data-table-wrap">
      <table class="data-table">
        <thead><tr><th>Category</th><th class="num-col">Share</th><th class="num-col">Planning Estimate</th><th>Rationale</th></tr></thead>
        <tbody>
          ${value
            .map(
              (row) => `
              <tr>
                <td><strong>${escapeHtml(row.category)}</strong></td>
                <td class="num-col">${escapeHtml(String(row.percentage))}%</td>
                <td class="num-col">${escapeHtml(formatCurrency(row.estimatedAmount, currency))}</td>
                <td class="text-muted-ivory">${escapeHtml(row.rationale)}</td>
              </tr>`
            )
            .join('')}
        </tbody>
      </table>
    </div>`;
  }
  if (sectionMeta.type === 'checklist' && Array.isArray(value)) {
    return `<div class="data-table-wrap">
      <table class="data-table">
        <thead><tr><th>Task</th><th>Category</th><th>Priority</th><th>Timeframe</th></tr></thead>
        <tbody>
          ${value
            .map(
              (row) => `
              <tr>
                <td><strong>${escapeHtml(row.title)}</strong></td>
                <td>${escapeHtml(row.category)}</td>
                <td style="text-transform:capitalize;">${escapeHtml(row.priority)}</td>
                <td class="text-muted-ivory">${escapeHtml(row.timeframe)}</td>
              </tr>`
            )
            .join('')}
        </tbody>
      </table>
    </div>`;
  }
  if (sectionMeta.type === 'vendors' && Array.isArray(value)) {
    return `<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:12px;">
      ${value
        .map(
          (v) => `
          <div style="padding:14px;background:#fff;border-radius:8px;border:var(--border-ivory);">
            <strong>${escapeHtml(v.category)}</strong>
            <div class="text-muted-ivory" style="font-size:13px;margin-top:4px;">${escapeHtml(v.whatToLookFor)}</div>
            <div style="font-size:12px;font-weight:600;margin-top:6px;">Lead time: ${escapeHtml(v.leadTime)}</div>
          </div>`
        )
        .join('')}
    </div>`;
  }
  if (sectionMeta.type === 'phases' && Array.isArray(value)) {
    return `<div style="display:flex;flex-direction:column;gap:10px;">
      ${value
        .map(
          (p) => `
          <div style="padding:12px 14px;background:#fff;border-radius:8px;border:var(--border-ivory);">
            <div class="meta-inline" style="font-size:12.5px;margin-bottom:4px;">
              <strong>${escapeHtml(p.phase)}</strong>
              <span class="meta-sep">·</span>
              <span>${escapeHtml(p.milestone)}</span>
            </div>
            <div class="text-muted-ivory" style="font-size:14px;">${escapeHtml(p.action)}</div>
          </div>`
        )
        .join('')}
    </div>`;
  }
  if (sectionMeta.type === 'risks' && Array.isArray(value)) {
    return `<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:12px;">
      ${value
        .map(
          (r) => `
          <div style="padding:14px;background:#fff;border-radius:8px;border:var(--border-ivory);">
            <strong>Risk: ${escapeHtml(r.risk)}</strong>
            <div class="text-muted-ivory" style="font-size:13.5px;margin-top:4px;">Mitigation: ${escapeHtml(r.mitigation)}</div>
          </div>`
        )
        .join('')}
    </div>`;
  }
  return `<pre style="white-space:pre-wrap;font-size:13px;">${escapeHtml(JSON.stringify(value, null, 2))}</pre>`;
}

function renderBlueprintWorkspace(root, activeEvent) {
  let currentBlueprint = activeEvent.blueprint ? structuredClone(activeEvent.blueprint) : null;

  function draw() {
    root.innerHTML = `
      <section class="surface-forest panel-pad" style="margin-bottom:22px;">
        <div style="display:flex;justify-content:space-between;align-items:flex-end;gap:20px;flex-wrap:wrap;">
          <div>
            <div class="meta-inline text-sage" style="font-size:13px;margin-bottom:6px;">
              <span>AI Event Blueprint</span>
              <span class="meta-sep">·</span>
              <span>${escapeHtml(activeEvent.type)}</span>
              <span class="meta-sep">·</span>
              <span>${escapeHtml(activeEvent.style)}</span>
            </div>
            <h1 style="font-size:36px;margin-bottom:8px;">${escapeHtml(activeEvent.name)}</h1>
            <div class="meta-inline text-muted-dark">
              <span>${escapeHtml(formatDate(activeEvent.date))}</span>
              <span class="meta-sep">·</span>
              <span>${escapeHtml(activeEvent.location)}</span>
              <span class="meta-sep">·</span>
              <span class="tabular-nums">${escapeHtml(String(activeEvent.guestCount))} guests</span>
              <span class="meta-sep">·</span>
              <span class="tabular-nums">${escapeHtml(formatCurrency(activeEvent.budget, activeEvent.currency))}</span>
            </div>
          </div>
          <div class="no-print" style="display:flex;gap:10px;flex-wrap:wrap;">
            <button type="button" id="bp-generate-all" class="btn btn-primary">${currentBlueprint ? 'Regenerate Full Blueprint' : 'Generate AI Blueprint'}</button>
            <button type="button" id="bp-save-btn" class="btn btn-secondary" ${!currentBlueprint ? 'disabled' : ''}>Save Blueprint</button>
            <button type="button" id="bp-print-btn" class="btn btn-secondary" ${!currentBlueprint ? 'disabled' : ''}>Print / Export</button>
          </div>
        </div>
      </section>

      <div id="bp-loading-slot"></div>

      ${
        !currentBlueprint
          ? `<div class="surface-ivory panel-pad">
              <div class="empty-state">
                <h2 style="font-size:28px;">Blueprint Not Generated Yet</h2>
                <p class="text-muted-ivory" style="max-width:52ch;">Click "Generate AI Blueprint" above to architect all 16 planning sections tailored to your guest count, location, style, and budget.</p>
              </div>
            </div>`
          : `<div class="blueprint-grid">
              ${BLUEPRINT_SECTIONS.map(
                (sec) => `
                <article class="surface-ivory blueprint-section-card ${sec.wide ? 'full-width' : ''}" data-section-card="${sec.key}">
                  <div class="panel-head" style="margin-bottom:4px;">
                    <h2 style="font-size:24px;">${sec.label}</h2>
                    <div class="no-print" style="display:flex;gap:6px;">
                      <button type="button" class="btn btn-sm btn-ivory-outline" data-copy-sec="${sec.key}">Copy</button>
                      <button type="button" class="btn btn-sm btn-ivory-outline" data-edit-sec="${sec.key}">Edit</button>
                      <button type="button" class="btn btn-sm btn-ivory-outline" data-regen-sec="${sec.key}">Regenerate</button>
                    </div>
                  </div>
                  <div data-sec-body="${sec.key}">${renderSectionBody(sec, currentBlueprint[sec.key], activeEvent.currency)}</div>
                </article>`
              ).join('')}
            </div>`
      }

      <div id="bp-edit-modal" class="modal-backdrop" aria-hidden="true">
        <div class="modal-panel modal-panel-lg" role="dialog" aria-modal="true" aria-labelledby="bp-edit-title">
          <div class="modal-header">
            <h3 id="bp-edit-title" style="font-size:24px;">Edit Section</h3>
            <button type="button" class="btn btn-sm btn-ivory-outline" id="bp-edit-close">Close</button>
          </div>
          <label class="text-muted-ivory" for="bp-edit-textarea" style="display:block;font-size:13px;margin-bottom:10px;">Edit text directly or adjust structured JSON items below.</label>
          <textarea id="bp-edit-textarea" class="field-textarea" style="min-height:260px;font-family:var(--font-mono);font-size:13px;"></textarea>
          <div class="modal-footer">
            <button type="button" class="btn btn-ivory-outline" id="bp-edit-cancel">Cancel</button>
            <button type="button" class="btn btn-ivory-primary" id="bp-edit-save">Apply & Save to Event</button>
          </div>
        </div>
      </div>
    `;

    const persistBlueprint = async (bpObj) => {
      try {
        await apiRequest(`/api/events/${encodeURIComponent(activeEvent.id)}/blueprint`, {
          method: 'PUT',
          body: { blueprint: bpObj }
        });
        showToast('Blueprint saved to cloud workspace.', 'success');
      } catch (err) {
        showToast(err.message, 'error');
      }
    };

    document.getElementById('bp-generate-all').onclick = async () => {
      const btn = document.getElementById('bp-generate-all');
      const slot = document.getElementById('bp-loading-slot');
      setButtonLoading(btn, true, 'Generating Blueprint...');
      slot.innerHTML = `<div class="ai-loading-box" style="margin-bottom:20px;"><div class="ai-spinner ai-spinner-lg"></div><div class="ai-loading-copy"><span class="ai-loading-title">Generating full 16-section AVENORA AI Blueprint...</span><span class="ai-loading-sub">Synthesizing logistics, atmosphere, vendor plan, and contingencies.</span></div></div>`;
      try {
        const res = await callAiEndpoint('/api/ai/create-event-plan', { event: activeEvent });
        currentBlueprint = res.blueprint;
        await persistBlueprint(currentBlueprint);
        draw();
      } catch (err) {
        slot.innerHTML = '';
        setButtonLoading(btn, false);
        showToast(err.message, 'error');
      }
    };

    document.getElementById('bp-save-btn')?.addEventListener('click', () => {
      if (currentBlueprint) persistBlueprint(currentBlueprint);
    });

    document.getElementById('bp-print-btn')?.addEventListener('click', () => {
      window.print();
    });

    root.querySelectorAll('[data-copy-sec]').forEach((btn) => {
      btn.onclick = () => {
        const key = btn.dataset.copySec;
        const meta = BLUEPRINT_SECTIONS.find((s) => s.key === key);
        copyToClipboard(formatSectionPlainText(meta, currentBlueprint?.[key]), `Copied ${meta?.label || 'section'}.`);
      };
    });

    root.querySelectorAll('[data-regen-sec]').forEach((btn) => {
      btn.onclick = async () => {
        const key = btn.dataset.regenSec;
        setButtonLoading(btn, true, 'Regenerating...');
        try {
          const res = await callAiEndpoint('/api/ai/create-event-plan', { event: activeEvent, sectionKey: key });
          currentBlueprint = { ...(currentBlueprint || {}), [key]: res.blueprint[key] };
          await persistBlueprint(currentBlueprint);
          draw();
        } catch (err) {
          setButtonLoading(btn, false);
          showToast(err.message, 'error');
        }
      };
    });

    const editModal = document.getElementById('bp-edit-modal');
    let editingKey = '';
    const closeEdit = () => closeModalElement(editModal);
    document.getElementById('bp-edit-close').onclick = closeEdit;
    document.getElementById('bp-edit-cancel').onclick = closeEdit;

    root.querySelectorAll('[data-edit-sec]').forEach((btn) => {
      btn.onclick = () => {
        editingKey = btn.dataset.editSec;
        const meta = BLUEPRINT_SECTIONS.find((s) => s.key === editingKey);
        const val = currentBlueprint?.[editingKey];
        document.getElementById('bp-edit-title').textContent = `Edit ${meta?.label || editingKey}`;
        document.getElementById('bp-edit-textarea').value =
          typeof val === 'string' ? val : JSON.stringify(val ?? [], null, 2);
        openModalElement(editModal, '#bp-edit-textarea');
      };
    });

    document.getElementById('bp-edit-save').onclick = async () => {
      const saveBtn = document.getElementById('bp-edit-save');
      const meta = BLUEPRINT_SECTIONS.find((s) => s.key === editingKey);
      const raw = document.getElementById('bp-edit-textarea').value;
      let nextVal = raw;
      if (meta?.type !== 'text') {
        try {
          nextVal = JSON.parse(raw);
        } catch {
          showToast('Please enter valid JSON for structured list/table sections.', 'error');
          return;
        }
      }
      setButtonLoading(saveBtn, true, 'Saving...');
      try {
        currentBlueprint = { ...(currentBlueprint || {}), [editingKey]: nextVal };
        await persistBlueprint(currentBlueprint);
        closeEdit();
        draw();
      } finally {
        setButtonLoading(saveBtn, false);
      }
    };

    renderIcons();
  }

  draw();
}

const params = new URLSearchParams(window.location.search);
const mode = params.get('mode') || 'blueprint';

initProtectedPage({
  activeKey: mode === 'create' ? 'creator' : mode === 'list' ? 'events' : 'blueprint',
  pageTitle: mode === 'create' ? 'AI Event Creator' : mode === 'list' ? 'My Events' : 'Event Blueprint',
  onReady: async ({ profile, events, activeEvent }) => {
    const root = document.getElementById('event-root');
    if (!root) return;

    if (mode === 'create') {
      renderNineStepWizard(root, profile);
    } else if (mode === 'list' || !activeEvent) {
      renderEventsDirectory(root, events, activeEvent);
    } else {
      renderBlueprintWorkspace(root, activeEvent);
    }
  }
});
