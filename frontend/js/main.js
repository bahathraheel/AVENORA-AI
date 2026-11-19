import { createIcons, icons } from 'lucide';
import { apiRequest, clearStoredSession, getStoredSession } from './api.js';

export function renderIcons() {
  createIcons({ icons });
}

let activeProgressCount = 0;

export function startTopProgress() {
  activeProgressCount += 1;
  let bar = document.getElementById('avenora-top-progress');
  if (!bar) {
    bar = document.createElement('div');
    bar.id = 'avenora-top-progress';
    bar.className = 'avenora-top-progress';
    bar.setAttribute('aria-hidden', 'true');
    document.body.prepend(bar);
  }
  bar.classList.add('active');
}

export function finishTopProgress() {
  activeProgressCount = Math.max(0, activeProgressCount - 1);
  if (activeProgressCount === 0) {
    document.getElementById('avenora-top-progress')?.classList.remove('active');
  }
}

window.addEventListener('avenora:progress-start', startTopProgress);
window.addEventListener('avenora:progress-end', finishTopProgress);

export function setButtonLoading(btn, loading, loadingLabel = '') {
  if (!btn) return;
  if (loading) {
    if (!btn.dataset.originalHtml) {
      btn.dataset.originalHtml = btn.innerHTML;
    }
    btn.disabled = true;
    btn.classList.add('is-loading');
    const label = loadingLabel || btn.textContent.trim() || 'Working...';
    btn.innerHTML = `<span class="btn-spinner" aria-hidden="true"></span><span>${escapeHtml(label)}</span>`;
  } else {
    btn.disabled = false;
    btn.classList.remove('is-loading');
    if (btn.dataset.originalHtml) {
      btn.innerHTML = btn.dataset.originalHtml;
      delete btn.dataset.originalHtml;
      renderIcons();
    }
  }
}

export function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function formatCurrency(amount, currency = 'USD') {
  const num = Number(amount) || 0;
  try {
    return new Intl.NumberFormat(currency === 'INR' ? 'en-IN' : 'en-US', {
      style: 'currency',
      currency: currency || 'USD',
      maximumFractionDigits: 0
    }).format(num);
  } catch {
    return `${currency} ${num.toLocaleString()}`;
  }
}

