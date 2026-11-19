import Chart from 'chart.js/auto';
import { apiRequest, callAiEndpoint } from './api.js';
import {
  escapeHtml,
  formatCurrency,
  initProtectedPage,
  openConfirmModal,
  renderIcons,
  renderNoEventState,
  setButtonLoading,
  showToast
} from './main.js';

const BUDGET_CATEGORIES = [
  'Venue', 'Catering', 'Decoration', 'Photography', 'Videography',
  'Entertainment', 'Transportation', 'Invitations', 'Clothing',
  'Accommodation', 'Miscellaneous'
];

let allocationChartInstance = null;
let comparisonChartInstance = null;

initProtectedPage({
  activeKey: 'budget',
  pageTitle: 'Budget Planner',
  onReady: async ({ activeEvent }) => {
    const root = document.getElementById('budget-root');
    if (!root) return;
    if (!activeEvent) {
      renderNoEventState(root, 'Select or Create an Event to Track Budget');
      return;
    }

    const apiBase = `/api/events/${encodeURIComponent(activeEvent.id)}/expenses`;

    let expenses = [];
    let vendors = [];
    let activeCategoryFilter = 'All';
    let aiAdvice = null;

    async function loadData() {
      const data = await apiRequest(apiBase);
      expenses = data.expenses || [];
      vendors = data.vendors || [];
    }

    function computeTotals() {
      const totalBudget = Number(activeEvent.budget) || 0;
      const totalEstimated = expenses.reduce((s, e) => s + (Number(e.estimatedCost) || 0), 0);
      const totalActual = expenses.reduce((s, e) => s + (Number(e.actualCost) || 0), 0);
      const remaining = totalBudget - totalActual;
      const percentSpent = totalBudget > 0 ? Math.round((totalActual / totalBudget) * 1000) / 10 : 0;

      const byCategory = BUDGET_CATEGORIES.map((cat) => {
        const rows = expenses.filter((e) => e.category === cat);
        return {
          category: cat,
          estimated: rows.reduce((s, r) => s + (Number(r.estimatedCost) || 0), 0),
          actual: rows.reduce((s, r) => s + (Number(r.actualCost) || 0), 0)
        };
      }).filter((c) => c.estimated > 0 || c.actual > 0);

      return { totalBudget, totalEstimated, totalActual, remaining, percentSpent, byCategory };
    }

    function renderCharts(totals) {
      const allocCanvas = document.getElementById('budget-allocation-chart');
      const compCanvas = document.getElementById('budget-comparison-chart');
      if (allocationChartInstance) allocationChartInstance.destroy();
      if (comparisonChartInstance) comparisonChartInstance.destroy();

      if (!allocCanvas || !compCanvas || totals.byCategory.length === 0) return;

      const palette = [
        '#14251C', '#355743', '#5A765C', '#A3B59A', '#8B6548',
        '#C7A98A', '#1F3A2D', '#4A6353', '#7A6855', '#B7A895', '#2A3F33'
      ];

      allocationChartInstance = new Chart(allocCanvas, {
        type: 'doughnut',
        data: {
          labels: totals.byCategory.map((c) => c.category),
          datasets: [{
            data: totals.byCategory.map((c) => c.estimated || c.actual),
            backgroundColor: palette,
            borderWidth: 1,
            borderColor: '#F5F3ED'
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { position: 'right', labels: { color: '#14251C', boxWidth: 12 } }
          }
        }
      });

      comparisonChartInstance = new Chart(compCanvas, {
        type: 'bar',
        data: {
          labels: totals.byCategory.map((c) => c.category),
          datasets: [
            {
              label: 'Estimated',
              data: totals.byCategory.map((c) => c.estimated),
              backgroundColor: '#A3B59A',
              borderRadius: 4
            },
            {
              label: 'Actual Spent',
              data: totals.byCategory.map((c) => c.actual),
              backgroundColor: '#14251C',
              borderRadius: 4
            }
          ]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          scales: {
            x: { ticks: { color: '#14251C' } },
            y: { beginAtZero: true, ticks: { color: '#14251C' } }
          }
        }
      });
    }

    function render() {
      const totals = computeTotals();
      const overBudget = totals.totalActual > totals.totalBudget;
      const filteredExpenses =
        activeCategoryFilter === 'All'
          ? expenses
          : expenses.filter((e) => e.category === activeCategoryFilter);

      root.innerHTML = `
        <section class="surface-forest panel-pad" style="margin-bottom:20px;">
          <div style="display:flex;justify-content:space-between;align-items:center;gap:16px;flex-wrap:wrap;">
            <div>
              <h1 style="font-size:34px;">Budget Planner & Optimizer</h1>
              <p class="text-muted-dark" style="font-size:14px;">Track estimated allocations, actual vendor payments, and AI cost guidance.</p>
            </div>
            <div style="display:flex;gap:10px;flex-wrap:wrap;">
              <button type="button" id="run-budget-advisor" class="btn btn-primary">Run AI Budget Advisor</button>
              <button type="button" id="open-add-expense" class="btn btn-secondary">Add Expense</button>
            </div>
          </div>
        </section>

        ${
          overBudget
            ? `<div class="surface-ivory panel-pad" style="margin-bottom:18px;background:#F9ECE8;border-color:rgba(184,74,57,0.35);">
                <strong class="status-danger">Over-Budget Alert: Actual spending (${escapeHtml(formatCurrency(totals.totalActual, activeEvent.currency))}) exceeds your total budget (${escapeHtml(formatCurrency(totals.totalBudget, activeEvent.currency))}) by ${escapeHtml(formatCurrency(Math.abs(totals.remaining), activeEvent.currency))}.</strong>
              </div>`
            : ''
        }

        <section class="kpi-strip">
          <div class="surface-ivory kpi-card">
            <div style="font-size:12.5px;color:rgba(20,37,28,0.65);">Total Budget</div>
            <div class="kpi-value">${escapeHtml(formatCurrency(totals.totalBudget, activeEvent.currency))}</div>
          </div>
          <div class="surface-ivory kpi-card">
            <div style="font-size:12.5px;color:rgba(20,37,28,0.65);">Allocated (Estimated)</div>
            <div class="kpi-value">${escapeHtml(formatCurrency(totals.totalEstimated, activeEvent.currency))}</div>
          </div>
          <div class="surface-ivory kpi-card">
            <div style="font-size:12.5px;color:rgba(20,37,28,0.65);">Actual Spending</div>
            <div class="kpi-value">${escapeHtml(formatCurrency(totals.totalActual, activeEvent.currency))}</div>
            <div class="progress-track"><div class="progress-fill ${overBudget ? 'over-budget' : ''}" style="width:${Math.min(100, totals.percentSpent)}%;"></div></div>
          </div>
          <div class="surface-ivory kpi-card">
            <div style="font-size:12.5px;color:rgba(20,37,28,0.65);">Remaining Balance</div>
            <div class="kpi-value ${overBudget ? 'status-danger' : 'status-success'}">${escapeHtml(formatCurrency(totals.remaining, activeEvent.currency))}</div>
            <div class="tabular-nums" style="font-size:12px;color:rgba(20,37,28,0.65);">${totals.percentSpent}% spent</div>
          </div>
        </section>

        ${
          totals.byCategory.length > 0
            ? `<section class="charts-grid" style="margin-bottom:20px;">
                <div class="surface-ivory panel-pad">
                  <h2 style="font-size:22px;margin-bottom:14px;">Budget Allocation by Category</h2>
                  <div class="chart-box"><canvas id="budget-allocation-chart"></canvas></div>
                </div>
                <div class="surface-ivory panel-pad">
                  <h2 style="font-size:22px;margin-bottom:14px;">Estimated vs. Actual Spending</h2>
                  <div class="chart-box"><canvas id="budget-comparison-chart"></canvas></div>
                </div>
              </section>`
            : ''
        }

        <div id="ai-advisor-slot" style="margin-bottom:20px;"></div>

        <section class="surface-ivory panel-pad">
          <div class="panel-head">
            <div>
              <h2 style="font-size:24px;">Expense Ledger (${filteredExpenses.length})</h2>
              <p class="text-muted-ivory" style="font-size:13px;">Every expense can link to a tracked vendor and payment status.</p>
            </div>
            <select id="filter-exp-cat" class="field-select" style="width:auto;min-width:190px;">
              <option value="All">All Categories</option>
              ${BUDGET_CATEGORIES.map((c) => `<option value="${c}" ${activeCategoryFilter === c ? 'selected' : ''}>${c}</option>`).join('')}
            </select>
          </div>
          ${
            filteredExpenses.length === 0
              ? `<div class="empty-state">
                  <p class="text-muted-ivory">No expenses recorded in this category yet.</p>
                  <button type="button" id="empty-add-expense" class="btn btn-ivory-primary">Add First Expense</button>
                </div>`
              : `<div class="data-table-wrap">
                  <table class="data-table">
                    <thead>
                      <tr>
                        <th>Item</th>
                        <th>Category</th>
                        <th>Vendor</th>
                        <th>Status</th>
                        <th class="num-col">Estimated</th>
                        <th class="num-col">Actual</th>
                        <th>Date</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      ${filteredExpenses
                        .map(
                          (exp) => `
                          <tr>
                            <td>
                              <strong>${escapeHtml(exp.title)}</strong>
                              ${exp.notes ? `<div class="text-muted-ivory" style="font-size:12px;">${escapeHtml(exp.notes)}</div>` : ''}
                            </td>
                            <td>${escapeHtml(exp.category)}</td>
                            <td class="text-muted-ivory">${escapeHtml(exp.vendorName || '—')}</td>
                            <td>
                              <span class="status-label ${exp.paymentStatus === 'paid' ? 'status-success' : exp.paymentStatus === 'partial' ? 'status-warning' : 'status-neutral'}" style="text-transform:capitalize;">
                                ${escapeHtml(exp.paymentStatus)}
                              </span>
                            </td>
                            <td class="num-col">${escapeHtml(formatCurrency(exp.estimatedCost, activeEvent.currency))}</td>
                            <td class="num-col">${escapeHtml(formatCurrency(exp.actualCost, activeEvent.currency))}</td>
                            <td class="tabular-nums">${escapeHtml(exp.expenseDate || '—')}</td>
                            <td style="white-space:nowrap;">
                              <button type="button" class="btn btn-sm btn-ivory-outline" data-edit-exp="${escapeHtml(exp.id)}">Edit</button>
                              <button type="button" class="btn btn-sm btn-danger-ivory" data-del-exp="${escapeHtml(exp.id)}">Delete</button>
                            </td>
                          </tr>`
                        )
                        .join('')}
                    </tbody>
                  </table>
                </div>`
          }
        </section>

        <div id="expense-modal" class="modal-backdrop">
          <div class="modal-panel">
            <div class="modal-header">
              <h3 id="exp-modal-title" style="font-size:24px;">Add Expense</h3>
              <button type="button" class="btn btn-sm btn-ivory-outline" id="close-exp-modal">Close</button>
            </div>
            <form id="expense-form" style="display:flex;flex-direction:column;gap:14px;">
              <input type="hidden" id="exp-id" />
              <div class="field-group">
                <label class="field-label" for="exp-title">Expense Title</label>
                <input id="exp-title" class="field-input" required maxlength="180" placeholder="e.g., Conservatory Venue Deposit" />
              </div>
              <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
                <div class="field-group">
                  <label class="field-label" for="exp-category">Category</label>
                  <select id="exp-category" class="field-select">
                    ${BUDGET_CATEGORIES.map((c) => `<option value="${c}">${c}</option>`).join('')}
                  </select>
                </div>
                <div class="field-group">
                  <label class="field-label" for="exp-vendor">Linked Vendor (Optional)</label>
                  <select id="exp-vendor" class="field-select">
                    <option value="">None</option>
                    ${vendors.map((v) => `<option value="${escapeHtml(v.id)}">${escapeHtml(v.name)} (${escapeHtml(v.category)})</option>`).join('')}
                  </select>
                </div>
              </div>
              <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
                <div class="field-group">
                  <label class="field-label" for="exp-est">Estimated Cost (${escapeHtml(activeEvent.currency)})</label>
                  <input id="exp-est" type="number" min="0" step="any" class="field-input" required value="0" />
                </div>
                <div class="field-group">
                  <label class="field-label" for="exp-act">Actual Cost (${escapeHtml(activeEvent.currency)})</label>
                  <input id="exp-act" type="number" min="0" step="any" class="field-input" required value="0" />
                </div>
              </div>
              <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
                <div class="field-group">
                  <label class="field-label" for="exp-status">Payment Status</label>
                  <select id="exp-status" class="field-select">
                    <option value="unpaid">Unpaid</option>
                    <option value="partial">Partial</option>
                    <option value="paid">Paid</option>
                  </select>
                </div>
                <div class="field-group">
                  <label class="field-label" for="exp-date">Expense Date</label>
                  <input id="exp-date" type="date" class="field-input" />
                </div>
              </div>
              <div class="field-group">
                <label class="field-label" for="exp-notes">Notes</label>
                <textarea id="exp-notes" class="field-textarea" maxlength="800" style="min-height:70px;"></textarea>
              </div>
              <div class="modal-footer">
                <button type="button" class="btn btn-ivory-outline" id="cancel-exp-modal">Cancel</button>
                <button type="submit" class="btn btn-ivory-primary">Save Expense</button>
              </div>
            </form>
          </div>
        </div>
      `;

      renderCharts(totals);
      if (aiAdvice) renderAiAdvice();

      const modal = document.getElementById('expense-modal');
      const openModal = (exp = null) => {
        document.getElementById('exp-modal-title').textContent = exp ? 'Edit Expense' : 'Add Expense';
        document.getElementById('exp-id').value = exp?.id || '';
        document.getElementById('exp-title').value = exp?.title || '';
        document.getElementById('exp-category').value = exp?.category || 'Venue';
        document.getElementById('exp-vendor').value = exp?.vendorId || '';
        document.getElementById('exp-est').value = exp?.estimatedCost ?? 0;
        document.getElementById('exp-act').value = exp?.actualCost ?? 0;
        document.getElementById('exp-status').value = exp?.paymentStatus || 'unpaid';
        document.getElementById('exp-date').value = exp?.expenseDate || '';
        document.getElementById('exp-notes').value = exp?.notes || '';
        modal.classList.add('open');
      };
      const closeModal = () => modal.classList.remove('open');

      document.getElementById('open-add-expense').onclick = () => openModal(null);
      document.getElementById('empty-add-expense')?.addEventListener('click', () => openModal(null));
      document.getElementById('close-exp-modal').onclick = closeModal;
      document.getElementById('cancel-exp-modal').onclick = closeModal;

      document.getElementById('filter-exp-cat').onchange = (e) => {
        activeCategoryFilter = e.target.value;
        render();
      };

      root.querySelectorAll('[data-edit-exp]').forEach((btn) => {
        btn.onclick = () => openModal(expenses.find((x) => x.id === btn.dataset.editExp));
      });

      root.querySelectorAll('[data-del-exp]').forEach((btn) => {
        btn.onclick = () => {
          const target = expenses.find((x) => x.id === btn.dataset.delExp);
          openConfirmModal({
            title: 'Delete Expense?',
            message: `Remove "${target?.title}" from your budget ledger?`,
            confirmLabel: 'Delete',
            onConfirm: async () => {
              try {
                await apiRequest(`${apiBase}/${encodeURIComponent(target.id)}`, { method: 'DELETE' });
                await loadData();
                render();
                showToast('Expense deleted.', 'success');
              } catch (err) {
                showToast(err.message, 'error');
              }
            }
          });
        };
      });

      document.getElementById('expense-form').onsubmit = async (e) => {
        e.preventDefault();
        const id = document.getElementById('exp-id').value;
        const vendorId = document.getElementById('exp-vendor').value;
        const vendorObj = vendors.find((v) => v.id === vendorId);
        const payload = {
          title: document.getElementById('exp-title').value.trim(),
          category: document.getElementById('exp-category').value,
          vendorId: vendorId || '',
          vendorName: vendorObj?.name || '',
          estimatedCost: Math.max(0, Number(document.getElementById('exp-est').value) || 0),
          actualCost: Math.max(0, Number(document.getElementById('exp-act').value) || 0),
          paymentStatus: document.getElementById('exp-status').value,
          expenseDate: document.getElementById('exp-date').value,
          notes: document.getElementById('exp-notes').value.trim()
        };

        try {
          if (id) {
            await apiRequest(`${apiBase}/${encodeURIComponent(id)}`, { method: 'PUT', body: payload });
            showToast('Expense updated.', 'success');
          } else {
            await apiRequest(apiBase, { method: 'POST', body: payload });
            showToast('Expense recorded.', 'success');
          }
          closeModal();
          await loadData();
          render();
        } catch (err) {
          showToast(err.message, 'error');
        }
      };

      document.getElementById('run-budget-advisor').onclick = async () => {
        const slot = document.getElementById('ai-advisor-slot');
        const btn = document.getElementById('run-budget-advisor');
        setButtonLoading(btn, true, 'Analyzing...');
        slot.innerHTML = `<div class="ai-loading-box"><div class="ai-spinner ai-spinner-lg"></div><div class="ai-loading-copy"><span class="ai-loading-title">AVENORA AI Budget Advisor is analyzing your spend & allocations...</span><span class="ai-loading-sub">Evaluating category ratios, savings opportunities, and risk buffers.</span></div></div>`;
        try {
          const res = await callAiEndpoint('/api/ai/budget-advisor', {
            event: activeEvent,
            budgetData: {
              totalBudget: totals.totalBudget,
              totalEstimated: totals.totalEstimated,
              totalActual: totals.totalActual,
              remaining: totals.remaining,
              percentSpent: totals.percentSpent,
              categoryBreakdown: totals.byCategory
            }
          });
          aiAdvice = res.advice;
          renderAiAdvice();
        } catch (err) {
          slot.innerHTML = '';
          showToast(err.message, 'error');
        } finally {
          setButtonLoading(btn, false);
        }
      };

      renderIcons();
    }

    function renderAiAdvice() {
      const slot = document.getElementById('ai-advisor-slot');
      if (!slot || !aiAdvice) return;
      const listBlock = (title, items) => `
        <div>
          <strong style="display:block;margin-bottom:6px;">${title}</strong>
          <ul style="margin:0;padding-left:18px;display:flex;flex-direction:column;gap:5px;font-size:13.5px;">
            ${(items || []).map((i) => `<li>${escapeHtml(i)}</li>`).join('') || '<li>None flagged.</li>'}
          </ul>
        </div>
      `;
      slot.innerHTML = `
        <div class="surface-forest panel-pad">
          <div class="panel-head">
            <div>
              <h2 style="font-size:24px;">AI Budget Advisor Analysis</h2>
              <p class="text-sage" style="font-size:12.5px;">Planning estimates based on your recorded figures</p>
            </div>
          </div>
          <p style="margin-bottom:16px;">${escapeHtml(aiAdvice.summary)}</p>
          <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:18px;">
            ${listBlock('Cost-Saving Suggestions', aiAdvice.costSavingSuggestions)}
            ${listBlock('Spending Warnings', aiAdvice.spendingWarnings)}
            ${listBlock('Reallocation Ideas', aiAdvice.reallocationSuggestions)}
            ${listBlock('Priority Recommendations', aiAdvice.priorityRecommendations)}
            ${listBlock('Alternative Ideas', aiAdvice.alternativeIdeas)}
          </div>
          <p class="text-muted-dark" style="margin-top:16px;font-size:13.5px;"><strong>Risk Analysis:</strong> ${escapeHtml(aiAdvice.budgetRiskAnalysis)}</p>
        </div>
      `;
    }

    await loadData();
    render();
  }
});
