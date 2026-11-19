import { apiRequest, callAiEndpoint } from './api.js';
import {
  copyToClipboard,
  escapeHtml,
  initProtectedPage,
  openConfirmModal,
  renderIcons,
  renderNoEventState,
  setButtonLoading,
  showToast
} from './main.js';

const GUEST_GROUPS = ['Family', 'Friends', 'Colleagues', 'VIP', 'Other'];

initProtectedPage({
  activeKey: 'guests',
  pageTitle: 'Guests & Invitations',
  onReady: async ({ activeEvent }) => {
    const root = document.getElementById('guests-root');
    if (!root) return;
    if (!activeEvent) {
      renderNoEventState(root, 'Select or Create an Event to Manage Guests');
      return;
    }

    const apiBase = `/api/events/${encodeURIComponent(activeEvent.id)}/guests`;
    let guests = [];
    let groupFilter = 'All';
    let rsvpFilter = 'all';
    let generatedInvites = null;

    async function loadGuests() {
      const data = await apiRequest(apiBase);
      guests = data.guests || [];
    }

    function render() {
      const counts = {
        total: guests.length,
        confirmed: guests.filter((g) => g.rsvpStatus === 'confirmed').length,
        pending: guests.filter((g) => g.rsvpStatus === 'pending').length,
        declined: guests.filter((g) => g.rsvpStatus === 'declined').length,
        attended: guests.filter((g) => g.attendanceStatus === 'attended').length
      };

      const filtered = guests.filter((g) => {
        if (groupFilter !== 'All' && g.group !== groupFilter) return false;
        if (rsvpFilter !== 'all' && g.rsvpStatus !== rsvpFilter) return false;
        return true;
      });

      root.innerHTML = `
        <section class="surface-forest panel-pad" style="margin-bottom:20px;">
          <div style="display:flex;justify-content:space-between;align-items:center;gap:16px;flex-wrap:wrap;">
            <div>
              <h1 style="font-size:34px;">Guest Management & AI Invitations</h1>
              <p class="text-muted-dark" style="font-size:14px;">Manage RSVPs, dietary preferences, attendance, and tailored invitations.</p>
            </div>
            <div style="display:flex;gap:10px;flex-wrap:wrap;">
              <button type="button" id="open-ai-invite-btn" class="btn btn-primary">AI Invitation Studio</button>
              <button type="button" id="open-add-guest" class="btn btn-secondary">Add Guest</button>
            </div>
          </div>
        </section>

        <section class="kpi-strip" style="grid-template-columns:repeat(5,1fr);">
          <div class="surface-ivory kpi-card"><div style="font-size:12px;">Total Guests</div><div class="kpi-value">${counts.total}</div></div>
          <div class="surface-ivory kpi-card"><div style="font-size:12px;">Confirmed</div><div class="kpi-value status-success">${counts.confirmed}</div></div>
          <div class="surface-ivory kpi-card"><div style="font-size:12px;">Pending</div><div class="kpi-value status-warning">${counts.pending}</div></div>
          <div class="surface-ivory kpi-card"><div style="font-size:12px;">Declined</div><div class="kpi-value status-danger">${counts.declined}</div></div>
          <div class="surface-ivory kpi-card"><div style="font-size:12px;">Attended</div><div class="kpi-value">${counts.attended}</div></div>
        </section>

        <div id="invite-studio-slot" style="margin-bottom:20px;"></div>

        <section class="surface-ivory panel-pad">
          <div class="panel-head">
            <div class="segmented-bar">
              ${['all', 'confirmed', 'pending', 'declined']
                .map((s) => `<button type="button" class="segmented-btn ${rsvpFilter === s ? 'active' : ''}" data-rsvp-tab="${s}" style="text-transform:capitalize;">${s}</button>`)
                .join('')}
            </div>
            <select id="guest-group-filter" class="field-select" style="width:auto;">
              <option value="All">All Groups</option>
              ${GUEST_GROUPS.map((g) => `<option value="${g}" ${groupFilter === g ? 'selected' : ''}>${g}</option>`).join('')}
            </select>
          </div>
          ${
            filtered.length === 0
              ? `<div class="empty-state">
                  <p class="text-muted-ivory">No guests in this view yet.</p>
                  <button type="button" id="empty-add-guest" class="btn btn-ivory-primary">Add First Guest</button>
                </div>`
              : `<div class="data-table-wrap">
                  <table class="data-table">
                    <thead>
                      <tr>
                        <th>Name</th>
                        <th>Group</th>
                        <th>Contact</th>
                        <th>Invitation</th>
                        <th>RSVP</th>
                        <th>Attendance</th>
                        <th>Dietary / Notes</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      ${filtered
                        .map(
                          (g) => `
                          <tr>
                            <td><strong>${escapeHtml(g.name)}</strong></td>
                            <td>${escapeHtml(g.group)}</td>
                            <td class="text-muted-ivory" style="font-size:13px;">${escapeHtml([g.email, g.phone].filter(Boolean).join(' · ') || '—')}</td>
                            <td style="text-transform:capitalize;">${escapeHtml(g.invitationStatus.replace('_', ' '))}</td>
                            <td>
                              <select class="field-select" style="min-height:34px;font-size:12.5px;width:auto;" data-quick-rsvp="${escapeHtml(g.id)}">
                                <option value="pending" ${g.rsvpStatus === 'pending' ? 'selected' : ''}>Pending</option>
                                <option value="confirmed" ${g.rsvpStatus === 'confirmed' ? 'selected' : ''}>Confirmed</option>
                                <option value="declined" ${g.rsvpStatus === 'declined' ? 'selected' : ''}>Declined</option>
                              </select>
                            </td>
                            <td style="text-transform:capitalize;">${escapeHtml(g.attendanceStatus.replace(/_/g, ' '))}</td>
                            <td class="text-muted-ivory" style="font-size:12.5px;">${escapeHtml(g.dietaryNotes || g.notes || '—')}</td>
                            <td style="white-space:nowrap;">
                              <button type="button" class="btn btn-sm btn-ivory-outline" data-edit-guest="${escapeHtml(g.id)}">Edit</button>
                              <button type="button" class="btn btn-sm btn-danger-ivory" data-del-guest="${escapeHtml(g.id)}">Delete</button>
                            </td>
                          </tr>`
                        )
                        .join('')}
                    </tbody>
                  </table>
                </div>`
          }
        </section>

        <div id="guest-modal" class="modal-backdrop">
          <div class="modal-panel">
            <div class="modal-header">
              <h3 id="guest-modal-title" style="font-size:24px;">Add Guest</h3>
              <button type="button" class="btn btn-sm btn-ivory-outline" id="close-guest-modal">Close</button>
            </div>
            <form id="guest-form" style="display:flex;flex-direction:column;gap:12px;">
              <input type="hidden" id="guest-id" />
              <div class="field-group">
                <label class="field-label" for="guest-name">Full Name</label>
                <input id="guest-name" class="field-input" required maxlength="160" />
              </div>
              <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
                <div class="field-group">
                  <label class="field-label" for="guest-email">Email</label>
                  <input id="guest-email" type="email" class="field-input" maxlength="180" />
                </div>
                <div class="field-group">
                  <label class="field-label" for="guest-phone">Phone</label>
                  <input id="guest-phone" class="field-input" maxlength="40" />
                </div>
              </div>
              <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
                <div class="field-group">
                  <label class="field-label" for="guest-group">Group</label>
                  <select id="guest-group" class="field-select">
                    ${GUEST_GROUPS.map((g) => `<option value="${g}">${g}</option>`).join('')}
                  </select>
                </div>
                <div class="field-group">
                  <label class="field-label" for="guest-rsvp">RSVP Status</label>
                  <select id="guest-rsvp" class="field-select">
                    <option value="pending">Pending</option>
                    <option value="confirmed">Confirmed</option>
                    <option value="declined">Declined</option>
                  </select>
                </div>
              </div>
              <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
                <div class="field-group">
                  <label class="field-label" for="guest-inv">Invitation Status</label>
                  <select id="guest-inv" class="field-select">
                    <option value="not_sent">Not Sent</option>
                    <option value="sent">Sent</option>
                    <option value="opened">Opened</option>
                  </select>
                </div>
                <div class="field-group">
                  <label class="field-label" for="guest-att">Attendance Status</label>
                  <select id="guest-att" class="field-select">
                    <option value="not_checked_in">Not Checked In</option>
                    <option value="attended">Attended</option>
                    <option value="absent">Absent</option>
                  </select>
                </div>
              </div>
              <div class="field-group">
                <label class="field-label" for="guest-diet">Dietary Requirements</label>
                <input id="guest-diet" class="field-input" maxlength="300" placeholder="e.g., Vegetarian, Nut-free" />
              </div>
              <div class="field-group">
                <label class="field-label" for="guest-notes">Notes</label>
                <textarea id="guest-notes" class="field-textarea" maxlength="600" style="min-height:68px;"></textarea>
              </div>
              <div class="modal-footer">
                <button type="button" class="btn btn-ivory-outline" id="cancel-guest-modal">Cancel</button>
                <button type="submit" class="btn btn-ivory-primary">Save Guest</button>
              </div>
            </form>
          </div>
        </div>
      `;

      const modal = document.getElementById('guest-modal');
      const openModal = (g = null) => {
        document.getElementById('guest-modal-title').textContent = g ? 'Edit Guest' : 'Add Guest';
        document.getElementById('guest-id').value = g?.id || '';
        document.getElementById('guest-name').value = g?.name || '';
        document.getElementById('guest-email').value = g?.email || '';
        document.getElementById('guest-phone').value = g?.phone || '';
        document.getElementById('guest-group').value = g?.group || 'Friends';
        document.getElementById('guest-rsvp').value = g?.rsvpStatus || 'pending';
        document.getElementById('guest-inv').value = g?.invitationStatus || 'not_sent';
        document.getElementById('guest-att').value = g?.attendanceStatus || 'not_checked_in';
        document.getElementById('guest-diet').value = g?.dietaryNotes || '';
        document.getElementById('guest-notes').value = g?.notes || '';
        modal.classList.add('open');
      };
      const closeModal = () => modal.classList.remove('open');

      document.getElementById('open-add-guest').onclick = () => openModal(null);
      document.getElementById('empty-add-guest')?.addEventListener('click', () => openModal(null));
      document.getElementById('close-guest-modal').onclick = closeModal;
      document.getElementById('cancel-guest-modal').onclick = closeModal;

      root.querySelectorAll('[data-rsvp-tab]').forEach((b) => {
        b.onclick = () => {
          rsvpFilter = b.dataset.rsvpTab;
          render();
        };
      });

      document.getElementById('guest-group-filter').onchange = (e) => {
        groupFilter = e.target.value;
        render();
      };

      root.querySelectorAll('[data-quick-rsvp]').forEach((sel) => {
        sel.onchange = async () => {
          const id = sel.dataset.quickRsvp;
          try {
            await apiRequest(`${apiBase}/${encodeURIComponent(id)}`, {
              method: 'PUT',
              body: { rsvpStatus: sel.value }
            });
            await loadGuests();
            render();
            showToast('RSVP updated.', 'success');
          } catch (err) {
            showToast(err.message, 'error');
          }
        };
      });

      root.querySelectorAll('[data-edit-guest]').forEach((b) => {
        b.onclick = () => openModal(guests.find((x) => x.id === b.dataset.editGuest));
      });

      root.querySelectorAll('[data-del-guest]').forEach((b) => {
        b.onclick = () => {
          const g = guests.find((x) => x.id === b.dataset.delGuest);
          openConfirmModal({
            title: 'Remove Guest?',
            message: `Remove ${g?.name} from your guest roster?`,
            confirmLabel: 'Remove',
            onConfirm: async () => {
              try {
                await apiRequest(`${apiBase}/${encodeURIComponent(g.id)}`, { method: 'DELETE' });
                await loadGuests();
                render();
                showToast('Guest removed.', 'success');
              } catch (err) {
                showToast(err.message, 'error');
              }
            }
          });
        };
      });

      document.getElementById('guest-form').onsubmit = async (e) => {
        e.preventDefault();
        const id = document.getElementById('guest-id').value;
        const payload = {
          name: document.getElementById('guest-name').value.trim(),
          email: document.getElementById('guest-email').value.trim(),
          phone: document.getElementById('guest-phone').value.trim(),
          group: document.getElementById('guest-group').value,
          rsvpStatus: document.getElementById('guest-rsvp').value,
          invitationStatus: document.getElementById('guest-inv').value,
          attendanceStatus: document.getElementById('guest-att').value,
          dietaryNotes: document.getElementById('guest-diet').value.trim(),
          notes: document.getElementById('guest-notes').value.trim()
        };
        try {
          if (id) {
            await apiRequest(`${apiBase}/${encodeURIComponent(id)}`, { method: 'PUT', body: payload });
            showToast('Guest updated.', 'success');
          } else {
            await apiRequest(apiBase, { method: 'POST', body: payload });
            showToast('Guest added.', 'success');
          }
          closeModal();
          await loadGuests();
          render();
        } catch (err) {
          showToast(err.message, 'error');
        }
      };

      document.getElementById('open-ai-invite-btn').onclick = () => openInviteStudio();
      if (generatedInvites) renderInviteStudioResults();

      renderIcons();
    }

    function openInviteStudio() {
      const slot = document.getElementById('invite-studio-slot');
      slot.innerHTML = `
        <div class="surface-forest panel-pad">
          <div class="panel-head">
            <div>
              <h2 style="font-size:24px;">AI Invitation Generator</h2>
              <p class="text-muted-dark" style="font-size:13px;">Create WhatsApp, Email, Formal, Casual, Traditional, Modern, and Custom invitations.</p>
            </div>
          </div>
          <form id="invite-gen-form" style="display:grid;grid-template-columns:1fr 1fr 1fr auto;gap:12px;align-items:end;">
            <div class="field-group">
              <label class="field-label" for="inv-tone">Tone / Direction</label>
              <input id="inv-tone" class="field-input field-input-dark" value="${escapeHtml(activeEvent.style)} & Warm" />
            </div>
            <div class="field-group">
              <label class="field-label" for="inv-guest">Guest / Group Label</label>
              <input id="inv-guest" class="field-input field-input-dark" placeholder="e.g., Dear Family" />
            </div>
            <div class="field-group">
              <label class="field-label" for="inv-notes">Dress Code / RSVP Note</label>
              <input id="inv-notes" class="field-input field-input-dark" placeholder="e.g., Garden formal · RSVP by Oct 1" />
            </div>
            <button type="submit" id="inv-submit" class="btn btn-primary">Generate</button>
          </form>
          <div id="inv-results-area" style="margin-top:18px;"></div>
        </div>
      `;
      if (generatedInvites) renderInviteStudioResults();

      document.getElementById('invite-gen-form').onsubmit = async (e) => {
        e.preventDefault();
        const btn = document.getElementById('inv-submit');
        const area = document.getElementById('inv-results-area');
        setButtonLoading(btn, true, 'Drafting...');
        area.innerHTML = `<div class="ai-loading-box"><div class="ai-spinner ai-spinner-lg"></div><div class="ai-loading-copy"><span class="ai-loading-title">Drafting 7 invitation styles...</span><span class="ai-loading-sub">Composing WhatsApp, email, formal, casual, traditional, and modern variants.</span></div></div>`;
        try {
          const res = await callAiEndpoint('/api/ai/generate-invitation', {
            event: activeEvent,
            tone: document.getElementById('inv-tone').value,
            guestName: document.getElementById('inv-guest').value,
            customNotes: document.getElementById('inv-notes').value
          });
          generatedInvites = res.invitations;
          renderInviteStudioResults();
        } catch (err) {
          area.innerHTML = '';
          showToast(err.message, 'error');
        } finally {
          setButtonLoading(btn, false);
        }
      };
    }

    function renderInviteStudioResults() {
      const area = document.getElementById('inv-results-area');
      if (!area || !generatedInvites) return;
      const cards = [
        { title: 'WhatsApp Invitation', text: generatedInvites.whatsapp },
        { title: `Email (${generatedInvites.emailSubject || 'Invitation'})`, text: `Subject: ${generatedInvites.emailSubject}\n\n${generatedInvites.emailBody}` },
        { title: 'Formal Card', text: generatedInvites.formal },
        { title: 'Casual Note', text: generatedInvites.casual },
        { title: 'Traditional', text: generatedInvites.traditional },
        { title: 'Modern Minimal', text: generatedInvites.modern },
        { title: 'Custom Variant', text: generatedInvites.custom }
      ];
      area.innerHTML = `
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:14px;">
          ${cards
            .map(
              (c, idx) => `
              <div class="surface-ivory" style="padding:16px;display:flex;flex-direction:column;justify-content:space-between;gap:10px;">
                <div>
                  <strong style="display:block;margin-bottom:6px;">${escapeHtml(c.title)}</strong>
                  <p style="white-space:pre-wrap;font-size:13.5px;">${escapeHtml(c.text || '')}</p>
                </div>
                <button type="button" class="btn btn-sm btn-ivory-outline" data-copy-inv="${idx}">Copy Text</button>
              </div>`
            )
            .join('')}
        </div>
      `;
      area.querySelectorAll('[data-copy-inv]').forEach((b) => {
        b.onclick = () => copyToClipboard(cards[Number(b.dataset.copyInv)].text || '', 'Invitation copied.');
      });
    }

    await loadGuests();
    render();
  }
});
