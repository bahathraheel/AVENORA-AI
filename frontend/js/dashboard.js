import { apiRequest } from './api.js';
import {
  escapeHtml,
  formatCurrency,
  formatDate,
  getDaysUntil,
  initProtectedPage,
  renderIcons,
  setStoredEventId
} from './main.js';

initProtectedPage({
  activeKey: 'dashboard',
  pageTitle: 'Dashboard',
  onEventSwitch: () => window.location.reload(),
  onReady: async ({ profile, events, activeEvent }) => {
    const root = document.getElementById('dashboard-root');
    if (!root) return;

    if (!activeEvent) {
      root.innerHTML = `
        <section class="surface-forest panel-pad" style="margin-bottom:24px;">
          <div style="display:flex;justify-content:space-between;align-items:center;gap:24px;flex-wrap:wrap;">
            <div>
              <p class="text-sage" style="font-size:13px;font-weight:600;margin-bottom:6px;">Welcome to AVENORA AI, ${escapeHtml(profile?.displayName || 'Planner')}</p>
              <h1 style="font-size:38px;margin-bottom:10px;">Your event command center awaits.</h1>
              <p class="text-muted-dark" style="max-width:58ch;">
                Create your first event to unlock a personalized 16-section AI Event Blueprint, live budget analytics, smart checklists, guest tracking, and Theme Studio.
              </p>
            </div>
            <a href="/event.html?mode=create" class="btn btn-primary">Create Your First Event</a>
          </div>
        </section>
      `;
      return;
    }

    const snapshot = await apiRequest(`/api/events/${encodeURIComponent(activeEvent.id)}/summary`);
    const tasks = snapshot.tasks || [];
    const expenses = snapshot.expenses || [];
    const guests = snapshot.guests || [];
    const vendors = snapshot.vendors || [];
    const timeline = snapshot.timeline || [];

    const totalBudget = Number(activeEvent.budget) || 0;
    const totalActual = expenses.reduce((s, e) => s + (Number(e.actualCost) || 0), 0);
    const totalEstimated = expenses.reduce((s, e) => s + (Number(e.estimatedCost) || 0), 0);
    const remainingBudget = totalBudget - totalActual;
    const budgetPct = totalBudget > 0 ? Math.min(100, Math.round((totalActual / totalBudget) * 100)) : 0;

    const completedTasks = tasks.filter((t) => t.status === 'completed').length;
    const taskPct = tasks.length > 0 ? Math.round((completedTasks / tasks.length) * 100) : 0;

    const confirmedGuests = guests.filter((g) => g.rsvpStatus === 'confirmed').length;
    const pendingGuests = guests.filter((g) => g.rsvpStatus === 'pending').length;

    const daysLeft = getDaysUntil(activeEvent.date);
    const countdownLabel =
      daysLeft === null ? 'Date TBD' : daysLeft > 0 ? `${daysLeft} days left` : daysLeft === 0 ? 'Event day today' : `${Math.abs(daysLeft)} days ago`;

    const upcomingDeadlines = tasks
      .filter((t) => t.status !== 'completed' && t.dueDate)
      .sort((a, b) => String(a.dueDate).localeCompare(String(b.dueDate)))
      .slice(0, 5);

    const recentActivity = [
      ...tasks.map((t) => ({ kind: 'Task', label: t.title, status: t.status, ts: t.updatedAt?.seconds || t.createdAt?.seconds || 0 })),
      ...expenses.map((e) => ({ kind: 'Expense', label: `${e.title} (${formatCurrency(e.actualCost || e.estimatedCost, activeEvent.currency)})`, status: e.paymentStatus, ts: e.updatedAt?.seconds || e.createdAt?.seconds || 0 })),
      ...guests.map((g) => ({ kind: 'Guest', label: g.name, status: g.rsvpStatus, ts: g.updatedAt?.seconds || g.createdAt?.seconds || 0 })),
      ...vendors.map((v) => ({ kind: 'Vendor', label: `${v.name} · ${v.category}`, status: v.status, ts: v.updatedAt?.seconds || v.createdAt?.seconds || 0 }))
    ]
      .sort((a, b) => b.ts - a.ts)
      .slice(0, 6);

    const blueprintSteps = activeEvent.blueprint?.nextSteps || [];
    const blueprintRecs = activeEvent.blueprint?.personalizedRecommendations || [];
    const aiHighlights = [...blueprintSteps, ...blueprintRecs].slice(0, 5);

    root.innerHTML = `
      <section class="surface-forest panel-pad" style="margin-bottom:22px;">
        <div style="display:flex;justify-content:space-between;align-items:flex-end;gap:24px;flex-wrap:wrap;">
          <div>
            <div class="meta-inline text-sage" style="margin-bottom:8px;">
              <span>Welcome back, ${escapeHtml(profile?.displayName || 'Planner')}</span>
              <span class="meta-sep">·</span>
              <span>${escapeHtml(activeEvent.type)}</span>
              <span class="meta-sep">·</span>
              <span>${escapeHtml(activeEvent.status.replace('_', ' '))}</span>
            </div>
            <h1 style="font-size:36px;margin-bottom:8px;">${escapeHtml(activeEvent.name)}</h1>
            <div class="meta-inline text-muted-dark">
              <span>${escapeHtml(formatDate(activeEvent.date))}</span>
              <span class="meta-sep">·</span>
              <span>${escapeHtml(activeEvent.location)}</span>
              <span class="meta-sep">·</span>
              <span class="tabular-nums">${escapeHtml(String(activeEvent.guestCount))} planned guests</span>
            </div>
          </div>
          <div style="display:flex;align-items:center;gap:14px;flex-wrap:wrap;">
            <div style="text-align:right;padding-right:8px;">
              <div style="font-size:12px;color:var(--color-sage);">Countdown</div>
              <div class="kpi-value text-ivory">${escapeHtml(countdownLabel)}</div>
            </div>
            <a href="/event.html?eventId=${encodeURIComponent(activeEvent.id)}" class="btn btn-primary">Open Blueprint</a>
            <a href="/copilot.html?eventId=${encodeURIComponent(activeEvent.id)}" class="btn btn-secondary">Ask Co-Pilot</a>
          </div>
        </div>
      </section>

      <section class="kpi-strip">
        <div class="surface-ivory kpi-card">
          <div style="font-size:12.5px;font-weight:600;color:rgba(20,37,28,0.65);">Remaining Budget</div>
          <div class="kpi-value ${remainingBudget < 0 ? 'status-danger' : ''}">${escapeHtml(formatCurrency(remainingBudget, activeEvent.currency))}</div>
          <div class="progress-track">
            <div class="progress-fill ${totalActual > totalBudget ? 'over-budget' : ''}" style="width:${budgetPct}%;"></div>
          </div>
          <div class="meta-inline text-muted-ivory" style="font-size:12px;">
            <span class="tabular-nums">${budgetPct}% spent</span>
            <span class="meta-sep">·</span>
            <span class="tabular-nums">of ${escapeHtml(formatCurrency(totalBudget, activeEvent.currency))}</span>
          </div>
        </div>

        <div class="surface-ivory kpi-card">
          <div style="font-size:12.5px;font-weight:600;color:rgba(20,37,28,0.65);">Checklist Progress</div>
          <div class="kpi-value">${taskPct}%</div>
          <div class="progress-track">
            <div class="progress-fill" style="width:${taskPct}%;"></div>
          </div>
          <div class="meta-inline text-muted-ivory" style="font-size:12px;">
            <span class="tabular-nums">${completedTasks} / ${tasks.length} tasks done</span>
          </div>
        </div>

        <div class="surface-ivory kpi-card">
          <div style="font-size:12.5px;font-weight:600;color:rgba(20,37,28,0.65);">Guest RSVPs</div>
          <div class="kpi-value">${confirmedGuests} <span style="font-size:15px;font-weight:500;color:rgba(20,37,28,0.58);">/ ${guests.length}</span></div>
          <div class="meta-inline text-muted-ivory" style="font-size:12px;">
            <span class="tabular-nums">${confirmedGuests} confirmed</span>
            <span class="meta-sep">·</span>
            <span class="tabular-nums">${pendingGuests} pending</span>
          </div>
        </div>

        <div class="surface-ivory kpi-card">
          <div style="font-size:12.5px;font-weight:600;color:rgba(20,37,28,0.65);">Vendors & Schedule</div>
          <div class="kpi-value">${vendors.length} <span style="font-size:15px;font-weight:500;color:rgba(20,37,28,0.58);">vendors</span></div>
          <div class="meta-inline text-muted-ivory" style="font-size:12px;">
            <span class="tabular-nums">${vendors.filter((v) => v.status === 'booked' || v.status === 'paid').length} booked</span>
            <span class="meta-sep">·</span>
            <span class="tabular-nums">${timeline.length} timeline slots</span>
          </div>
        </div>
      </section>

      <section class="dashboard-split">
        <div class="module-stack">
          <div class="surface-ivory panel-pad">
            <div class="panel-head">
              <div>
                <h2 style="font-size:24px;">Upcoming Deadlines</h2>
                <p class="text-muted-ivory" style="font-size:13px;">Prioritized directly from your saved event checklist.</p>
              </div>
              <a href="/checklist.html?eventId=${encodeURIComponent(activeEvent.id)}" class="btn btn-sm btn-ivory-outline">Manage Tasks</a>
            </div>
            ${
              upcomingDeadlines.length === 0
                ? `<div class="empty-state">
                    <p class="text-muted-ivory">No upcoming task deadlines recorded yet.</p>
                    <a href="/checklist.html?eventId=${encodeURIComponent(activeEvent.id)}" class="btn btn-sm btn-ivory-primary">Generate AI Tasks</a>
                  </div>`
                : `<div style="display:flex;flex-direction:column;gap:10px;">
                    ${upcomingDeadlines
                      .map((t) => {
                        const dLeft = getDaysUntil(t.dueDate);
                        const overdue = dLeft !== null && dLeft < 0;
                        return `
                          <div style="display:flex;justify-content:space-between;align-items:center;gap:12px;padding:12px 14px;border:var(--border-ivory);border-radius:10px;background:#fff;">
                            <div>
                              <div style="font-weight:600;font-size:14px;">${escapeHtml(t.title)}</div>
                              <div class="meta-inline text-muted-ivory" style="font-size:12px;">
                                <span>${escapeHtml(t.category)}</span>
                                <span class="meta-sep">·</span>
                                <span>Priority: ${escapeHtml(t.priority)}</span>
                              </div>
                            </div>
                            <div style="text-align:right;white-space:nowrap;">
                              <div class="tabular-nums ${overdue ? 'status-danger' : 'status-neutral'}" style="font-size:12.5px;font-weight:600;">
                                ${overdue ? 'Overdue · ' : ''}${escapeHtml(formatDate(t.dueDate))}
                              </div>
                            </div>
                          </div>
                        `;
                      })
                      .join('')}
                  </div>`
            }
          </div>

          <div class="surface-ivory panel-pad">
            <div class="panel-head">
              <div>
                <h2 style="font-size:24px;">Budget Snapshot</h2>
                <p class="text-muted-ivory" style="font-size:13px;">Estimated allocations vs. actual payments recorded.</p>
              </div>
              <a href="/budget.html?eventId=${encodeURIComponent(activeEvent.id)}" class="btn btn-sm btn-ivory-outline">Open Budget</a>
            </div>
            <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:12px;">
              <div style="padding:14px;background:#fff;border-radius:10px;border:var(--border-ivory);">
                <div style="font-size:12px;color:rgba(20,37,28,0.62);">Total Budget</div>
                <div class="tabular-nums" style="font-size:18px;font-weight:600;margin-top:4px;">${escapeHtml(formatCurrency(totalBudget, activeEvent.currency))}</div>
              </div>
              <div style="padding:14px;background:#fff;border-radius:10px;border:var(--border-ivory);">
                <div style="font-size:12px;color:rgba(20,37,28,0.62);">Allocated</div>
                <div class="tabular-nums" style="font-size:18px;font-weight:600;margin-top:4px;">${escapeHtml(formatCurrency(totalEstimated, activeEvent.currency))}</div>
              </div>
              <div style="padding:14px;background:#fff;border-radius:10px;border:var(--border-ivory);">
                <div style="font-size:12px;color:rgba(20,37,28,0.62);">Actual Spent</div>
                <div class="tabular-nums" style="font-size:18px;font-weight:600;margin-top:4px;">${escapeHtml(formatCurrency(totalActual, activeEvent.currency))}</div>
              </div>
            </div>
          </div>

          <div class="surface-ivory panel-pad">
            <div class="panel-head">
              <h2 style="font-size:24px;">Recent Activity</h2>
              <span class="text-muted-ivory" style="font-size:12.5px;">Live records</span>
            </div>
            ${
              recentActivity.length === 0
                ? `<p class="text-muted-ivory" style="font-size:14px;">Activity will appear here as you add tasks, expenses, guests, and vendors.</p>`
                : `<div style="display:flex;flex-direction:column;gap:8px;">
                    ${recentActivity
                      .map(
                        (item) => `
                        <div style="display:flex;justify-content:space-between;align-items:center;padding:10px 0;border-bottom:1px solid rgba(20,37,28,0.08);">
                          <div class="meta-inline">
                            <strong style="font-size:13px;">${escapeHtml(item.kind)}</strong>
                            <span class="meta-sep">·</span>
                            <span style="font-size:14px;">${escapeHtml(item.label)}</span>
                          </div>
                          <span style="font-size:12px;color:rgba(20,37,28,0.62);text-transform:capitalize;">${escapeHtml(String(item.status || '').replace('_', ' '))}</span>
                        </div>
                      `
                      )
                      .join('')}
                  </div>`
            }
          </div>
        </div>

        <div class="module-stack">
          <div class="surface-forest panel-pad">
            <div class="panel-head">
              <div>
                <h2 style="font-size:24px;">AI Recommendations</h2>
                <p class="text-muted-dark" style="font-size:13px;">From your saved event blueprint</p>
              </div>
              <a href="/copilot.html?eventId=${encodeURIComponent(activeEvent.id)}" class="btn btn-sm btn-primary">Co-Pilot</a>
            </div>
            ${
              aiHighlights.length === 0
                ? `<div class="empty-state empty-state-dark">
                    <p class="text-muted-dark" style="font-size:13.5px;">Generate your event blueprint to populate personalized AI next steps.</p>
                    <a href="/event.html?eventId=${encodeURIComponent(activeEvent.id)}" class="btn btn-sm btn-primary">Generate Blueprint</a>
                  </div>`
                : `<ul style="margin:0;padding-left:18px;display:flex;flex-direction:column;gap:10px;">
                    ${aiHighlights.map((rec) => `<li style="font-size:14px;color:rgba(245,243,237,0.88);">${escapeHtml(rec)}</li>`).join('')}
                  </ul>`
            }
          </div>

          <div class="surface-ivory panel-pad">
            <h2 style="font-size:24px;margin-bottom:14px;">Quick Actions</h2>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">
              <a href="/budget.html?eventId=${encodeURIComponent(activeEvent.id)}" class="btn btn-ivory-outline">Add Expense</a>
              <a href="/checklist.html?eventId=${encodeURIComponent(activeEvent.id)}" class="btn btn-ivory-outline">Add Task</a>
              <a href="/guests.html?eventId=${encodeURIComponent(activeEvent.id)}" class="btn btn-ivory-outline">Add Guest</a>
              <a href="/vendors.html?eventId=${encodeURIComponent(activeEvent.id)}" class="btn btn-ivory-outline">Add Vendor</a>
              <a href="/timeline.html?eventId=${encodeURIComponent(activeEvent.id)}" class="btn btn-ivory-outline">Edit Timeline</a>
              <a href="/theme-studio.html?eventId=${encodeURIComponent(activeEvent.id)}" class="btn btn-ivory-primary">Theme Studio</a>
            </div>
          </div>

          <div class="surface-ivory panel-pad">
            <div class="panel-head">
              <h2 style="font-size:24px;">Your Events (${events.length})</h2>
              <a href="/event.html?mode=list" class="btn btn-sm btn-ivory-outline">Manage All</a>
            </div>
            <div style="display:flex;flex-direction:column;gap:10px;">
              ${events
                .slice(0, 4)
                .map(
                  (ev) => `
                  <button type="button" data-switch-event="${escapeHtml(ev.id)}" class="choice-card ${ev.id === activeEvent.id ? 'selected' : ''}" style="display:flex;justify-content:space-between;align-items:center;">
                    <div>
                      <div style="font-weight:600;font-size:14.5px;">${escapeHtml(ev.name)}</div>
                      <div style="font-size:12px;opacity:0.75;">${escapeHtml(ev.type)} · ${escapeHtml(formatDate(ev.date))}</div>
                    </div>
                    <span style="font-size:12px;font-weight:600;">${ev.id === activeEvent.id ? 'Active' : 'Switch'}</span>
                  </button>
                `
                )
                .join('')}
            </div>
          </div>
        </div>
      </section>
    `;

    root.querySelectorAll('[data-switch-event]').forEach((btn) => {
      btn.addEventListener('click', () => {
        setStoredEventId(btn.dataset.switchEvent);
        window.location.href = `/dashboard.html?eventId=${encodeURIComponent(btn.dataset.switchEvent)}`;
      });
    });

    renderIcons();
  }
});
