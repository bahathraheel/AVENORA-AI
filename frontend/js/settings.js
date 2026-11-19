import { apiRequest } from './api.js';
import {
  escapeHtml,
  initProtectedPage,
  renderIcons,
  setButtonLoading,
  showToast,
  signOutUser
} from './main.js';

const CURRENCIES = ['USD', 'INR', 'EUR', 'GBP', 'AED', 'SGD', 'AUD', 'CAD'];

initProtectedPage({
  activeKey: 'settings',
  pageTitle: 'Settings & Profile',
  onReady: async ({ user, profile, events }) => {
    const root = document.getElementById('settings-root');
    if (!root) return;

    root.innerHTML = `
      <section class="surface-forest panel-pad" style="margin-bottom:20px;">
        <h1 style="font-size:34px;">Account Settings & Preferences</h1>
        <p class="text-muted-dark" style="font-size:14px;">Manage your planner profile, currency defaults, security, and exported event data.</p>
      </section>

      <div class="dashboard-split">
        <div class="surface-ivory panel-pad">
          <h2 style="font-size:24px;margin-bottom:16px;">Profile & Preferences</h2>
          <form id="settings-form" style="display:flex;flex-direction:column;gap:14px;">
            <div class="field-group">
              <label class="field-label" for="set-name">Display Name</label>
              <input id="set-name" class="field-input" required maxlength="120" value="${escapeHtml(profile?.displayName || user.displayName || '')}" />
            </div>
            <div class="field-group">
              <label class="field-label" for="set-email">Account Email</label>
              <input id="set-email" class="field-input" disabled value="${escapeHtml(user.email || '')}" />
            </div>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
              <div class="field-group">
                <label class="field-label" for="set-currency">Default Currency</label>
                <select id="set-currency" class="field-select">
                  ${CURRENCIES.map((c) => `<option value="${c}" ${profile?.preferredCurrency === c ? 'selected' : ''}>${c}</option>`).join('')}
                </select>
              </div>
              <div class="field-group">
                <label class="field-label" for="set-role">Planner Role / Studio Note</label>
                <input id="set-role" class="field-input" maxlength="120" placeholder="e.g., Host, Lead Coordinator" value="${escapeHtml(profile?.roleNote || '')}" />
              </div>
            </div>

            <div style="padding-top:8px;border-top:var(--border-ivory);display:flex;flex-direction:column;gap:10px;">
              <strong style="font-size:14px;">Notification Preferences</strong>
              <label style="display:flex;align-items:center;gap:10px;cursor:pointer;">
                <input type="checkbox" id="set-notif" ${profile?.notificationsEnabled !== false ? 'checked' : ''} />
                <span>Enable workspace notifications</span>
              </label>
              <label style="display:flex;align-items:center;gap:10px;cursor:pointer;">
                <input type="checkbox" id="set-deadlines" ${profile?.deadlineReminders !== false ? 'checked' : ''} />
                <span>Show upcoming checklist deadline alerts</span>
              </label>
              <label style="display:flex;align-items:center;gap:10px;cursor:pointer;">
                <input type="checkbox" id="set-digest" ${profile?.aiDigestEnabled !== false ? 'checked' : ''} />
                <span>Include AI planning digest suggestions</span>
              </label>
            </div>

            <div style="margin-top:8px;">
              <button type="submit" id="save-settings-btn" class="btn btn-ivory-primary">Save Settings</button>
            </div>
          </form>
        </div>

        <div class="module-stack">
          <div class="surface-ivory panel-pad">
            <h2 style="font-size:24px;margin-bottom:12px;">Security & Password</h2>
            <p class="text-muted-ivory" style="font-size:13.5px;margin-bottom:14px;">
              Email verification status: <strong>${user.emailVerified ? 'Verified' : 'Unverified'}</strong>
            </p>
            <div style="display:flex;gap:10px;flex-wrap:wrap;">
              <button type="button" id="send-reset-btn" class="btn btn-ivory-outline">Send Password Reset Email</button>
              ${
                !user.emailVerified
                  ? `<button type="button" id="resend-verify-btn" class="btn btn-ivory-outline">Resend Verification Email</button>`
                  : ''
              }
            </div>
          </div>

          <div class="surface-ivory panel-pad">
            <h2 style="font-size:24px;margin-bottom:12px;">User Data Management</h2>
            <p class="text-muted-ivory" style="font-size:13.5px;margin-bottom:14px;">
              Export all ${events.length} saved event workspace(s) and subcollections as a JSON archive, or sign out of your session.
            </p>
            <div style="display:flex;gap:10px;flex-wrap:wrap;">
              <button type="button" id="export-data-btn" class="btn btn-ivory-primary">Export All Event Data (JSON)</button>
              <button type="button" id="settings-signout-btn" class="btn btn-danger-ivory">Sign Out</button>
            </div>
          </div>
        </div>
      </div>
    `;

    document.getElementById('settings-form').onsubmit = async (e) => {
      e.preventDefault();
      const displayName = document.getElementById('set-name').value.trim();
      if (!displayName) {
        showToast('Display name cannot be empty.', 'error');
        return;
      }
      const saveBtn = document.getElementById('save-settings-btn');
      setButtonLoading(saveBtn, true, 'Saving...');
      try {
        await apiRequest('/api/users/me', {
          method: 'PUT',
          body: {
            displayName,
            preferredCurrency: document.getElementById('set-currency').value,
            roleNote: document.getElementById('set-role').value.trim(),
            notificationsEnabled: document.getElementById('set-notif').checked,
            deadlineReminders: document.getElementById('set-deadlines').checked,
            aiDigestEnabled: document.getElementById('set-digest').checked
          }
        });
        showToast('Profile settings saved.', 'success');
      } catch (err) {
        showToast(err.message, 'error');
      } finally {
        setButtonLoading(saveBtn, false);
      }
    };

    document.getElementById('send-reset-btn').onclick = async () => {
      if (!user.email) return;
      try {
        await apiRequest('/api/auth/reset-password', {
          method: 'POST',
          body: { email: user.email },
          requiresAuth: false
        });
        showToast(`Password reset link sent to ${user.email}.`, 'success');
      } catch (err) {
        showToast(err.message, 'error');
      }
    };

    document.getElementById('resend-verify-btn')?.addEventListener('click', async () => {
      try {
        await apiRequest('/api/auth/resend-verification', { method: 'POST' });
        showToast(`Verification link sent to ${user.email}.`, 'success');
      } catch (err) {
        showToast(err.message, 'error');
      }
    });

    document.getElementById('export-data-btn').onclick = async () => {
      const btn = document.getElementById('export-data-btn');
      setButtonLoading(btn, true, 'Preparing Export...');
      try {
        const archive = await apiRequest('/api/users/export');
        const blob = new Blob([JSON.stringify(archive, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `avenora-ai-export-${new Date().toISOString().slice(0, 10)}.json`;
        a.click();
        URL.revokeObjectURL(url);
        showToast('Data export downloaded.', 'success');
      } catch (err) {
        showToast(err.message, 'error');
      } finally {
        setButtonLoading(btn, false);
      }
    };

    document.getElementById('settings-signout-btn').onclick = () => {
      signOutUser();
    };

    renderIcons();
  }
});