export function formatDate(dateStr) {
  if (!dateStr) return 'Date TBD';
  const parsed = new Date(`${dateStr}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return dateStr;
  return parsed.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  });
}

export function getDaysUntil(dateStr) {
  if (!dateStr) return null;
  const target = new Date(`${dateStr}T00:00:00`);
  if (Number.isNaN(target.getTime())) return null;
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((target - today) / (1000 * 60 * 60 * 24));
}

export function showToast(message, type = 'info') {
  let region = document.getElementById('toast-region');
  if (!region) {
    region = document.createElement('div');
    region.id = 'toast-region';
    region.className = 'toast-region';
    region.setAttribute('aria-live', 'polite');
    document.body.appendChild(region);
  }
  const toast = document.createElement('div');
  toast.className = `toast ${type === 'error' ? 'toast-error' : type === 'success' ? 'toast-success' : ''}`;
  toast.innerHTML = `
    <span>${escapeHtml(message)}</span>
    <button type="button" class="btn btn-sm btn-secondary" style="min-height:28px;padding:4px 10px;" aria-label="Dismiss notification">Close</button>
  `;
  toast.querySelector('button').addEventListener('click', () => toast.remove());
  region.appendChild(toast);
  setTimeout(() => {
    if (toast.isConnected) toast.remove();
  }, 5200);
}

export async function copyToClipboard(text, label = 'Copied to clipboard') {
  try {
    await navigator.clipboard.writeText(text);
    showToast(label, 'success');
  } catch {
    showToast('Unable to copy automatically. Please select and copy manually.', 'error');
  }
}

export function openConfirmModal({ title, message, confirmLabel = 'Confirm', danger = true, onConfirm }) {
  let backdrop = document.getElementById('confirm-modal-backdrop');
  if (!backdrop) {
    backdrop = document.createElement('div');
    backdrop.id = 'confirm-modal-backdrop';
    backdrop.className = 'modal-backdrop';
    backdrop.innerHTML = `
      <div class="modal-panel" role="dialog" aria-modal="true" aria-labelledby="confirm-modal-title">
        <div class="modal-header">
          <h3 id="confirm-modal-title" style="font-size:24px;"></h3>
          <button type="button" class="btn btn-sm btn-ivory-outline" data-close-confirm>Close</button>
        </div>
        <p id="confirm-modal-message" class="text-muted-ivory"></p>
        <div class="modal-footer">
          <button type="button" class="btn btn-ivory-outline" data-close-confirm>Cancel</button>
          <button type="button" id="confirm-modal-ok" class="btn"></button>
        </div>
      </div>
    `;
    document.body.appendChild(backdrop);
  }

  backdrop.querySelector('#confirm-modal-title').textContent = title;
  backdrop.querySelector('#confirm-modal-message').textContent = message;
  const okBtn = backdrop.querySelector('#confirm-modal-ok');
  okBtn.textContent = confirmLabel;
  okBtn.className = `btn ${danger ? 'btn-danger-ivory' : 'btn-ivory-primary'}`;

  const close = () => backdrop.classList.remove('open');
  backdrop.querySelectorAll('[data-close-confirm]').forEach((btn) => {
    btn.onclick = close;
  });
  okBtn.onclick = async () => {
    okBtn.disabled = true;
    try {
      await onConfirm();
      close();
    } finally {
      okBtn.disabled = false;
    }
  };
  backdrop.classList.add('open');
}

export function getStoredEventId() {
  const params = new URLSearchParams(window.location.search);
  const fromQuery = params.get('eventId');
  if (fromQuery) {
    localStorage.setItem('avenora_active_event_id', fromQuery);
    return fromQuery;
  }
  return localStorage.getItem('avenora_active_event_id') || '';
}

export function setStoredEventId(eventId) {
  if (eventId) {
    localStorage.setItem('avenora_active_event_id', eventId);
  } else {
    localStorage.removeItem('avenora_active_event_id');
  }
}

export function signOutUser() {
  clearStoredSession();
  localStorage.removeItem('avenora_active_event_id');
  window.location.href = '/login.html';
}

const NAV_ITEMS = [
  { key: 'dashboard', label: 'Dashboard', href: '/dashboard.html', icon: 'layout-dashboard', group: 'Workspace' },
  { key: 'events', label: 'My Events', href: '/event.html?mode=list', icon: 'calendar-range', group: 'Workspace' },
  { key: 'creator', label: 'AI Event Creator', href: '/event.html?mode=create', icon: 'sparkles', group: 'Workspace' },
  { key: 'copilot', label: 'AI Co-Pilot', href: '/copilot.html', icon: 'message-square', group: 'Intelligence' },
  { key: 'blueprint', label: 'Event Blueprint', href: '/event.html', icon: 'file-text', group: 'Intelligence' },
  { key: 'theme', label: 'Theme Studio', href: '/theme-studio.html', icon: 'palette', group: 'Intelligence' },
  { key: 'budget', label: 'Budget', href: '/budget.html', icon: 'wallet', group: 'Operations' },
  { key: 'checklist', label: 'Checklist', href: '/checklist.html', icon: 'check-square', group: 'Operations' },
  { key: 'guests', label: 'Guests', href: '/guests.html', icon: 'users', group: 'Operations' },
  { key: 'vendors', label: 'Vendors', href: '/vendors.html', icon: 'briefcase', group: 'Operations' },
  { key: 'timeline', label: 'Timeline', href: '/timeline.html', icon: 'clock', group: 'Operations' },
  { key: 'settings', label: 'Settings', href: '/settings.html', icon: 'settings', group: 'Account' }
];

export function renderWorkspaceShell({ activeKey, pageTitle, events = [], activeEvent = null, userProfile = null, onEventSwitch }) {
  const sidebar = document.getElementById('workspace-sidebar');
  const topbar = document.getElementById('workspace-topbar');
  if (!sidebar || !topbar) return;

  const groups = ['Workspace', 'Intelligence', 'Operations', 'Account'];
  const eventQuery = activeEvent ? `?eventId=${encodeURIComponent(activeEvent.id)}` : '';

  sidebar.innerHTML = `
    <div class="sidebar-brand">
      <a href="/dashboard.html" class="brand-wordmark" style="font-size:21px;">AVENORA <span>AI</span></a>
      <button type="button" class="btn btn-sm btn-secondary mobile-menu-btn" id="close-sidebar-btn" aria-label="Close menu">
        <i data-lucide="x"></i>
      </button>
    </div>
    <div class="sidebar-event-switcher">
      <label class="field-label text-sage" for="global-event-select" style="display:block;margin-bottom:6px;font-size:12px;">Active Event Workspace</label>
      <select id="global-event-select" class="field-select field-select-dark" style="min-height:38px;font-size:13px;">
        ${
          events.length === 0
            ? '<option value="">No events created yet</option>'
            : events
                .map(
                  (ev) =>
                    `<option value="${escapeHtml(ev.id)}" ${activeEvent && ev.id === activeEvent.id ? 'selected' : ''}>${escapeHtml(ev.name)}</option>`
                )
                .join('')
        }
      </select>
    </div>
    <nav class="sidebar-nav" aria-label="Workspace navigation">
      ${groups
        .map((group) => {
          const items = NAV_ITEMS.filter((n) => n.group === group);
          return `
            <div class="sidebar-section-label">${group}</div>
            ${items
              .map((item) => {
                let targetHref = item.href;
                if (activeEvent && !item.href.includes('?')) {
                  targetHref = `${item.href}${eventQuery}`;
                }
                return `
                  <a href="${targetHref}" class="sidebar-link ${activeKey === item.key ? 'active' : ''}">
                    <i data-lucide="${item.icon}"></i>
                    <span>${item.label}</span>
                  </a>
                `;
              })
              .join('')}
          `;
        })
        .join('')}
    </nav>
    <div class="sidebar-footer">
      <div style="font-size:12.5px;color:rgba(245,243,237,0.72);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">
        ${escapeHtml(userProfile?.displayName || 'Planner')} · ${escapeHtml(userProfile?.preferredCurrency || 'USD')}
      </div>
      <button type="button" id="sidebar-logout-btn" class="btn btn-sm btn-secondary" style="width:100%;justify-content:flex-start;">
        <i data-lucide="log-out"></i>
        <span>Sign Out</span>
      </button>
    </div>
  `;

  topbar.innerHTML = `
    <div class="topbar-left">
      <button type="button" class="btn btn-sm btn-secondary mobile-menu-btn" id="open-sidebar-btn" aria-label="Open menu">
        <i data-lucide="menu"></i>
      </button>
      <div class="topbar-breadcrumb">
        <span>AVENORA AI</span>
        <span class="meta-sep" style="margin-inline:6px;">/</span>
        <strong style="color:var(--color-ivory);">${escapeHtml(pageTitle)}</strong>
        ${activeEvent ? `<span class="meta-sep" style="margin-inline:6px;">·</span><span class="text-sage">${escapeHtml(activeEvent.name)}</span>` : ''}
      </div>
    </div>
    <div class="topbar-actions">
      <a href="/event.html?mode=create" class="btn btn-sm btn-primary">
        <i data-lucide="plus"></i>
        <span>New Event</span>
      </a>
    </div>
  `;

  let backdrop = document.getElementById('sidebar-backdrop');
  if (!backdrop) {
    backdrop = document.createElement('div');
    backdrop.id = 'sidebar-backdrop';
    backdrop.className = 'sidebar-backdrop';
    document.body.appendChild(backdrop);
  }

  const toggleDrawer = (open) => {
    sidebar.classList.toggle('open', open);
    backdrop.classList.toggle('open', open);
  };

  topbar.querySelector('#open-sidebar-btn')?.addEventListener('click', () => toggleDrawer(true));
  sidebar.querySelector('#close-sidebar-btn')?.addEventListener('click', () => toggleDrawer(false));
  backdrop.onclick = () => toggleDrawer(false);

  sidebar.querySelector('#sidebar-logout-btn')?.addEventListener('click', () => {
    signOutUser();
  });

  sidebar.querySelector('#global-event-select')?.addEventListener('change', (e) => {
    const newId = e.target.value;
    if (!newId) return;
    setStoredEventId(newId);
    if (typeof onEventSwitch === 'function') {
      onEventSwitch(newId);
    } else {
      const url = new URL(window.location.href);
      url.searchParams.set('eventId', newId);
      window.location.href = url.toString();
    }
  });

  renderIcons();
}

export async function initProtectedPage({ activeKey, pageTitle, onReady, onEventSwitch }) {
  startTopProgress();

  const sidebarEl = document.getElementById('workspace-sidebar');
  if (sidebarEl && !sidebarEl.innerHTML.trim()) {
    sidebarEl.innerHTML = `
      <div class="sidebar-brand">
        <span class="brand-wordmark" style="font-size:21px;">AVENORA <span>AI</span></span>
      </div>
      <div class="sidebar-skeleton-group" aria-hidden="true">
        <div class="skeleton-line sm"></div>
        <div class="skeleton-line title" style="width:100%;height:38px;"></div>
        <div style="height:8px;"></div>
        <div class="skeleton-line sm"></div>
        <div class="skeleton-line w-80" style="height:34px;"></div>
        <div class="skeleton-line w-90" style="height:34px;"></div>
        <div class="skeleton-line w-65" style="height:34px;"></div>
        <div class="skeleton-line w-80" style="height:34px;"></div>
        <div class="skeleton-line w-90" style="height:34px;"></div>
      </div>
    `;
  }

  const session = getStoredSession();
  if (!session) {
    finishTopProgress();
    window.location.href = `/login.html?redirect=${encodeURIComponent(window.location.pathname + window.location.search)}`;
    return;
  }

  try {
    const [meRes, eventsRes] = await Promise.all([
      apiRequest('/api/auth/me'),
      apiRequest('/api/events')
    ]);

    const user = meRes.user;
    const profile = meRes.profile;
    const events = eventsRes.events || [];

    const storedId = getStoredEventId();
    const activeEvent = events.find((ev) => ev.id === storedId) || events[0] || null;
    if (activeEvent) {
      setStoredEventId(activeEvent.id);
    }

    renderWorkspaceShell({
      activeKey,
      pageTitle,
      events,
      activeEvent,
      userProfile: profile,
      onEventSwitch
    });

    await onReady({ user, profile, events, activeEvent });
    document.querySelector('.workspace-main')?.classList.add('workspace-hydrated');
    renderIcons();
  } catch (err) {
    console.error('Workspace initialization error:', err);
    if (err.status === 401) {
      clearStoredSession();
      window.location.href = `/login.html?redirect=${encodeURIComponent(window.location.pathname + window.location.search)}`;
      return;
    }
    showToast(err.message || 'Failed to load workspace data. Please refresh and try again.', 'error');
  } finally {
    finishTopProgress();
  }
}

export function renderNoEventState(container, heading = 'No Active Event Yet') {
  container.innerHTML = `
    <div class="surface-ivory panel-pad">
      <div class="empty-state">
        <i data-lucide="calendar-plus" style="width:36px;height:36px;color:var(--color-forest-rich);"></i>
        <h2 style="font-size:28px;">${escapeHtml(heading)}</h2>
        <p class="text-muted-ivory" style="max-width:48ch;">
          Create your first event with the 9-step AVENORA AI Creator to unlock personalized blueprints, budgets, tasks, guest rosters, and Theme Studio concepts.
        </p>
        <a href="/event.html?mode=create" class="btn btn-ivory-primary">Launch AI Event Creator</a>
      </div>
    </div>
  `;
  renderIcons();
}
