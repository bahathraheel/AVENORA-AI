import { buildApiUrl } from '../config/apiConfig.js';
import { auth, getFirebaseIdToken } from '../config/firebaseConfig.js';

export async function apiRequest(
  endpoint,
  { method = 'GET', body = undefined, requiresAuth = true, timeoutMs = 45000 } = {}
) {
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
      token = await getFirebaseIdToken(false);
      if (!token) {
        const authErr = new Error('Please sign in to continue.');
        authErr.status = 401;
        throw authErr;
      }
    }

    let res = await execute(token);

    if (res.status === 401 && requiresAuth && auth?.currentUser) {
      try {
        const freshToken = await auth.currentUser.getIdToken(true);
        if (freshToken) {
          res = await execute(freshToken);
        }
      } catch {
        // Fall through to standard 401 error handling
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
