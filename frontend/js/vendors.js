import { apiRequest, callAiEndpoint } from './api.js';
import {
  closeModalElement,
  copyToClipboard,
  escapeHtml,
  formatCurrency,
  initProtectedPage,
  openConfirmModal,
  openModalElement,
  renderIcons,
  renderNoEventState,
  setButtonLoading,
  showToast
} from './main.js';

const VENDOR_CATEGORIES = [
  'Venue', 'Catering', 'Photography', 'Videography', 'Decoration',
  'Makeup', 'Entertainment', 'Music', 'Transportation', 'Invitations',
  'Accommodation', 'Other'
];

initProtectedPage({
  activeKey: 'vendors',
  pageTitle: 'Vendors & Inquiries',
  onReady: async ({ activeEvent }) => {
    const root = document.getElementById('vendors-root');
    if (!root) return;
    if (!activeEvent) {
      renderNoEventState(root, 'Select or Create an Event to Manage Vendors');
      return;
    }

    const apiBase = `/api/events/${encodeURIComponent(activeEvent.id)}/vendors`;
    const expensesApi = `/api/events/${encodeURIComponent(activeEvent.id)}/expenses`;
    let vendors = [];
    let categoryFilter = 'All';
    let aiInquiries = null;

    async function loadVendors() {
      const data = await apiRequest(apiBase);
      vendors = data.vendors || [];
    }

    function openVendorModal(v = null) {
      const modal = document.getElementById('vendor-modal');
      if (!modal) return;
      document.getElementById('vendor-modal-title').textContent = v ? 'Edit Vendor' : 'Add Vendor';
      document.getElementById('vendor-id').value = v?.id || '';
      document.getElementById('vendor-name').value = v?.name || '';
      document.getElementById('vendor-cat').value = v?.category || 'Venue';
      document.getElementById('vendor-status').value = v?.status || 'shortlisted';
      document.getElementById('vendor-contact').value = v?.contactInfo || '';
      document.getElementById('vendor-est').value = v?.estimatedCost ?? 0;
      document.getElementById('vendor-act').value = v?.actualCost ?? 0;
      document.getElementById('vendor-pay').value = v?.paymentStatus || 'unpaid';
      document.getElementById('vendor-date').value = v?.bookingDate || '';
      document.getElementById('vendor-notes').value = v?.notes || '';
      openModalElement(modal, '#vendor-name');
    }

    function renderVendorTable() {
      const slot = document.getElementById('vendor-table-slot');
      const heading = document.getElementById('tracked-vendors-heading');
      if (!slot) return;

      const filtered = categoryFilter === 'All' ? vendors : vendors.filter((v) => v.category === categoryFilter);
      if (heading) {
        heading.textContent = `Tracked Vendors (${filtered.length})`;
      }

      slot.innerHTML =
        filtered.length === 0
          ? `<div class="empty-state">
              <p class="text-muted-ivory">No vendors added yet. Add vendors you are researching or booking.</p>
              <button type="button" id="empty-add-vendor" class="btn btn-ivory-primary">Add First Vendor</button>
            </div>`
          : `<div class="data-table-wrap">
              <table class="data-table">
                <thead>
                  <tr>
                    <th>Vendor</th>
                    <th>Category</th>
                    <th>Status</th>
                    <th>Contact</th>
                    <th class="num-col">Estimated</th>
                    <th class="num-col">Actual</th>
                    <th>Payment</th>
                    <th>Booking Date</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  ${filtered
                    .map(
                      (v) => `
                      <tr>
                        <td>
                          <strong>${escapeHtml(v.name)}</strong>
                          ${v.notes ? `<div class="text-muted-ivory" style="font-size:12px;">${escapeHtml(v.notes)}</div>` : ''}
                        </td>
                        <td>${escapeHtml(v.category)}</td>
                        <td style="text-transform:capitalize;">${escapeHtml(v.status)}</td>
                        <td class="text-muted-ivory" style="font-size:12.5px;">${escapeHtml(v.contactInfo || '—')}</td>
                        <td class="num-col">${escapeHtml(formatCurrency(v.estimatedCost, activeEvent.currency))}</td>
                        <td class="num-col">${escapeHtml(formatCurrency(v.actualCost, activeEvent.currency))}</td>
                        <td style="text-transform:capitalize;">${escapeHtml(v.paymentStatus.replace('_', ' '))}</td>
                        <td class="tabular-nums">${escapeHtml(v.bookingDate || '—')}</td>
                        <td style="white-space:nowrap;">
                          <button type="button" class="btn btn-sm btn-ivory-outline" data-link-budget="${escapeHtml(v.id)}">Sync to Budget</button>
                          <button type="button" class="btn btn-sm btn-ivory-outline" data-edit-vendor="${escapeHtml(v.id)}">Edit</button>
                          <button type="button" class="btn btn-sm btn-danger-ivory" data-del-vendor="${escapeHtml(v.id)}">Delete</button>
                        </td>
                      </tr>`
                    )
                    .join('')}
                </tbody>
              </table>
            </div>`;

      slot.querySelector('#empty-add-vendor')?.addEventListener('click', () => openVendorModal(null));
      slot.querySelectorAll('[data-edit-vendor]').forEach((b) => {
        b.onclick = () => openVendorModal(vendors.find((x) => x.id === b.dataset.editVendor));
      });
      slot.querySelectorAll('[data-del-vendor]').forEach((b) => {
        b.onclick = () => {
          const v = vendors.find((x) => x.id === b.dataset.delVendor);
          openConfirmModal({
            title: 'Delete Vendor?',
            message: `Remove "${v?.name}" from your vendor directory?`,
            confirmLabel: 'Delete',
            onConfirm: async () => {
              try {
                await apiRequest(`${apiBase}/${encodeURIComponent(v.id)}`, { method: 'DELETE' });
                await loadVendors();
                renderVendorTable();
                showToast('Vendor deleted.', 'success');
              } catch (err) {
                showToast(err.message, 'error');
              }
            }
          });
        };
      });
      slot.querySelectorAll('[data-link-budget]').forEach((b) => {
        b.onclick = async () => {
          const v = vendors.find((x) => x.id === b.dataset.linkBudget);
          if (!v) return;
          const budgetCategoryMap = {
            Makeup: 'Clothing',
            Music: 'Entertainment'
          };
          const mappedCat =
            budgetCategoryMap[v.category] ||
            (['Venue', 'Catering', 'Decoration', 'Photography', 'Videography', 'Entertainment', 'Transportation', 'Invitations', 'Accommodation'].includes(v.category)
              ? v.category
              : 'Miscellaneous');
          setButtonLoading(b, true, 'Syncing...');
          try {
            await apiRequest(expensesApi, {
              method: 'POST',
              body: {
                title: `${v.name} (${v.category})`,
                category: mappedCat,
                vendorId: v.id,
                vendorName: v.name,
                estimatedCost: Math.max(0, Number(v.estimatedCost) || 0),
                actualCost: Math.max(0, Number(v.actualCost) || 0),
                paymentStatus: v.paymentStatus === 'deposit_paid' ? 'partial' : v.paymentStatus === 'paid' ? 'paid' : 'unpaid',
                expenseDate: v.bookingDate || '',
                notes: v.notes || ''
              }
            });
            showToast(`Synced "${v.name}" to Budget Planner.`, 'success');
          } catch (err) {
            showToast(err.message, 'error');
          } finally {
            setButtonLoading(b, false);
          }
        };
      });
    }

    function render() {
      root.innerHTML = `
        <section class="surface-forest panel-pad" style="margin-bottom:20px;">
          <div style="display:flex;justify-content:space-between;align-items:center;gap:16px;flex-wrap:wrap;">
            <div>
              <h1 style="font-size:34px;">Vendor Management & AI Inquiries</h1>
              <p class="text-muted-dark" style="font-size:14px;">Track contracts, payments, bookings, and draft personalized vendor outreach.</p>
            </div>
            <div style="display:flex;gap:10px;flex-wrap:wrap;">
              <button type="button" id="open-vendor-inquiry" class="btn btn-primary">AI Vendor Inquiry</button>
              <button type="button" id="open-add-vendor" class="btn btn-secondary">Add Vendor</button>
            </div>
          </div>
        </section>

        <div id="vendor-inquiry-slot" style="margin-bottom:20px;"></div>

        <section class="surface-ivory panel-pad">
          <div class="panel-head">
            <div>
              <h2 id="tracked-vendors-heading" style="font-size:24px;">Tracked Vendors</h2>
              <p class="text-muted-ivory" style="font-size:13px;">Sync any vendor directly to your Budget Ledger with one click.</p>
            </div>
            <select id="vendor-cat-filter" aria-label="Filter vendors by category" class="field-select" style="width:auto;">
              <option value="All">All Categories</option>
              ${VENDOR_CATEGORIES.map((c) => `<option value="${c}" ${categoryFilter === c ? 'selected' : ''}>${c}</option>`).join('')}
            </select>
          </div>
          <div id="vendor-table-slot"></div>
        </section>

        <div id="vendor-modal" class="modal-backdrop" aria-hidden="true">
          <div class="modal-panel">
            <div class="modal-header">
              <h3 id="vendor-modal-title" style="font-size:24px;">Add Vendor</h3>
              <button type="button" class="btn btn-sm btn-ivory-outline" id="close-vendor-modal">Close</button>
            </div>
            <form id="vendor-form" style="display:flex;flex-direction:column;gap:12px;">
              <input type="hidden" id="vendor-id" />
              <div class="field-group">
                <label class="field-label" for="vendor-name">Vendor Name</label>
                <input id="vendor-name" class="field-input" required maxlength="160" />
              </div>
              <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
                <div class="field-group">
                  <label class="field-label" for="vendor-cat">Category</label>
                  <select id="vendor-cat" class="field-select">
                    ${VENDOR_CATEGORIES.map((c) => `<option value="${c}">${c}</option>`).join('')}
                  </select>
                </div>
                <div class="field-group">
                  <label class="field-label" for="vendor-status">Status</label>
                  <select id="vendor-status" class="field-select">
                    <option value="shortlisted">Shortlisted</option>
                    <option value="contacted">Contacted</option>
                    <option value="booked">Booked</option>
                    <option value="paid">Paid</option>
                    <option value="declined">Declined</option>
                  </select>
                </div>
              </div>
              <div class="field-group">
                <label class="field-label" for="vendor-contact">Contact Information</label>
                <input id="vendor-contact" class="field-input" maxlength="300" placeholder="Email, phone, or website" />
              </div>
              <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
                <div class="field-group">
                  <label class="field-label" for="vendor-est">Estimated Cost (${escapeHtml(activeEvent.currency)})</label>
                  <input id="vendor-est" type="number" min="0" step="any" class="field-input" value="0" required />
                </div>
                <div class="field-group">
                  <label class="field-label" for="vendor-act">Actual Cost (${escapeHtml(activeEvent.currency)})</label>
                  <input id="vendor-act" type="number" min="0" step="any" class="field-input" value="0" required />
                </div>
              </div>
              <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
                <div class="field-group">
                  <label class="field-label" for="vendor-pay">Payment Status</label>
                  <select id="vendor-pay" class="field-select">
                    <option value="unpaid">Unpaid</option>
                    <option value="deposit_paid">Deposit Paid</option>
                    <option value="paid">Paid</option>
                  </select>
                </div>
                <div class="field-group">
                  <label class="field-label" for="vendor-date">Booking Date</label>
                  <input id="vendor-date" type="date" class="field-input" />
                </div>
              </div>
              <div class="field-group">
                <label class="field-label" for="vendor-notes">Notes</label>
                <textarea id="vendor-notes" class="field-textarea" maxlength="800" style="min-height:70px;"></textarea>
              </div>
              <div class="modal-footer">
                <button type="button" class="btn btn-ivory-outline" id="cancel-vendor-modal">Cancel</button>
                <button type="submit" id="save-vendor-btn" class="btn btn-ivory-primary">Save Vendor</button>
              </div>
            </form>
          </div>
        </div>
      `;

      renderVendorTable();

      const modal = document.getElementById('vendor-modal');
      const closeModal = () => closeModalElement(modal);

      document.getElementById('open-add-vendor').onclick = () => openVendorModal(null);
      document.getElementById('close-vendor-modal').onclick = closeModal;
      document.getElementById('cancel-vendor-modal').onclick = closeModal;
      document.getElementById('vendor-cat-filter').onchange = (e) => {
        categoryFilter = e.target.value;
        renderVendorTable();
      };

      document.getElementById('vendor-form').onsubmit = async (e) => {
        e.preventDefault();
        const saveBtn = document.getElementById('save-vendor-btn');
        const id = document.getElementById('vendor-id').value;
        const payload = {
          name: document.getElementById('vendor-name').value.trim(),
          category: document.getElementById('vendor-cat').value,
          status: document.getElementById('vendor-status').value,
          contactInfo: document.getElementById('vendor-contact').value.trim(),
          estimatedCost: Math.max(0, Number(document.getElementById('vendor-est').value) || 0),
          actualCost: Math.max(0, Number(document.getElementById('vendor-act').value) || 0),
          paymentStatus: document.getElementById('vendor-pay').value,
          bookingDate: document.getElementById('vendor-date').value,
          notes: document.getElementById('vendor-notes').value.trim()
        };
        setButtonLoading(saveBtn, true, 'Saving...');
        try {
          if (id) {
            await apiRequest(`${apiBase}/${encodeURIComponent(id)}`, { method: 'PUT', body: payload });
            showToast('Vendor updated.', 'success');
          } else {
            await apiRequest(apiBase, { method: 'POST', body: payload });
            showToast('Vendor added.', 'success');
          }
          closeModal();
          await loadVendors();
          renderVendorTable();
        } catch (err) {
          showToast(err.message, 'error');
        } finally {
          setButtonLoading(saveBtn, false);
        }
      };

      document.getElementById('open-vendor-inquiry').onclick = () => openInquiryPanel();
      if (aiInquiries) renderInquiryResults();

      renderIcons();
    }

    function openInquiryPanel() {
      const slot = document.getElementById('vendor-inquiry-slot');
      slot.innerHTML = `
        <div class="surface-forest panel-pad">
          <div class="panel-head">
            <div>
              <h2 style="font-size:24px;">AI Vendor Inquiry Generator</h2>
              <p class="text-muted-dark" style="font-size:13px;">Generate personalized emails, WhatsApp inquiries, and follow-ups using your event context.</p>
            </div>
          </div>
          <form id="vendor-inquiry-form" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:12px;align-items:end;">
            <div class="field-group">
              <label class="field-label" for="inq-cat">Vendor Category</label>
              <select id="inq-cat" class="field-select field-select-dark">
                ${VENDOR_CATEGORIES.map((c) => `<option value="${c}">${c}</option>`).join('')}
              </select>
            </div>
            <div class="field-group">
              <label class="field-label" for="inq-reqs">Specific Requirements</label>
              <input id="inq-reqs" class="field-input field-input-dark" placeholder="e.g., Full-day coverage, custom lighting rig, vegan tasting menu" />
            </div>
            <button type="submit" id="inq-submit" class="btn btn-primary">Draft Messages</button>
          </form>
          <div id="inq-results-area" style="margin-top:18px;"></div>
        </div>
      `;
      if (aiInquiries) renderInquiryResults();

      document.getElementById('vendor-inquiry-form').onsubmit = async (e) => {
        e.preventDefault();
        const btn = document.getElementById('inq-submit');
        const area = document.getElementById('inq-results-area');
        setButtonLoading(btn, true, 'Drafting...');
        area.innerHTML = `<div class="ai-loading-box"><div class="ai-spinner ai-spinner-lg"></div><div class="ai-loading-copy"><span class="ai-loading-title">Drafting vendor outreach package...</span><span class="ai-loading-sub">Writing tailored email, WhatsApp inquiry, short brief, and follow-up.</span></div></div>`;
        try {
          const res = await callAiEndpoint('/api/ai/generate-vendor-email', {
            event: activeEvent,
            vendorCategory: document.getElementById('inq-cat').value,
            requirements: document.getElementById('inq-reqs').value
          });
          aiInquiries = res.messages;
          renderInquiryResults();
        } catch (err) {
          area.innerHTML = '';
          showToast(err.message, 'error');
        } finally {
          setButtonLoading(btn, false);
        }
      };
    }

    function renderInquiryResults() {
      const area = document.getElementById('inq-results-area');
      if (!area || !aiInquiries) return;
      const blocks = [
        { title: 'Professional Email', text: `Subject: ${aiInquiries.emailSubject}\n\n${aiInquiries.emailBody}` },
        { title: 'WhatsApp Message', text: aiInquiries.whatsappMessage },
        { title: 'Short Inquiry', text: aiInquiries.shortInquiry },
        { title: 'Follow-Up Message', text: aiInquiries.followUpMessage }
      ];
      area.innerHTML = `
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:14px;">
          ${blocks
            .map(
              (b, idx) => `
              <div class="surface-ivory" style="padding:16px;display:flex;flex-direction:column;justify-content:space-between;gap:10px;">
                <div>
                  <strong style="display:block;margin-bottom:6px;">${escapeHtml(b.title)}</strong>
                  <p style="white-space:pre-wrap;font-size:13.5px;">${escapeHtml(b.text || '')}</p>
                </div>
                <button type="button" class="btn btn-sm btn-ivory-outline" data-copy-inq="${idx}">Copy Message</button>
              </div>`
            )
            .join('')}
        </div>
      `;
      area.querySelectorAll('[data-copy-inq]').forEach((b) => {
        b.onclick = () => copyToClipboard(blocks[Number(b.dataset.copyInq)].text || '', 'Vendor inquiry copied.');
      });
    }

    await loadVendors();
    render();
  }
});
