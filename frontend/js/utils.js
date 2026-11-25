export function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function sanitizeHexColor(hex, fallback = '#14251C') {
  const clean = String(hex ?? '').trim().toUpperCase();
  return /^#[0-9A-F]{6}$/.test(clean) ? clean : fallback;
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
  if (Number.isNaN(parsed.getTime())) return String(dateStr);
  return parsed.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  });
}

export function getDaysUntil(dateStr, referenceDate = null) {
  if (!dateStr) return null;
  const target = new Date(`${dateStr}T00:00:00`);
  if (Number.isNaN(target.getTime())) return null;
  const now = referenceDate instanceof Date ? referenceDate : new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((target - today) / (1000 * 60 * 60 * 24));
}

export function detectTimelineConflicts(items) {
  const conflicts = new Set();
  if (!Array.isArray(items)) return conflicts;
  for (let i = 0; i < items.length; i++) {
    for (let j = i + 1; j < items.length; j++) {
      const a = items[i];
      const b = items[j];
      if (!a?.timeSlot || !b?.timeSlot) continue;
      if (a.timeSlot === b.timeSlot) {
        conflicts.add(a.id);
        conflicts.add(b.id);
      } else if (a.endTime && b.timeSlot < a.endTime && b.timeSlot >= a.timeSlot) {
        conflicts.add(a.id);
        conflicts.add(b.id);
      } else if (b.endTime && a.timeSlot < b.endTime && a.timeSlot >= b.timeSlot) {
        conflicts.add(a.id);
        conflicts.add(b.id);
      }
    }
  }
  return conflicts;
}
