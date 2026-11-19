import { buildApiUrl } from '../config/apiConfig.js';

const SESSION_STORAGE_KEY = 'avenora_session_v1';

export function getStoredSession() {
  try {
    const raw = localStorage.getItem(SESSION_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || !parsed.idToken) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function setStoredSession(sessionData) {
  if (!sessionData || !sessionData.idToken) {
    localStorage.removeItem(SESSION_STORAGE_KEY);
    return;
  }
  const expiresInSec = Number(sessionData.expiresIn) || 3600;
  const payload = {
    idToken: sessionData.idToken,
    refreshToken: sessionData.refreshToken || '',
    expiresAt: Date.now() + Math.max(60, expiresInSec - 60) * 1000,
    user: sessionData.user || null
  };
  localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(payload));
}

export function clearStoredSession() {
  localStorage.removeItem(SESSION_STORAGE_KEY);
}

let refreshInFlight = null;

export async function refreshAuthSession() {
  if (refreshInFlight) return refreshInFlight;

  refreshInFlight = (async () => {
    const session = getStoredSession();
    if (!session?.refreshToken) {
      clearStoredSession();
      throw new Error('Session expired. Please sign in again.');
    }

    const res = await fetch(buildApiUrl('/api/auth/refresh'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken: session.refreshToken })
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.idToken) {
      clearStoredSession();
      throw new Error(data.error || 'Session expired. Please sign in again.');
    }

    setStoredSession({
      ...session,
      idToken: data.idToken,
      refreshToken: data.refreshToken || session.refreshToken,
      expiresIn: data.expiresIn || 3600
    });
    return data.idToken;
  })();

  try {
    return await refreshInFlight;
  } finally {
    refreshInFlight = null;
  }
}

async function getValidAccessToken() {
  const session = getStoredSession();
  if (!session) return '';
  if (session.expiresAt && Date.now() >= session.expiresAt && session.refreshToken) {
    try {
      return await refreshAuthSession();
    } catch {
      return '';
    }
  }
  return session.idToken;
}

export async function apiRequest(endpoint, { method = 'GET', body = undefined, requiresAuth = true, timeoutMs = 45000 } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  const execute = async (token) => {
    const headers = {};
    if (body !== undefined) {
      headers['Content-Type'] = 'application/json';
    }
    if (requiresAuth && token) {
      headers.Authorization = `Bearer ${token}`;
    }

    return fetch(buildApiUrl(endpoint), {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal: controller.signal
    });
  };

  try {
    let token = '';
    if (requiresAuth) {
      token = await getValidAccessToken();
      if (!token) {
        const authErr = new Error('Please sign in to continue.');
        authErr.status = 401;
        throw authErr;
      }
    }

    let res = await execute(token);

    if (res.status === 401 && requiresAuth && getStoredSession()?.refreshToken) {
      try {
        const freshToken = await refreshAuthSession();
        res = await execute(freshToken);
      } catch {
        clearStoredSession();
      }
    }

    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const err = new Error(data.error || `Request failed (${res.status}).`);
      err.status = res.status;
      err.code = data.code || '';
      throw err;
    }

    return data;
  } catch (err) {
    if (err.name === 'AbortError') {
      throw new Error('Request timed out while contacting the AVENORA AI backend. Please try again.');
    }
    if (err instanceof TypeError && String(err.message).toLowerCase().includes('fetch')) {
      throw new Error('Unable to reach the AVENORA AI backend server. Check your internet connection or API configuration.');
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

export async function callAiEndpoint(endpoint, payload) {
  window.dispatchEvent(new CustomEvent('avenora:progress-start'));
  try {
    return await apiRequest(endpoint, {
      method: 'POST',
      body: payload,
      requiresAuth: true,
      timeoutMs: 90000
    });
  } finally {
    window.dispatchEvent(new CustomEvent('avenora:progress-end'));
  }
}
