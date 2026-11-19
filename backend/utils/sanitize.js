export function sanitizeText(value, maxLen = 1500) {
  if (typeof value !== 'string') return '';
  return value
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
    .trim()
    .slice(0, maxLen);
}

export function sanitizePositiveNumber(value, fallback = 0, max = 1000000000) {
  const num = Number(value);
  if (!Number.isFinite(num) || num < 0) return fallback;
  return Math.min(num, max);
}

export function clampInt(value, min = 0, max = 100000, fallback = min) {
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
  if (/^\d{4}-\d{2}-\d{2}$/.test(clean)) return clean;
  return clean.slice(0, maxLen);
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
      out[k] = serializeFirestoreValue(v);
    }
    return out;
  }
  return val;
}
