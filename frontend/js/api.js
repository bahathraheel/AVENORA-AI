import { buildApiUrl } from '../config/apiConfig.js';
import { auth, getFirebaseIdToken } from '../config/firebaseConfig.js';

const inFlightGets = new Map();
const recentGetCache = new Map();
const GET_CACHE_TTL_MS = 2500;

export function clearApiCache() {
  inFlightGets.clear();
  recentGetCache.clear();
}

export async function apiRequest(
  endpoint,
  { method = 'GET', body = undefined, requiresAuth = true, timeoutMs = 45000, skipCache = false } = {}
) {
  const upperMethod = String(method || 'GET').toUpperCase();
  const fullUrl = buildApiUrl(endpoint);

  if (upperMethod !== 'GET') {
    clearApiCache();
  } else if (!skipCache) {
    const cached = recentGetCache.get(fullUrl);
    if (cached && Date.now() - cached.ts < GET_CACHE_TTL_MS) {
      return structuredClone(cached.data);
    }
    if (inFlightGets.has(fullUrl)) {
      return structuredClone(await inFlightGets.get(fullUrl));
    }
  }

  const runRequest = async () => {
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

      return fetch(fullUrl, {
        method: upperMethod,
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

      if (upperMethod === 'GET' && !skipCache) {
        recentGetCache.set(fullUrl, { data: structuredClone(data), ts: Date.now() });
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
  };

  if (upperMethod === 'GET' && !skipCache) {
    const promise = runRequest().finally(() => inFlightGets.delete(fullUrl));
    inFlightGets.set(fullUrl, promise);
    return structuredClone(await promise);
  }

  return runRequest();
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
