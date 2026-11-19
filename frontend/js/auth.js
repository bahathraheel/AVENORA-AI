import { apiRequest, getStoredSession, setStoredSession } from './api.js';
import { renderIcons, setButtonLoading, showToast } from './main.js';

function getPostAuthRedirect() {
  const params = new URLSearchParams(window.location.search);
  const redirect = params.get('redirect');
  if (redirect && redirect.startsWith('/') && !redirect.startsWith('//')) {
    return redirect;
  }
  return '/dashboard.html';
}

async function handleOAuthHashReturn(showAuthMessage) {
  const rawHash = window.location.hash || '';
  if (!rawHash || rawHash.length < 2) return false;

  const hashParams = new URLSearchParams(rawHash.slice(1));
  const oauthError = hashParams.get('oauth_error');
  const oauthTicket = hashParams.get('oauth_ticket');

  if (!oauthError && !oauthTicket) return false;

  // Strip sensitive OAuth parameters from URL immediately
  window.history.replaceState(null, '', window.location.pathname + window.location.search);

  if (oauthError) {
    showAuthMessage(oauthError, true);
    return true;
  }

  if (oauthTicket) {
    showAuthMessage('Completing Google sign-in...', false);
    try {
      const data = await apiRequest('/api/auth/google/complete', {
        method: 'POST',
        body: { ticket: oauthTicket },
        requiresAuth: false
      });
      setStoredSession(data);
      window.location.href = data.redirectPath || getPostAuthRedirect();
      return true;
    } catch (err) {
      showAuthMessage(err.message || 'Google sign-in could not be completed. Please try again.', true);
      return true;
    }
  }
  return false;
}

async function initAuthPages() {
  renderIcons();

  const statusBanner = document.getElementById('auth-status-banner');
  const showAuthMessage = (msg, isError = true) => {
    if (!statusBanner) return;
    statusBanner.style.display = 'block';
    statusBanner.textContent = msg;
    statusBanner.className = isError ? 'auth-alert auth-alert-error' : 'auth-alert auth-alert-success';
  };

  const handledHash = await handleOAuthHashReturn(showAuthMessage);
  if (handledHash) return;

  // If a stored session is already valid, verify silently and proceed to dashboard
  const existingSession = getStoredSession();
  if (existingSession) {
    try {
      await apiRequest('/api/auth/me');
      window.location.href = getPostAuthRedirect();
      return;
    } catch {
      // Token invalid/expired; stay on auth page cleanly
    }
  }

  const googleBtn = document.getElementById('google-auth-btn');
  if (googleBtn) {
    googleBtn.addEventListener('click', async () => {
      setButtonLoading(googleBtn, true, 'Redirecting to Google...');
      try {
        const res = await apiRequest('/api/auth/google/init', {
          method: 'POST',
          body: {
            origin: window.location.origin,
            redirectPath: getPostAuthRedirect()
          },
          requiresAuth: false,
          timeoutMs: 15000
        });
        if (!res.authUrl) {
          throw new Error('Google sign-in URL was not returned by backend.');
        }
        window.location.assign(res.authUrl);
      } catch (err) {
        showAuthMessage(err.message || 'Unable to connect to Google Sign-In.', true);
        setButtonLoading(googleBtn, false);
      }
    });
  }

  const loginForm = document.getElementById('login-form');
  if (loginForm) {
    loginForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const email = document.getElementById('login-email').value.trim();
      const password = document.getElementById('login-password').value;
      const submitBtn = document.getElementById('login-submit-btn');

      if (!email || !password) {
        showAuthMessage('Please enter both your email and password.');
        return;
      }

      setButtonLoading(submitBtn, true, 'Signing in...');
      try {
        const data = await apiRequest('/api/auth/login', {
          method: 'POST',
          body: { email, password },
          requiresAuth: false
        });
        setStoredSession(data);
        window.location.href = getPostAuthRedirect();
      } catch (err) {
        showAuthMessage(err.message || 'Sign in failed. Please try again.', true);
        setButtonLoading(submitBtn, false);
      }
    });

    const resetBtn = document.getElementById('reset-password-btn');
    resetBtn?.addEventListener('click', async () => {
      const email = document.getElementById('login-email').value.trim();
      if (!email) {
        showAuthMessage('Enter your email address above first, then click Reset Password.');
        return;
      }
      resetBtn.disabled = true;
      try {
        const res = await apiRequest('/api/auth/reset-password', {
          method: 'POST',
          body: { email },
          requiresAuth: false
        });
        showAuthMessage(res.message || `Password reset instructions sent to ${email}.`, false);
        showToast('Password reset email dispatched.', 'success');
      } catch (err) {
        showAuthMessage(err.message || 'Unable to send reset email.', true);
      } finally {
        resetBtn.disabled = false;
      }
    });
  }

  const signupForm = document.getElementById('signup-form');
  if (signupForm) {
    signupForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const displayName = document.getElementById('signup-name').value.trim();
      const email = document.getElementById('signup-email').value.trim();
      const password = document.getElementById('signup-password').value;
      const confirm = document.getElementById('signup-confirm').value;
      const submitBtn = document.getElementById('signup-submit-btn');

      if (!displayName || !email || password.length < 6) {
        showAuthMessage('Please enter your name, a valid email, and a password of at least 6 characters.');
        return;
      }
      if (password !== confirm) {
        showAuthMessage('Passwords do not match.');
        return;
      }

      setButtonLoading(submitBtn, true, 'Creating account...');
      try {
        const data = await apiRequest('/api/auth/register', {
          method: 'POST',
          body: { displayName, email, password },
          requiresAuth: false
        });
        setStoredSession(data);
        window.location.href = '/dashboard.html';
      } catch (err) {
        showAuthMessage(err.message || 'Account creation failed. Please try again.', true);
        setButtonLoading(submitBtn, false);
      }
    });
  }
}

initAuthPages();
