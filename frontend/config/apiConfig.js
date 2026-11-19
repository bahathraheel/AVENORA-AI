/**
 * Centralized Backend API Configuration for AVENORA AI Frontend (Vercel)
 *
 * Resolution priority:
 * 1. Explicit runtime override (`window.__AVENORA_API_URL__`)
 * 2. Build-time environment variable (`VITE_API_BASE_URL`, e.g. for local dev)
 * 3. Configured production Render backend URL (`https://avenora-ai.onrender.com`)
 */
const PRODUCTION_RENDER_BACKEND_URL = 'https://avenora-ai.onrender.com';

function normalizeBaseUrl(raw) {
  return String(raw || '')
    .trim()
    .replace(/\/+$/, '');
}

const envApiBase =
  typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.VITE_API_BASE_URL
    ? import.meta.env.VITE_API_BASE_URL
    : '';

const runtimeApiBase =
  typeof window !== 'undefined' && window.__AVENORA_API_URL__
    ? window.__AVENORA_API_URL__
    : '';

export const API_BASE_URL = normalizeBaseUrl(
  runtimeApiBase || envApiBase || PRODUCTION_RENDER_BACKEND_URL
);

export function buildApiUrl(endpoint) {
  const path = String(endpoint || '').startsWith('/') ? String(endpoint) : `/${String(endpoint || '')}`;
  return `${API_BASE_URL}${path}`;
}
