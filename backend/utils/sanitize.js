export const ALLOWED_BLUEPRINT_KEYS = [
  'overview',
  'concept',
  'themeRecommendations',
  'venueRequirements',
  'schedule',
  'budgetAllocation',
  'priorityChecklist',
  'decorationIdeas',
  'cateringSuggestions',
  'guestExperienceIdeas',
  'vendorCategories',
  'planningTimeline',
  'riskManagement',
  'contingencySuggestions',
  'personalizedRecommendations',
  'nextSteps'
];

const UNSAFE_OBJECT_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

export function sanitizeText(value, maxLen = 1500) {
  if (typeof value !== 'string') return '';
  return value
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
    .trim()
    .slice(0, maxLen);
}

export function sanitizePositiveNumber(value, fallback = 0, max = 1000000000) {
  if (value === '' || value === null || value === undefined) return fallback;
  const num = Number(value);
  if (!Number.isFinite(num) || num < 0) return fallback;
  return Math.min(num, max);
}

export function clampInt(value, min = 0, max = 100000, fallback = min) {
  if (value === '' || value === null || value === undefined) return fallback;
  const num = Number(value);
  if (!Number.isFinite(num)) return fallback;
  return Math.min(max, Math.max(min, Math.round(num)));
}

export function sanitizeEnum(value, allowedValues, fallback) {
  const clean = sanitizeText(String(value ?? ''), 64);
  return allowedValues.includes(clean) ? clean : fallback;
}

export function sanitizeId(value, maxLen = 128) {
  const clean = sanitizeText(String(value ?? ''), maxLen);
  if (!clean || !/^[a-zA-Z0-9_-]{1,128}$/.test(clean)) {
    return '';
  }
  return clean;
}

export function sanitizeIsoDate(value, maxLen = 32) {
  const clean = sanitizeText(String(value ?? ''), maxLen);
  if (!clean) return '';
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(clean);
  if (!match) return '';

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const parsed = new Date(Date.UTC(year, month - 1, day));

  if (
    parsed.getUTCFullYear() !== year ||
    parsed.getUTCMonth() !== month - 1 ||
    parsed.getUTCDate() !== day
  ) {
    return '';
  }
  return clean;
}

export function sanitizeHexColor(value, fallback = '') {
  const clean = sanitizeText(String(value ?? ''), 16).toUpperCase();
  if (/^#[0-9A-F]{6}$/.test(clean)) return clean;
  return fallback;
}

export function stripPrototypeKeys(value, depth = 0) {
  if (depth > 8 || value === null || value === undefined) return value;
  if (typeof value === 'string') return sanitizeText(value, 4000);
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  if (typeof value === 'boolean') return value;
  if (Array.isArray(value)) {
    return value.slice(0, 100).map((item) => stripPrototypeKeys(item, depth + 1));
  }
  if (typeof value === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(value)) {
      if (UNSAFE_OBJECT_KEYS.has(k)) continue;
      const safeKey = sanitizeText(k, 80);
      if (!safeKey) continue;
      out[safeKey] = stripPrototypeKeys(v, depth + 1);
    }
    return out;
  }
  return '';
}

export function sanitizeBlueprint(rawBlueprint) {
  if (!rawBlueprint || typeof rawBlueprint !== 'object' || Array.isArray(rawBlueprint)) {
    const err = new Error('Blueprint payload must be an object.');
    err.statusCode = 400;
    throw err;
  }

  const sanitized = {};
  for (const key of ALLOWED_BLUEPRINT_KEYS) {
    if (key in rawBlueprint && rawBlueprint[key] !== undefined) {
      sanitized[key] = stripPrototypeKeys(rawBlueprint[key], 0);
    }
  }

  if (JSON.stringify(sanitized).length > 150000) {
    const err = new Error('Blueprint payload exceeds maximum allowed size.');
    err.statusCode = 400;
    throw err;
  }

  return sanitized;
}

export function sanitizeMoodboardSpecs(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const colorRoles = Array.isArray(raw.colorRoles)
    ? raw.colorRoles.slice(0, 8).map((r) => ({
        hex: sanitizeHexColor(r?.hex, '#14251C'),
        name: sanitizeText(r?.name || '', 80),
        usage: sanitizeText(r?.usage || '', 240)
      }))
    : [];
  const moodboardPanels = Array.isArray(raw.moodboardPanels)
    ? raw.moodboardPanels.slice(0, 6).map((p) => ({
        zone: sanitizeText(p?.zone || '', 120),
        visualBrief: sanitizeText(p?.visualBrief || '', 500),
        keyElements: sanitizeText(p?.keyElements || '', 300)
      }))
    : [];
  return { colorRoles, moodboardPanels };
}

export function serializeFirestoreValue(val) {
  if (val === null || val === undefined) return val;
  if (typeof val?.toDate === 'function') {
    const d = val.toDate();
    return {
      iso: d.toISOString(),
      seconds: Math.floor(d.getTime() / 1000),
      nanoseconds: (d.getTime() % 1000) * 1000000
    };
  }
  if (typeof val === 'object' && typeof val._seconds === 'number') {
    return {
      iso: new Date(val._seconds * 1000).toISOString(),
      seconds: val._seconds,
      nanoseconds: val._nanoseconds || 0
    };
  }
  if (Array.isArray(val)) {
    return val.map(serializeFirestoreValue);
  }
  if (typeof val === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(val)) {
      if (UNSAFE_OBJECT_KEYS.has(k)) continue;
      out[k] = serializeFirestoreValue(v);
    }
    return out;
  }
  return val;
}
